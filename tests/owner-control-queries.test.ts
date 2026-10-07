import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderOwnerControlAction } from "../app/owner-control/commands.server";

import { type OwnerControlAction } from "../app/owner-control/model";

import {
  findShops,
  readBilling,
  readDashboard,
  readErrors,
  readHealth,
  readIssues,
  readNotificationStatus,
  readPerformance,
  readShops,
  readTrials,
} from "../app/owner-control/queries.server";

import { readShopifyPlans, SHOPIFY_PLAN_QUERY } from "../app/owner-control/shopify-plans.server";

import { NOW, shopFixture, growthResponse } from "./support/owner-control";
import { controlConfig, insertStore, resetOwnerControl } from "./support/owner-control-db";

beforeEach(resetOwnerControl);

describe("query D1 e run-rate", () => {
  test("include gli errori etichette nei contatori e nei filtri senza contare le conferme guidate", async () => {
    await insertStore(1, "labels-error.myshopify.com");
    await insertStore(2, "labels-guided.myshopify.com");
    await insertStore(3, "labels-off.myshopify.com");
    await env.DB.batch([
      env.DB.prepare(`UPDATE app_state SET checkout_labels_mode = 'partial',
        checkout_labels_last_error_code = 'checkout_labels_partial_sync' WHERE shop_id = 1`),
      env.DB.prepare(`UPDATE app_state SET checkout_labels_mode = 'guided',
        checkout_labels_last_error_code = 'checkout_labels_confirmation_pending' WHERE shop_id = 2`),
      env.DB.prepare(`UPDATE app_state SET checkout_labels_mode = 'off',
        checkout_labels_last_error_code = 'checkout_labels_partial_sync' WHERE shop_id = 3`),
    ]);
    expect(await readDashboard(env.DB)).toMatchObject({ shops_with_error: 1 });
    expect(await readIssues(env.DB)).toMatchObject({ stores: { count: 1 } });
    expect(await readErrors(env.DB)).toContainEqual(
      expect.objectContaining({ error_code: "checkout_labels_partial_sync", count: 1 }),
    );
    expect(await readShops(env.DB, "issues", 0)).toMatchObject({
      count: 1,
      shops: [{ checkout_labels_last_error_code: "checkout_labels_partial_sync" }],
    });
  });

  test("legge i piani Shopify senza bloccare gli altri store per un errore", async () => {
    const shops = [
      shopFixture({ id: 1, shop_domain: "store-1.myshopify.com" }),
      shopFixture({ id: 2, shop_domain: "store-2.myshopify.com" }),
      shopFixture({ id: 3, shop_domain: "store-3.myshopify.com" }),
      shopFixture({ id: 4, installation_status: "uninstalled" }),
    ];
    const adminForShop = vi.fn(async (shopDomain: string) => {
      if (shopDomain === "store-2.myshopify.com") throw new Error("sessione non disponibile");
      return {
        graphql: vi.fn(async (query: string) => {
          expect(query).toBe(SHOPIFY_PLAN_QUERY);
          return shopDomain === "store-3.myshopify.com"
            ? Response.json({ errors: [{ message: "errore" }] })
            : Response.json({ data: { shop: { plan: { publicDisplayName: "Plus" } } } });
        }),
      };
    });

    expect(await readShopifyPlans(shops, adminForShop)).toEqual([
      { shopId: 1, plan: "Plus" },
      { shopId: 2, plan: null },
      { shopId: 3, plan: null },
      { shopId: 4, plan: null },
    ]);
    expect(adminForShop).toHaveBeenCalledTimes(3);
  });

  test("normalizza timestamp ISO nelle soglie e nelle finestre statistiche", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO owner_notifications
           (dedupe_key, notification_kind, shop_domain, subject, body_text,
            source_occurred_at, status, available_at, sent_at, created_at, updated_at)
         VALUES
           ('stale-same-day', 'operational', NULL, 'A', 'A',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('stale-boundary', 'operational', NULL, 'B', 'B',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('stale-midnight', 'operational', NULL, 'C', 'C',
            strftime('%Y-%m-%dT00:00:00.000Z', 'now', '-1 day'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT00:00:00.000Z', 'now', '-1 day'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('sent-window', 'operational', NULL, 'D', 'D',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'), 'sent',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      ),
      env.DB.prepare(
        `INSERT INTO app_events (event_name, event_class, occurred_at)
         VALUES ('iso_same_day_error', 'error', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
         VALUES ('iso-boundary-webhook', 'APP_UNINSTALLED', 'processing',
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'))`,
      ),
    ]);

    expect(await readIssues(env.DB)).toMatchObject({
      notifications: { stale: 3 },
      webhooks: { stale: 1 },
    });
    expect(await readNotificationStatus(env.DB)).toMatchObject({ sent_7d: 1 });
    expect(await readErrors(env.DB)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: "iso_same_day_error", count: 1 }),
      ]),
    );
  });

  test("calcola dashboard, filtri e run-rate dal catalogo canonico", async () => {
    await insertStore(1, "mensile.myshopify.com", {
      onboarding: "completed",
      validation: 1,
      plan: ["active", "monthly", "balanced"],
      country: "IT",
    });
    await insertStore(2, "annuale.myshopify.com", {
      validation: 1,
      plan: ["active", "annual", "launch"],
    });
    await insertStore(3, "unico.myshopify.com", {
      plan: ["active", "one_time", "balanced"],
      country: "IT",
    });
    await insertStore(4, "ending.myshopify.com", {
      error: "sync_failed",
      plan: ["ending", "monthly", "balanced"],
    });
    await insertStore(5, "omaggio.myshopify.com", { complimentary: true });
    await insertStore(6, "trial.myshopify.com", { trial: true });
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE billing_accounts
            SET shopify_charge_gid = 'gid://shopify/AppSubscription/monthly',
                current_period_start = date('now', '-1 day'),
                sale_observed_at = datetime('now'),
                sale_checked_at = datetime('now'),
                sale_charge_gid = 'gid://shopify/AppSubscription/monthly',
                sale_cycle_start = date('now', '-1 day')
          WHERE shop_id = 1`,
      ),
      env.DB.prepare(
        `UPDATE billing_accounts
            SET shopify_charge_gid = 'gid://shopify/AppSubscription/annual',
                current_period_start = date('now', '-1 day'),
                sale_checked_at = datetime('now')
          WHERE shop_id = 2`,
      ),
      env.DB.prepare(
        `UPDATE billing_accounts
            SET shopify_charge_gid = 'gid://shopify/AppPurchaseOneTime/1',
                sale_observed_at = datetime('now'),
                sale_checked_at = datetime('now'),
                sale_charge_gid = 'gid://shopify/AppPurchaseOneTime/1'
          WHERE shop_id = 3`,
      ),
      env.DB.prepare(
        `UPDATE billing_accounts
            SET shopify_charge_gid = 'gid://shopify/AppSubscription/trial',
                current_period_start = NULL,
                sale_checked_at = datetime('now')
          WHERE shop_id = 4`,
      ),
    ]);

    const dashboard = await readDashboard(env.DB);
    expect(dashboard).toMatchObject({
      active_shops: 6,
      onboarding_completed: 1,
      validation_active: 2,
      shops_with_error: 1,
      trials_active: 1,
      monthly: 1,
      annual: 1,
      one_time: 1,
      complimentary: 1,
      ending: 1,
    });

    const billing = await readBilling(env.DB);
    expect(billing.status).toMatchObject({
      total: 6,
      monthly: 1,
      annual: 1,
      one_time: 1,
      ending: 1,
      complimentary: 1,
      trial: 1,
    });
    expect(billing.mrr).toBeCloseTo(3.99 + 29.9 / 12, 8);
    expect(billing.arr).toBeCloseTo(3.99 * 12 + 29.9, 8);
    // Mensile italiano: 2,9% di elaborazione e 3% regolamentare; annuale senza Paese: solo 2,9%.
    expect(billing.netMrr).toBeCloseTo(3.99 * 0.941 + (29.9 / 12) * 0.971, 8);
    expect(billing.netArr).toBeCloseTo(3.99 * 12 * 0.941 + 29.9 * 0.971, 8);
    expect(billing.regulatoryUnknown).toBe(1);
    expect(billing.reconciliation).toMatchObject({
      paid: 4,
      matched: 2,
      awaiting: 1,
      notDue: 1,
      needsReview: 0,
    });
    expect(billing.shopifyFees).toEqual({
      revenueShare: 0,
      processing: 0.029,
      regulatoryOperating: { IT: 0.03 },
    });
    expect((await readShops(env.DB, "paid", 0)).count).toBe(4);
    expect((await readShops(env.DB, "issues", 0)).shops.map((shop) => shop.id)).toEqual([4]);
    expect((await readTrials(env.DB, 0)).count).toBe(1);
    expect((await findShops(env.DB, "mensile")).map((shop) => shop.id)).toEqual([1]);
  });

  test("esclude gli addebiti test da dashboard, filtri paid e run-rate", async () => {
    await insertStore(1, "test-billing.myshopify.com", {
      plan: ["active", "monthly", "balanced"],
    });
    await env.DB.prepare("UPDATE billing_accounts SET is_test = 1 WHERE shop_id = 1").run();

    expect(await readDashboard(env.DB)).toMatchObject({ monthly: 0, annual: 0, one_time: 0 });
    expect(await readBilling(env.DB)).toMatchObject({
      status: { total: 1, monthly: 0, trial_never: 1 },
      mrr: 0,
      arr: 0,
    });
    expect((await readShops(env.DB, "paid", 0)).count).toBe(0);
  });

  test("classifica ogni store attivo in una sola riga di stato billing", async () => {
    await insertStore(1, "mensile.myshopify.com", { plan: ["active", "monthly", "balanced"] });
    await insertStore(2, "omaggio-trial.myshopify.com", { complimentary: true, trial: true });
    await insertStore(3, "trial.myshopify.com", { trial: true });
    await insertStore(4, "scaduto.myshopify.com", { plan: ["expired", "annual", "balanced"] });
    await insertStore(5, "rimborsato.myshopify.com", {
      plan: ["refunded", "one_time", "balanced"],
    });
    await insertStore(6, "prova-scaduta.myshopify.com", { trial: true });
    await insertStore(7, "prova-oltre-termine.myshopify.com", { trial: true });
    await insertStore(8, "mai-avviata.myshopify.com");
    await insertStore(9, "convertita-senza-piano.myshopify.com", { trial: true });
    await insertStore(10, "disinstallato.myshopify.com", {
      plan: ["active", "monthly", "balanced"],
    });
    await env.DB.batch([
      env.DB.prepare("UPDATE trials SET status = 'expired' WHERE shop_id = 6"),
      env.DB.prepare("UPDATE trials SET ends_at = '2020-01-01' WHERE shop_id = 7"),
      env.DB.prepare("UPDATE trials SET status = 'converted' WHERE shop_id = 9"),
      env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = 10"),
    ]);

    const { status } = await readBilling(env.DB);
    expect(status).toEqual({
      total: 9,
      monthly: 1,
      annual: 0,
      one_time: 0,
      ending: 0,
      complimentary: 1,
      trial: 1,
      expired: 1,
      refunded: 1,
      trial_expired: 2,
      trial_never: 1,
      other: 1,
    });
    const { total, ...categories } = status;
    expect(Object.values(categories).reduce((sum, count) => sum + count, 0)).toBe(total);
    expect(await readDashboard(env.DB)).toMatchObject({ active_shops: total });
  });

  test("mostra soltanto webhook ancora da verificare", async () => {
    await insertStore(1, "recuperato.myshopify.com");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
         VALUES ('partner_events_polled_at', datetime('now'), datetime('now'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
         VALUES ('failed-recovered', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'failed',
                 datetime('now', '-20 minutes'), datetime('now', '-19 minutes'),
                 'queue_retries_exhausted')`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at)
         VALUES ('recovery', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'processed',
                 datetime('now', '-10 minutes'), datetime('now', '-9 minutes'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
         VALUES ('failed-redacted', NULL, 'SHOP_UPDATE', 'failed',
                 datetime('now', '-20 minutes'), datetime('now', '-19 minutes'),
                 'queue_retries_exhausted')`,
      ),
    ]);

    expect(await readDashboard(env.DB)).toMatchObject({
      open_issues: 0,
      unresolved_webhooks: 0,
    });
    expect(await readIssues(env.DB)).toMatchObject({ webhooks: { unresolved: 0, stale: 0 } });
    expect(await readHealth(env.DB)).toMatchObject({ webhooks: { unresolved: 0, stale: 0 } });

    await env.DB.prepare(
      `INSERT INTO webhook_events
         (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
       VALUES ('failed-open', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'failed',
               datetime('now', '-5 minutes'), datetime('now', '-4 minutes'),
               'queue_retries_exhausted')`,
    ).run();

    expect(await readDashboard(env.DB)).toMatchObject({
      open_issues: 1,
      unresolved_webhooks: 1,
    });
  });

  test("renderizza tutte le viste, apre gli store e confronta le versioni osservate", async () => {
    await insertStore(1, "dashboard.myshopify.com", {
      onboarding: "completed",
      validation: 1,
      plan: ["active", "monthly", "balanced"],
      trial: true,
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         VALUES (1, 'rules_saved', 'validation', '2026-09-08T10:00:00.000Z')`,
      ),
      env.DB.prepare(
        `INSERT INTO performance_samples
           (shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at)
         VALUES (1, 'old-lcp', 'LCP', 1000, '1.5.3', 'home', datetime('now', '-1 day'))`,
      ),
      env.DB.prepare(
        `INSERT INTO performance_samples
           (shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at)
         VALUES (1, 'new-lcp', 'LCP', 1300, '1.5.4', 'home', datetime('now'))`,
      ),
    ]);

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target.endsWith("/getWebhookInfo")) {
        return Response.json({
          ok: true,
          result: {
            url: "https://cf-ready-prod.test/internal/telegram/webhook",
            pending_update_count: 1,
          },
        });
      }
      return growthResponse([], false);
    }) as unknown as typeof fetch;
    const adminForShop = vi.fn(async () => ({
      graphql: vi.fn(async (query: string) => {
        expect(query).toBe(SHOPIFY_PLAN_QUERY);
        return Response.json({ data: { shop: { plan: { publicDisplayName: "Basic" } } } });
      }),
    }));
    const actions: OwnerControlAction[] = [
      { view: "dashboard" },
      { view: "shops", filter: "all" },
      { view: "shops" },
      { view: "shop", shopId: 1 },
      { view: "shop", argument: "dashboard" },
      { view: "shop" },
      { view: "growth" },
      { view: "billing" },
      { view: "trials" },
      { view: "funnel" },
      { view: "issues" },
      { view: "errors" },
      { view: "notifications" },
      { view: "activity" },
      { view: "health" },
      { view: "performance" },
      { view: "version" },
      { view: "help" },
    ];
    let health = "";
    for (const action of actions) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const message = await renderOwnerControlAction(env.DB, action, controlConfig(), {
        now: NOW,
        fetcher,
        adminForShop,
      });
      if (action.view === "health") health = JSON.stringify(message);
      expect(message.richMessage.blocks.length).toBeGreaterThan(1);
      for (const row of message.replyMarkup?.inline_keyboard ?? []) {
        for (const button of row)
          expect(new TextEncoder().encode(button.callback_data).byteLength).toBeLessThanOrEqual(64);
      }
    }
    expect(health).toContain("Attivo · nessun arretrato");

    const shops = await renderOwnerControlAction(
      env.DB,
      { view: "shops", filter: "all" },
      controlConfig(),
      { now: NOW, fetcher },
    );
    expect(
      shops.replyMarkup?.inline_keyboard.flat().some(({ text }) => text.includes("Dashboard")),
    ).toBe(true);
    expect(
      shops.replyMarkup?.inline_keyboard
        .flat()
        .some(({ callback_data }) => callback_data.startsWith("oc1:o:")),
    ).toBe(true);

    await expect(
      renderOwnerControlAction(env.DB, { view: "shop", shopId: 999 }, controlConfig()),
    ).resolves.toBeTruthy();
    await expect(
      renderOwnerControlAction(env.DB, { view: "shop", argument: "assente" }, controlConfig()),
    ).resolves.toBeTruthy();
    await insertStore(2, "dashboard-due.myshopify.com");
    const matches = await renderOwnerControlAction(
      env.DB,
      { view: "shop", argument: "dashboard" },
      controlConfig(),
    );
    expect(matches.replyMarkup?.inline_keyboard).toHaveLength(2);

    const development = controlConfig();
    development.environment = "development";
    delete development.versionMetadata;
    await expect(
      renderOwnerControlAction(env.DB, { view: "version" }, development),
    ).resolves.toBeTruthy();
    const custom = controlConfig();
    custom.environment = "preview";
    await expect(
      renderOwnerControlAction(env.DB, { view: "version" }, custom),
    ).resolves.toBeTruthy();

    const cachedHealth = vi.fn(() =>
      Promise.reject(new Error("non chiamare")),
    ) as unknown as typeof fetch;
    await expect(
      renderOwnerControlAction(env.DB, { view: "health", refresh: true }, controlConfig(), {
        now: new Date(NOW.getTime() + 60_000),
        fetcher: cachedHealth,
      }),
    ).resolves.toBeTruthy();
    expect(cachedHealth).not.toHaveBeenCalled();

    await env.DB.prepare("DELETE FROM owner_control_state").run();
    const unavailable = vi.fn(() =>
      Promise.reject(new Error("provider non disponibile")),
    ) as unknown as typeof fetch;
    await expect(
      renderOwnerControlAction(env.DB, { view: "dashboard" }, controlConfig(), {
        now: new Date(NOW.getTime() + 20 * 60_000),
        fetcher: unavailable,
      }),
    ).resolves.toBeTruthy();
    await expect(
      renderOwnerControlAction(env.DB, { view: "health" }, controlConfig(), {
        now: new Date(NOW.getTime() + 20 * 60_000),
        fetcher: unavailable,
      }),
    ).resolves.toBeTruthy();

    const performance = await readPerformance(env.DB);
    expect(performance.comparison).toMatchObject({
      previous_version: "1.5.3",
      current_version: "1.5.4",
      alerts: [],
    });
  });
});
