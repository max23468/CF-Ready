import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { recordEvent } from "../../app/events.server";
import {
  applyRetention,
  markUninstalled,
  recordInstallOnce,
  redactExpiredShops,
  redactShop,
  refuseInstall,
} from "../../app/shop.server";
import { localDate, trialEnd } from "../../app/billing.server";
import { reconcile } from "../../app/validation.server";
import { claimWebhook, handleWebhook, runClaimedWebhook } from "../../app/webhooks.server";
import type { WebhookJob } from "../../app/webhooks.server";
import {
  webhookQueue,
  insertShop,
  FUSO,
  shopContext,
  SENZA_ADDEBITI,
  adminStub,
  appState,
} from "../support/lifecycle";

test("una disinstallazione senza timestamp autenticato resta ritentabile", async () => {
  const shop = await insertShop("uninstall-senza-timestamp.example.myshopify.com");
  const response = await handleWebhook(
    env.DB,
    { webhookId: "wh-uninstall-senza-timestamp", topic: "APP_UNINSTALLED", shop },
    webhookQueue(() => {
      throw new Error("handler non atteso");
    }),
  );

  expect(response.status).toBe(500);
  expect(
    await env.DB.prepare("SELECT webhook_id FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-uninstall-senza-timestamp")
      .first(),
  ).toBeNull();
});

test("la prima consegna tardiva della disinstallazione non tocca la reinstallazione", async () => {
  const shop = await insertShop("uninstall-tardivo.example.myshopify.com");
  await env.DB.prepare("UPDATE shops SET installed_at = ? WHERE shop_domain = ?")
    .bind("2026-08-01T10:10:00.000Z", shop)
    .run();
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT 'offline_tardivo', id, 0, 'x', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-08-01T10:10:00.000Z", "2026-08-01T10:10:00.000Z", shop)
    .run();

  let job: WebhookJob | undefined;
  const response = await handleWebhook(
    env.DB,
    {
      webhookId: "wh-uninstall-prima-consegna-tardiva",
      topic: "APP_UNINSTALLED",
      shop,
      triggeredAt: "2026-08-01T10:00:00.000Z",
    },
    webhookQueue((queued) => {
      job = queued;
    }),
  );
  await runClaimedWebhook(env.DB, job!, async (claim) => {
    if (claim.installationStartedAt) {
      await markUninstalled(
        env.DB,
        shop,
        claim.installationStartedAt,
        "wh-uninstall-prima-consegna-tardiva",
      );
    }
  });

  expect(response.status).toBe(200);
  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare("SELECT id FROM shopify_sessions WHERE id = 'offline_tardivo'").first(),
  ).not.toBeNull();
});

test("la disinstallazione completa stato ed evento anche da uno stato parziale", async () => {
  const shop = await insertShop("uninstall-parziale.example.myshopify.com");
  const installedAt = "2026-08-01T10:00:00.000Z";
  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'blocked_country', installed_at = ?
     WHERE shop_domain = ?`,
  )
    .bind(installedAt, shop)
    .run();

  expect(await markUninstalled(env.DB, shop, installedAt, "wh-uninstall-parziale")).toBe(true);
  expect(await markUninstalled(env.DB, shop, installedAt, "wh-uninstall-parziale")).toBe(false);
  expect(
    await env.DB.prepare(
      `SELECT installation_status,
              (SELECT COUNT(*) FROM app_events event
               WHERE event.shop_id = shops.id AND event.event_name = 'app_uninstalled') AS events
       FROM shops WHERE shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled", events: 1 });
});

test("l'installazione è registrata una volta sola per ciclo di vita", async () => {
  const shop = await insertShop("token.example.myshopify.com");
  const installati = async () =>
    (
      await env.DB.prepare(
        `SELECT COUNT(*) AS totale FROM app_events
         WHERE event_name = 'app_installed'
           AND shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
        .bind(shop)
        .first<{ totale: number }>()
    )?.totale;

  expect(await recordInstallOnce(env.DB, shop)).toBe(true);
  // Rinnovo del token: `afterAuth` riparte ma l'installazione è la stessa.
  expect(await recordInstallOnce(env.DB, shop)).toBe(false);
  expect(await installati()).toBe(1);

  await recordEvent(env.DB, { shopDomain: shop, name: "app_uninstalled", class: "lifecycle" });

  expect(await recordInstallOnce(env.DB, shop)).toBe(true);
  expect(await installati()).toBe(2);
});

test("un'installazione da uno store non ammesso non lascia nulla dietro", async () => {
  const shop = await insertShop("estraneo.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT ?, id, 0, 'x', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(`offline_${shop}`, "2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z", shop)
    .run();

  await refuseInstall(env.DB, shop);

  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT id FROM shopify_sessions WHERE id = ?")
      .bind(`offline_${shop}`)
      .first(),
  ).toBeNull();
  // Il rifiuto resta tracciato, senza riferimento allo store cancellato.
  expect(
    await env.DB.prepare(
      "SELECT event_name, metadata_json FROM app_events WHERE event_name = 'install_refused'",
    ).first(),
  ).toMatchObject({ metadata_json: '{"reason":"shop_not_allowed"}' });
});

test("il redact non cancella uno store che ha reinstallato nel frattempo", async () => {
  const shop = await insertShop("reinstallato.example.myshopify.com");
  await claimWebhook(env.DB, "wh-redact-attivo", "SHOP_REDACT", shop);

  expect(await redactShop(env.DB, shop, "wh-redact-attivo")).toBe(false);

  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact-attivo")
      .first(),
  ).toMatchObject({ shop_domain: shop });
});

test("il retry redact anonimizza una ricevuta pre-migrazione dopo la cancellazione", async () => {
  const shop = await insertShop("redact-pre-migration.example.myshopify.com");
  await claimWebhook(env.DB, "wh-redact-pre-migration", "SHOP_REDACT", shop);
  await claimWebhook(env.DB, "wh-update-pre-migration", "SHOP_UPDATE", shop);
  await env.DB.prepare("DELETE FROM shops WHERE shop_domain = ?").bind(shop).run();

  expect(await redactShop(env.DB, shop, "wh-redact-pre-migration")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-redact-pre-migration")).toBe(true);
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact-pre-migration")
      .first(),
  ).toMatchObject({ shop_domain: null });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM webhook_events WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toMatchObject({ total: 0 });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE webhook_id = 'wh-redact-pre-migration' AND event_name = 'shop_redacted'`,
    ).first(),
  ).toMatchObject({ total: 1 });
});

test("disinstallazione e redact ripuliscono i dati dello store", async () => {
  const shop = await insertShop("redact.example.myshopify.com");
  await recordEvent(env.DB, { shopDomain: shop, name: "app_installed", class: "lifecycle" });
  await claimWebhook(env.DB, "wh-redact", "SHOP_REDACT", shop);
  const shopId = (
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
      .bind(shop)
      .first<{ id: number }>()
  )?.id;
  await reconcile(
    adminStub([
      shopContext("IT", true),
      SENZA_ADDEBITI,
      { data: { validationUpdate: { userErrors: [] } } },
      shopContext("IT", true, { kind: "trial", validThrough: trialEnd(localDate(FUSO)) }),
    ]),
    env.DB,
    shop,
  );

  await markUninstalled(env.DB, shop, "2026-07-30T00:00:00.000Z", "wh-uninstall-redact");
  expect(
    await env.DB.prepare(
      "SELECT installation_status, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled" });
  expect(await appState(shop)).toMatchObject({ validation_enabled: 0, validation_gid: null });

  await env.DB.prepare(
    `INSERT INTO owner_notifications (
       dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
       available_at, created_at, updated_at
     ) VALUES ('notification-redact', 'lifecycle', ?, 'subject', 'body', ?, ?, ?, ?)`,
  )
    .bind(
      shop,
      "2026-07-30T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
    )
    .run();

  expect(await redactShop(env.DB, shop, "wh-redact")).toBe(true);
  expect(await redactShop(env.DB, shop, "wh-redact")).toBe(true);

  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT id FROM owner_notifications WHERE shop_domain = ?")
      .bind(shop)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM app_events WHERE shop_id = ?")
      .bind(shopId)
      .first<{ total: number }>(),
  ).toMatchObject({ total: 0 });
  expect(
    await env.DB.prepare("SELECT shop_domain, topic FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact")
      .first(),
  ).toMatchObject({ shop_domain: null, topic: "SHOP_REDACT" });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE webhook_id = 'wh-redact' AND event_name = 'shop_redacted'`,
    ).first(),
  ).toMatchObject({ total: 1 });
});

test("la retention elimina solo gli store disinstallati da almeno 90 giorni", async () => {
  const expired = await insertShop("retention-expired.example.myshopify.com");
  const recent = await insertShop("retention-recent.example.myshopify.com");
  const active = await insertShop("retention-active.example.myshopify.com");

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
         WHERE shop_domain = ?`,
    ).bind("2026-05-04T00:00:00.000Z", expired),
    env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
         WHERE shop_domain = ?`,
    ).bind("2026-05-04T00:00:00.001Z", recent),
    env.DB.prepare("UPDATE shops SET uninstalled_at = ? WHERE shop_domain = ?").bind(
      "2026-05-01T00:00:00.000Z",
      active,
    ),
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, shop_domain, topic, status, received_at)
         VALUES ('wh-retention', ?, 'APP_UNINSTALLED', 'processed', ?)`,
    ).bind(expired, "2026-05-04T00:00:00.000Z"),
  ]);

  expect(await redactExpiredShops(env.DB, new Date("2026-08-02T00:00:00.000Z"))).toBe(1);
  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(expired).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT shop_domain FROM shops WHERE shop_domain = ?")
      .bind(recent)
      .first(),
  ).toMatchObject({ shop_domain: recent });
  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(active)
      .first(),
  ).toMatchObject({ installation_status: "active" });
  expect(
    await env.DB.prepare("SELECT shop_domain FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-retention")
      .first(),
  ).toMatchObject({ shop_domain: null });
});

test("la retention rispetta le soglie pubblicate per eventi e ricevute", async () => {
  const shop = await insertShop("retention-events.example.myshopify.com");
  const shopId = (await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>())!.id;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
       VALUES ('receipt-expired', 'SHOP_UPDATE', 'processed', '2026-05-04T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
       VALUES ('receipt-current', 'SHOP_UPDATE', 'processed', '2026-05-04T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('error-expired', 'error', '2026-05-04T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('error-current', 'error', '2026-05-04T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('event-expired', 'lifecycle', '2025-08-02T00:00:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (event_name, event_class, occurred_at)
       VALUES ('event-current', 'lifecycle', '2025-08-02T00:00:00.001Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO performance_samples (
         shop_id, metric_id, metric_name, metric_value, country_code,
         app_version, app_route, observed_at
       ) VALUES (?, 'performance-expired', 'LCP', 3273, 'IT', '1.0.4', 'home', ?)`,
    ).bind(shopId, "2026-05-04T00:00:00.000Z"),
    env.DB.prepare(
      `INSERT INTO performance_samples (
         shop_id, metric_id, metric_name, metric_value, country_code,
         app_version, app_route, observed_at
       ) VALUES (?, 'performance-current', 'INP', 942, 'IT', '1.0.4', 'messages', ?)`,
    ).bind(shopId, "2026-05-04T00:00:00.001Z"),
    env.DB.prepare(
      `INSERT INTO billing_events (
           shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at
         ) VALUES (?, 'gid://expired', 'subscription', 'active', ?, ?)`,
    ).bind(shopId, "2025-08-02T00:00:00.000Z", "2025-08-02T00:00:00.000Z"),
    env.DB.prepare(
      `INSERT INTO billing_events (
           shop_id, shopify_resource_gid, event_type, status, occurred_at, created_at
         ) VALUES (?, 'gid://current', 'subscription', 'active', ?, ?)`,
    ).bind(shopId, "2025-08-02T00:00:00.001Z", "2025-08-02T00:00:00.001Z"),
    env.DB.prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         available_at, created_at, updated_at
       ) VALUES ('notification-expired', 'lifecycle', 'expired.myshopify.com', 'subject', 'body', ?, ?, ?, ?)`,
    ).bind(
      "2026-05-04T00:00:00.000Z",
      "2026-05-04T00:00:00.000Z",
      "2026-05-04T00:00:00.000Z",
      "2026-05-04T00:00:00.000Z",
    ),
    env.DB.prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         available_at, created_at, updated_at
       ) VALUES ('notification-current', 'lifecycle', 'current.myshopify.com', 'subject', 'body', ?, ?, ?, ?)`,
    ).bind(
      "2026-05-04T00:00:00.001Z",
      "2026-05-04T00:00:00.001Z",
      "2026-05-04T00:00:00.001Z",
      "2026-05-04T00:00:00.001Z",
    ),
  ]);

  expect((await applyRetention(env.DB, new Date("2026-08-02T00:00:00.000Z"))).shops).toBe(0);
  expect(
    (
      await env.DB.prepare(
        `SELECT webhook_id AS value FROM webhook_events WHERE webhook_id LIKE 'receipt-%'
         UNION ALL SELECT event_name FROM app_events WHERE event_name LIKE 'error-%' OR event_name LIKE 'event-%'
         UNION ALL SELECT metric_id FROM performance_samples WHERE metric_id LIKE 'performance-%'
         UNION ALL SELECT shopify_resource_gid FROM billing_events WHERE shopify_resource_gid LIKE 'gid://%'
         UNION ALL SELECT dedupe_key FROM owner_notifications WHERE dedupe_key LIKE 'notification-%'
         ORDER BY value`,
      ).all<{ value: string }>()
    ).results.map(({ value }) => value),
  ).toEqual([
    "error-current",
    "event-current",
    "gid://current",
    "notification-current",
    "performance-current",
    "receipt-current",
  ]);
});

test("la retention svuota tutti i batch di campioni performance scaduti", async () => {
  const shop = await insertShop("retention-performance.example.myshopify.com");
  const shopId = (await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>())!.id;
  await env.DB.prepare(
    `INSERT INTO performance_samples (
       shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at
     )
     WITH RECURSIVE samples(id) AS (
       SELECT 1 UNION ALL SELECT id + 1 FROM samples WHERE id < 1001
     )
     SELECT ?, 'expired-' || id, 'LCP', id, '1.0.5', 'home', '2026-05-04T00:00:00.000Z'
     FROM samples`,
  )
    .bind(shopId)
    .run();

  expect((await applyRetention(env.DB, new Date("2026-08-02T00:00:00.000Z"))).events).toBe(1001);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM performance_samples WHERE metric_id LIKE 'expired-%'",
    ).first(),
  ).toEqual({ total: 0 });
});

test("la retention limita ogni esecuzione a 25 store", async () => {
  for (let index = 0; index < 26; index += 1) {
    const shop = await insertShop(`retention-batch-${index}.example.myshopify.com`);
    await env.DB.prepare(
      `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ?
       WHERE shop_domain = ?`,
    )
      .bind("2020-01-01T00:00:00.000Z", shop)
      .run();
  }

  expect(await redactExpiredShops(env.DB, new Date("2026-08-02T00:00:00.000Z"))).toBe(25);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM shops WHERE shop_domain LIKE 'retention-batch-%'",
    ).first(),
  ).toMatchObject({ total: 1 });
});
