import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderOwnerControlAction } from "../app/owner-control/commands.server";

import {
  callbackData,
  parseCallback,
  parseCommand,
  type OwnerControlAction,
} from "../app/owner-control/model";

import { reconcileOwnerIncidents } from "../app/owner-control/incidents.server";
import {
  BILLING_READBACK_STALE_HOURS,
  CHECKOUT_LABEL_OBSERVATION_MINUTES,
} from "../app/owner-control/model";

import { NOW } from "./support/owner-control";
import { controlConfig, insertStore, resetOwnerControl } from "./support/owner-control-db";

beforeEach(resetOwnerControl);

describe("incidenti operativi", () => {
  test("apre, deduplica e risolve gli incidenti webhook e Partner", async () => {
    const stale = new Date(NOW.getTime() - 20 * 60_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
         VALUES ('blocked-webhook', 'APP_UNINSTALLED', 'processing', ?)`,
      ).bind(stale),
      env.DB.prepare(
        `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
         VALUES ('partner_events_polled_at', ?, ?)`,
      ).bind(stale, stale),
    ]);

    await reconcileOwnerIncidents(env.DB, NOW);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 60_000));

    expect(
      await env.DB.prepare(
        `SELECT subject FROM owner_notifications
            WHERE notification_kind = 'operational' ORDER BY id`,
      ).all(),
    ).toMatchObject({
      results: [
        { subject: "🔴 CF Ready · Webhook bloccati" },
        { subject: "🔴 CF Ready · Acquisizione Partner ferma" },
      ],
    });

    await env.DB.batch([
      env.DB.prepare("DELETE FROM webhook_events WHERE webhook_id = 'blocked-webhook'"),
      env.DB.prepare(
        `UPDATE owner_notification_state SET state_value = 'valore-incompleto'
          WHERE state_key = 'partner_events_polled_at'`,
      ),
    ]);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 2 * 60_000));

    expect(
      await env.DB.prepare(
        "SELECT incident_key, status FROM owner_operational_incidents ORDER BY incident_key",
      ).all(),
    ).toMatchObject({
      results: [
        { incident_key: "partner", status: "active" },
        { incident_key: "webhooks", status: "resolved" },
      ],
    });
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toMatchObject({ subject: "🟢 CF Ready · Webhook ripristinati" });

    await env.DB.prepare(
      `UPDATE owner_notification_state SET state_value = ?
        WHERE state_key = 'partner_events_polled_at'`,
    )
      .bind(new Date(NOW.getTime() + 3 * 60_000).toISOString())
      .run();
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 3 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT status FROM owner_operational_incidents WHERE incident_key = 'partner'",
      ).first(),
    ).toEqual({ status: "resolved" });
  });

  test("segnala solo errori etichette ripetuti e ne notifica la risoluzione", async () => {
    await insertStore(1, "labels-alert.myshopify.com");
    await env.DB.prepare(
      `UPDATE app_state
          SET checkout_labels_mode = 'automatic',
              checkout_labels_last_error_code = 'checkout_labels_partial_sync'
        WHERE shop_id = 1`,
    ).run();

    await reconcileOwnerIncidents(env.DB, NOW);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 5 * 60_000));
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first("count"),
    ).toBe(0);

    const persistentAt = new Date(NOW.getTime() + CHECKOUT_LABEL_OBSERVATION_MINUTES * 60_000);
    await reconcileOwnerIncidents(env.DB, persistentAt);
    await reconcileOwnerIncidents(env.DB, new Date(persistentAt.getTime() + 5 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT subject, shop_domain FROM owner_notifications ORDER BY id",
      ).all(),
    ).toMatchObject({
      results: [
        {
          subject: "🔴 CF Ready · Sincronizzazione etichette in errore",
          shop_domain: "labels-alert.myshopify.com",
        },
      ],
    });
    const alertBody = await env.DB.prepare(
      "SELECT body_text FROM owner_notifications ORDER BY id LIMIT 1",
    ).first<string>("body_text");
    expect(alertBody).toContain("Nome: Store 1");
    expect(alertBody).toContain("I controlli del monitor non sono nuove letture Shopify");
    expect(alertBody).toContain("Ultima lettura Shopify: non disponibile");
    expect(alertBody).toMatch(/🕒 Evento: \d{1,2} set 2026, \d{2}:\d{2}/);
    expect(
      await env.DB.prepare(
        `SELECT first_observed_at FROM owner_operational_incidents
          WHERE incident_key = 'checkout_labels:1'`,
      ).first(),
    ).toEqual({ first_observed_at: NOW.toISOString() });

    await env.DB.prepare(
      `UPDATE app_state
          SET checkout_labels_last_error_code = 'checkout_labels_confirmation_pending'
        WHERE shop_id = 1`,
    ).run();
    await reconcileOwnerIncidents(env.DB, new Date(persistentAt.getTime() + 10 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toMatchObject({ subject: "🟢 CF Ready · Errore etichette non più registrato" });
  });

  test("rimuove un errore etichette ancora in osservazione quando scompare", async () => {
    await insertStore(1, "labels-observing.myshopify.com");
    await env.DB.prepare(
      `UPDATE app_state
          SET checkout_labels_mode = 'automatic',
              checkout_labels_last_error_code = 'checkout_labels_partial_sync'
        WHERE shop_id = 1`,
    ).run();
    await reconcileOwnerIncidents(env.DB);
    expect(
      await env.DB.prepare(
        "SELECT status FROM owner_operational_incidents WHERE incident_key = 'checkout_labels:1'",
      ).first(),
    ).toEqual({ status: "observing" });

    await env.DB.prepare(
      "UPDATE app_state SET checkout_labels_last_error_code = NULL WHERE shop_id = 1",
    ).run();
    await reconcileOwnerIncidents(env.DB, NOW);
    expect(
      await env.DB.prepare(
        "SELECT status FROM owner_operational_incidents WHERE incident_key = 'checkout_labels:1'",
      ).first(),
    ).toBeNull();
  });

  test("segnala il diritto non scritto nel metafield e lo chiude al tentativo riuscito", async () => {
    await insertStore(1, "entitlement-alert.myshopify.com");
    await env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_status, is_test,
         last_reconciled_at, reconciliation_attempted_at, reconciliation_error_code,
         created_at, updated_at
       ) VALUES (1, 'active', 'monthly', 'balanced', 'ACTIVE', 0, ?, ?,
                 'entitlement_write_failed', ?, ?)`,
    )
      .bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString())
      .run();

    await reconcileOwnerIncidents(env.DB, NOW);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 60_000));
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications WHERE notification_kind = 'operational' ORDER BY id",
      ).all(),
    ).toMatchObject({
      results: [{ subject: "🔴 CF Ready · Diritto non sincronizzato nel checkout" }],
    });

    await env.DB.prepare(
      "UPDATE billing_accounts SET reconciliation_error_code = NULL WHERE shop_id = 1",
    ).run();
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 120_000));
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toMatchObject({ subject: "🟢 CF Ready · Diritto sincronizzato nel checkout" });
  });

  test("distingue il ritardo ordinario dal readback billing davvero fermo", async () => {
    await insertStore(1, "billing-readback.myshopify.com");
    const lastReadback = new Date(NOW.getTime() - 24 * 60 * 60 * 1000 - 5_000).toISOString();
    await env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_status, is_test,
         last_reconciled_at, reconciliation_attempted_at, created_at, updated_at
       ) VALUES (1, 'active', 'monthly', 'balanced', 'ACTIVE', 0, ?, ?, ?, ?)`,
    )
      .bind(lastReadback, lastReadback, lastReadback, lastReadback)
      .run();

    await reconcileOwnerIncidents(env.DB, NOW);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first("count"),
    ).toBe(0);

    const staleAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    await env.DB.prepare(
      `UPDATE billing_accounts
          SET reconciliation_attempted_at = ?, reconciliation_error_code = 'billing_read_failed'
        WHERE shop_id = 1`,
    )
      .bind(staleAt.toISOString())
      .run();
    await reconcileOwnerIncidents(env.DB, staleAt);
    const opened = await env.DB.prepare(
      "SELECT subject, body_text FROM owner_notifications ORDER BY id LIMIT 1",
    ).first<{ subject: string; body_text: string }>();
    expect(opened?.subject).toBe("🔴 CF Ready · Billing Shopify da riconciliare");
    expect(opened?.body_text).toContain(`Soglia: ${BILLING_READBACK_STALE_HOURS} ore`);
    expect(opened?.body_text).toContain("Ultimo errore: billing_read_failed");
    expect(opened?.body_text).not.toContain("37 giorni");

    const recoveredAt = new Date(staleAt.getTime() + 5 * 60_000);
    await env.DB.prepare(
      `UPDATE billing_accounts
          SET last_reconciled_at = ?, reconciliation_attempted_at = ?,
              reconciliation_error_code = NULL WHERE shop_id = 1`,
    )
      .bind(recoveredAt.toISOString(), recoveredAt.toISOString())
      .run();
    await reconcileOwnerIncidents(env.DB, recoveredAt);
    const resolved = await env.DB.prepare(
      "SELECT subject, body_text FROM owner_notifications ORDER BY id DESC LIMIT 1",
    ).first<{ subject: string; body_text: string }>();
    expect(resolved?.subject).toBe("🟢 CF Ready · Readback billing Shopify ripristinato");
    expect(resolved?.body_text).toContain("lettura del billing dalla Shopify Admin API");
    expect(resolved?.body_text).not.toContain("osservazione finanziaria");
  });

  test("non dichiara ripristinato il readback quando lo store viene disinstallato", async () => {
    await insertStore(1, "billing-uninstalled.myshopify.com");
    const staleAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_status, is_test,
         last_reconciled_at, created_at, updated_at
       ) VALUES (1, 'active', 'monthly', 'balanced', 'ACTIVE', 0, ?, ?, ?)`,
    )
      .bind(staleAt, staleAt, staleAt)
      .run();
    await reconcileOwnerIncidents(env.DB, NOW);
    await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = 1").run();
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 5 * 60_000));
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first("count"),
    ).toBe(1);
  });

  test("segnala vendita e credito non osservati dopo 37 giorni e chiude gli alert", async () => {
    await insertStore(1, "billing-alert.myshopify.com");
    const old = "2026-07-31T10:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO billing_accounts (
           shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
           shopify_status, is_test, current_period_start, last_reconciled_at,
           sale_checked_at, charge_accepted_at, created_at, updated_at
         ) VALUES (1, 'active', 'annual', 'balanced', 'gid://shopify/AppSubscription/alert',
                   'ACTIVE', 0, ?, ?, ?, ?, ?, ?)`,
      ).bind(old, old, NOW.toISOString(), old, old, old),
      env.DB.prepare(
        `INSERT INTO billing_conversions (
           shop_id, subscription_gid, one_time_gid, credit_estimate_minor, currency,
           credit_status, requested_at, cancelled_at, last_checked_at,
           subscription_accepted_at, is_test, created_at, updated_at
         ) VALUES (1, 'gid://shopify/AppSubscription/alert',
                   'gid://shopify/AppPurchaseOneTime/alert', 2000, 'EUR', 'pending',
                   ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(old, old, NOW.toISOString(), old, old, old),
    ]);

    await reconcileOwnerIncidents(env.DB, NOW);
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications WHERE notification_kind = 'operational' ORDER BY id",
      ).all(),
    ).toMatchObject({
      results: [
        { subject: "🔴 CF Ready · Vendita Partner non osservata dopo 37 giorni" },
        { subject: "🔴 CF Ready · Credito pro-rata non osservato dopo 37 giorni" },
        {
          subject: "🔴 CF Ready · Vendita del piano sostituito non osservata dopo 37 giorni",
        },
        { subject: "🔴 CF Ready · Billing Shopify da riconciliare" },
      ],
    });

    await env.DB.prepare(
      `UPDATE billing_conversions
          SET credit_status = 'needs_review',
              credit_transaction_gid = 'gid://partners/AppSaleAdjustment/alert',
              credit_transaction_type = 'AppSaleAdjustment',
              credit_observed_at = ?, credit_amount_minor = -1500
        WHERE shop_id = 1`,
    )
      .bind(NOW.toISOString())
      .run();
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 30_000));
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications WHERE subject = '🔴 CF Ready · Credito pro-rata da verificare'",
      ).first("subject"),
    ).toBe("🔴 CF Ready · Credito pro-rata da verificare");

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE billing_accounts
              SET sale_observed_at = ?, sale_charge_gid = shopify_charge_gid,
                  sale_cycle_start = current_period_start, last_reconciled_at = ?
            WHERE shop_id = 1`,
      ).bind(NOW.toISOString(), NOW.toISOString()),
      env.DB.prepare(
        `UPDATE billing_conversions
            SET credit_status = 'confirmed',
                subscription_sale_transaction_gid = 'gid://partners/AppSubscriptionSale/alert',
                subscription_sale_observed_at = ?
          WHERE shop_id = 1`,
      ).bind(NOW.toISOString()),
    ]);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 60_000));
    expect(
      await env.DB.prepare(
        "SELECT status, COUNT(*) AS count FROM owner_operational_incidents WHERE incident_kind = 'billing' GROUP BY status",
      ).all(),
    ).toMatchObject({ results: [{ status: "resolved", count: 5 }] });
  });

  test("non segnala una vendita durante la prova senza ciclo pagato", async () => {
    await insertStore(1, "billing-trial.myshopify.com");
    const old = "2026-07-01T10:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
         shopify_status, is_test, current_period_start, last_reconciled_at,
         sale_checked_at, created_at, updated_at
       ) VALUES (1, 'active', 'monthly', 'balanced',
                 'gid://shopify/AppSubscription/trial', 'ACTIVE', 0, NULL, ?, ?, ?, ?)`,
    )
      .bind(NOW.toISOString(), NOW.toISOString(), old, old)
      .run();

    await reconcileOwnerIncidents(env.DB, NOW);

    expect(
      await env.DB.prepare(
        "SELECT status FROM owner_operational_incidents WHERE incident_key = 'billing_sale:1'",
      ).first(),
    ).toBeNull();
  });

  test("chiude dal pulsante solo una conversione da verificare, osservata e senza credito", async () => {
    await insertStore(1, "conversion.myshopify.com");
    await insertStore(2, "credited.myshopify.com");
    await insertStore(3, "recent.myshopify.com");
    const conversion = (
      shopId: number,
      creditGid: string | null,
      requested = "2026-08-01T10:00:00.000Z",
    ) =>
      env.DB.prepare(
        `INSERT INTO billing_conversions (
           shop_id, subscription_gid, one_time_gid, currency, credit_status,
           credit_transaction_gid, credit_observed_at, requested_at, source, is_test,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'EUR', 'needs_review', ?, ?, ?, 'historical_reconciliation', 0,
                   ?, ?)`,
      ).bind(
        shopId,
        `gid://shopify/AppSubscription/${shopId}`,
        `gid://shopify/AppPurchaseOneTime/${shopId}`,
        creditGid,
        creditGid ? requested : null,
        requested,
        requested,
        requested,
      );
    await env.DB.batch([
      conversion(1, null),
      conversion(2, "gid://partners/AppSaleCredit/2"),
      // Ancora nella finestra di 37 giorni: vendita e credito possono arrivare da Partner.
      conversion(3, null, "2026-08-03T10:00:00.000Z"),
    ]);
    const options = {
      now: NOW,
      adminForShop: vi.fn(async () => ({
        graphql: vi.fn(async () =>
          Response.json({ data: { shop: { plan: { publicDisplayName: "Basic" } } } }),
        ),
      })),
    };
    const render = (action: OwnerControlAction) =>
      renderOwnerControlAction(env.DB, action, controlConfig(), options);
    const callbacks = (message: Awaited<ReturnType<typeof render>>) =>
      message.replyMarkup?.inline_keyboard.flat().map((key) => key.callback_data) ?? [];
    const status = (shopId: number) =>
      env.DB.prepare("SELECT credit_status FROM billing_conversions WHERE shop_id = ?")
        .bind(shopId)
        .first("credit_status");

    const review = parseCallback(callbackData({ view: "conversion_review", shopId: 1 }));
    expect(review).toEqual({ view: "conversion_review", shopId: 1, page: 0, refresh: false });
    expect(parseCommand("/conversion_close")).toBeNull();
    expect(callbacks(await render({ view: "shop", shopId: 1 }))).toContain("oc1:c:1:0");
    expect(callbacks(await render(review!))).toContain("oc1:k:1:0");

    const closed = await render({ view: "conversion_close", shopId: 1 });
    expect(await status(1)).toBe("not_applicable");
    expect(callbacks(closed)).not.toContain("oc1:c:1:0");
    await render({ view: "conversion_close", shopId: 1 });
    expect(await status(1)).toBe("not_applicable");

    expect(callbacks(await render({ view: "shop", shopId: 2 }))).not.toContain("oc1:c:2:0");
    expect(JSON.stringify(await render({ view: "conversion_review", shopId: 2 }))).toContain(
      "Nessuna conversione da chiudere.",
    );
    await render({ view: "conversion_close", shopId: 2 });
    expect(await status(2)).toBe("needs_review");

    expect(callbacks(await render({ view: "shop", shopId: 3 }))).not.toContain("oc1:c:3:0");
    await render({ view: "conversion_close", shopId: 3 });
    expect(await status(3)).toBe("needs_review");
  });

  test("rifiuta letture incidenti incomplete e ignora store già rimossi", async () => {
    const statement = {
      bind() {
        return this;
      },
      async first() {
        return null;
      },
    } as unknown as D1PreparedStatement;
    const database = (firstBatch: Array<{ success: boolean; results: unknown[] }>) => {
      let calls = 0;
      return {
        prepare: () => statement,
        batch: async () => (calls++ === 0 ? firstBatch : [{ success: true, results: [] }]) as never,
      } as unknown as D1Database;
    };

    await expect(
      reconcileOwnerIncidents(
        database([
          { success: false, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
        ]),
        NOW,
      ),
    ).rejects.toThrow("owner_incident_read_failed");
    await expect(
      reconcileOwnerIncidents(
        database([
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
        ]),
        NOW,
      ),
    ).rejects.toThrow("owner_incident_read_failed");

    await expect(
      reconcileOwnerIncidents(
        database([
          { success: true, results: [{ failed: 0, processing: 0 }] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          { success: true, results: [] },
          {
            success: true,
            results: [
              {
                incident_key: "checkout_labels:99",
                incident_kind: "checkout_labels",
                shop_id: 99,
                status: "active",
                fingerprint: "checkout_labels_partial_sync",
                consecutive_observations: 3,
                first_observed_at: NOW.toISOString(),
                opened_at: NOW.toISOString(),
              },
              {
                incident_key: "checkout_labels:100",
                incident_kind: "checkout_labels",
                shop_id: null,
                status: "resolved",
                fingerprint: "checkout_labels_partial_sync",
                consecutive_observations: 3,
                first_observed_at: NOW.toISOString(),
                opened_at: NOW.toISOString(),
              },
            ],
          },
        ]),
        NOW,
      ),
    ).resolves.toBeUndefined();
  });
});
