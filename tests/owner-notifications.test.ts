import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { readBillingAccount, syncBillingAccount } from "../app/billing.server";
import { trialLedgerHash } from "../app/hash.server";
import {
  deliverOwnerNotifications,
  pollLocalNotifications,
  pollPartnerEvents,
} from "../app/owner-notifications.server";
import { insertShop } from "./support/lifecycle";

const PARTNER_CONFIG = {
  organizationId: "organizzazione",
  appId: "gid://partners/App/cf-ready",
  accessToken: "partner-token-sintetico",
};
const NOW = new Date("2026-08-24T10:00:00.000Z");

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owner_notifications"),
    env.DB.prepare("DELETE FROM owner_notification_state"),
    env.DB.prepare("DELETE FROM owner_notification_redactions"),
    env.DB.prepare("DELETE FROM billing_events"),
    env.DB.prepare("DELETE FROM app_events"),
    env.DB.prepare("DELETE FROM billing_accounts"),
    env.DB.prepare("DELETE FROM trials"),
    env.DB.prepare("DELETE FROM app_state"),
    env.DB.prepare("DELETE FROM shops"),
  ]);
});

test("il poll Partner copre lifecycle e billing con nome store, stato e importo", async () => {
  const shop = await insertShop("ciclo-completo.myshopify.com");
  const events = [
    relationship("RELATIONSHIP_INSTALLED", shop, "09:50"),
    relationship("RELATIONSHIP_REACTIVATED", shop, "09:51"),
    relationship("RELATIONSHIP_DEACTIVATED", shop, "09:52"),
    relationship("RELATIONSHIP_UNINSTALLED", shop, "09:53"),
    subscription("SUBSCRIPTION_CHARGE_ACCEPTED", shop, "09:54"),
    subscription("SUBSCRIPTION_CHARGE_ACTIVATED", shop, "09:55"),
    subscription("SUBSCRIPTION_CHARGE_CANCELED", shop, "09:56"),
    subscription("SUBSCRIPTION_CHARGE_DECLINED", shop, "09:57"),
    subscription("SUBSCRIPTION_CHARGE_EXPIRED", shop, "09:58"),
    subscription("SUBSCRIPTION_CHARGE_FROZEN", shop, "09:59"),
    subscription("SUBSCRIPTION_CHARGE_UNFROZEN", shop, "09:59:10"),
    oneTime("ONE_TIME_CHARGE_ACCEPTED", shop, "09:59:20"),
    oneTime("ONE_TIME_CHARGE_ACTIVATED", shop, "09:59:30"),
    oneTime("ONE_TIME_CHARGE_DECLINED", shop, "09:59:40"),
    oneTime("ONE_TIME_CHARGE_EXPIRED", shop, "09:59:50"),
  ];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    partnerResponse(events),
  );

  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: fetcher as typeof fetch }),
  ).toMatchObject({ inserted: events.length, pages: 1 });
  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: fetcher as typeof fetch }),
  ).toMatchObject({ inserted: 0 });

  const { results } = await env.DB.prepare(
    "SELECT notification_kind, subject, body_text, dedupe_key FROM owner_notifications ORDER BY id",
  ).all<{
    notification_kind: string;
    subject: string;
    body_text: string;
    dedupe_key: string;
  }>();
  expect(results.map(({ subject }) => subject)).toEqual([
    "🟢 CF Ready · Nuova installazione",
    "🟢 CF Ready · Reinstallazione",
    "🟡 CF Ready · App disattivata",
    "🔴 CF Ready · Disinstallazione",
    "💳 CF Ready · Acquisto piano accettato",
    "🟢 CF Ready · Piano attivato",
    "🔴 CF Ready · Abbonamento disdetto",
    "🔴 CF Ready · Acquisto piano rifiutato",
    "🟡 CF Ready · Richiesta piano scaduta",
    "🔴 CF Ready · Abbonamento sospeso",
    "🟢 CF Ready · Abbonamento riattivato",
    "💳 CF Ready · Pagamento unico accettato",
    "🟢 CF Ready · Pagamento unico attivato",
    "🔴 CF Ready · Pagamento unico rifiutato",
    "🟡 CF Ready · Pagamento unico scaduto",
  ]);
  for (const notification of results) {
    expect(notification.body_text).toContain("Nome: Negozio CF Ready");
    expect(notification.body_text).toContain(`URL: https://${shop}`);
    expect(notification.body_text).toMatch(/(?:Piano|A): /);
    expect(notification.body_text).toContain("⚙️ Stato operativo");
    expect(notification.body_text).not.toContain("gid://partners/Shop/");
    expect(notification.dedupe_key).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(
    results.slice(0, 4).every(({ notification_kind }) => notification_kind === "lifecycle"),
  ).toBe(true);
  expect(results.slice(4).every(({ notification_kind }) => notification_kind === "billing")).toBe(
    true,
  );

  const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(request.query).toContain("RELATIONSHIP_UNINSTALLED");
  expect(request.query).toContain("SUBSCRIPTION_CHARGE_FROZEN");
  expect(request.query).toContain("ONE_TIME_CHARGE_ACTIVATED");
  expect(request.query).toContain("myshopifyDomain");
  expect(request.query).toContain("shop { id myshopifyDomain name }");
  expect(request.query).toContain("amount { amount currencyCode }");
  expect(request.query).toContain("... on AppSubscriptionEvent");
  expect(request.variables).toMatchObject({
    appId: PARTNER_CONFIG.appId,
    occurredAtMin: "2026-08-23T10:00:00.000Z",
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    `https://partners.shopify.com/${PARTNER_CONFIG.organizationId}/api/2026-07/graphql.json`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": PARTNER_CONFIG.accessToken,
    },
  });
  expect(
    await env.DB.prepare("SELECT display_name FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toMatchObject({ display_name: "Negozio CF Ready" });
});

test("un piano attivato dopo un altro viene notificato come passaggio esplicito", async () => {
  const shop = await insertShop("cambio-piano.myshopify.com");
  const monthly = billing("gid://shopify/AppSubscription/mensile", "EVERY_30_DAYS", "2.99");
  await syncBillingAccount(env.DB, shop, monthly, {
    today: "2026-08-24",
    timeZone: "Europe/Rome",
    pricingGeneration: "launch",
    storedAccount: null,
  });
  const stored = await readBillingAccount(env.DB, shop);
  const annual = billing("gid://shopify/AppSubscription/annuale", "ANNUAL", "29.90");
  await syncBillingAccount(env.DB, shop, annual, {
    today: "2026-08-24",
    timeZone: "Europe/Rome",
    pricingGeneration: "launch",
    storedAccount: stored,
  });

  const fetcher = vi.fn(async () =>
    partnerResponse([
      {
        cursor: "cursor-cambio",
        node: {
          type: "SUBSCRIPTION_CHARGE_ACTIVATED",
          occurredAt: "2026-08-24T09:59:00.000Z",
          shop: {
            id: "gid://partners/Shop/cambio",
            myshopifyDomain: shop,
            name: "Cambio Piano",
          },
          charge: {
            id: "gid://shopify/AppSubscription/annuale",
            name: "CF Ready — abbonamento annuale",
            amount: { amount: "29.90", currencyCode: "EUR" },
            billingOn: "2027-08-24T09:59:00.000Z",
            test: false,
          },
        },
      },
    ]),
  );
  await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: fetcher as typeof fetch });

  expect(
    await env.DB.prepare("SELECT subject, body_text FROM owner_notifications").first(),
  ).toMatchObject({
    subject: "🔄 CF Ready · Piano cambiato",
    body_text: expect.stringContaining(
      "Da: Mensile\nA: CF Ready — abbonamento annuale\nImporto: 29,90 € / anno",
    ),
  });
});

test("attivazione, scadenza e conversione della prova includono nome store e durata", async () => {
  const started = await insertTrialShop("prova-avviata.myshopify.com", "active");
  const expired = await insertTrialShop("prova-scaduta.myshopify.com", "expired");
  const converted = await insertTrialShop("prova-convertita.myshopify.com", "converted");
  await seedBillingAccount(converted.shopId, "annual");
  await env.DB.batch([
    trialEvent(started.shopId, "trial_started", "2026-08-24T09:57:00.000Z"),
    trialEvent(expired.shopId, "trial_expired", "2026-08-24T09:58:00.000Z"),
    trialEvent(converted.shopId, "trial_converted", "2026-08-24T09:59:00.000Z"),
  ]);

  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 3 });
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });
  const { results } = await env.DB.prepare(
    "SELECT notification_kind, subject, body_text FROM owner_notifications ORDER BY id",
  ).all<Record<string, string>>();
  expect(results).toMatchObject([
    {
      notification_kind: "trial",
      subject: "🧪 CF Ready · Prova gratuita attivata",
      body_text: expect.stringContaining(
        `Nome: Prova avviata\nURL: https://${started.shop}\n\n` +
          `🧪 Prova\nStato: Attiva\nPiano: Prova gratuita\n` +
          `Termine prova: 7 set 2026\nGiorni disponibili: 14`,
      ),
    },
    {
      subject: "🟡 CF Ready · Prova gratuita terminata",
      body_text: expect.stringContaining(
        `Nome: Prova scaduta\nURL: https://${expired.shop}\n\n` +
          `🧪 Prova\nStato: Terminata\nPiano: Prova gratuita (terminata)`,
      ),
    },
    {
      subject: "🟢 CF Ready · Prova convertita",
      body_text: expect.stringContaining(
        `Nome: Prova convertita\nURL: https://${converted.shop}\n\n` +
          `🧪 Prova\nStato: Convertita\nPiano: Annuale`,
      ),
    },
  ]);
});

test("onboarding e attivazione Validation generano notifiche operative dedicate", async () => {
  const shop = await insertShop("operativo.myshopify.com");
  const shopRow = await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>();
  const at = "2026-08-24T10:20:00.000Z";
  await env.DB.batch([
    env.DB.prepare("UPDATE shops SET display_name = 'Atelier <CF & Ready>' WHERE id = ?").bind(
      shopRow!.id,
    ),
    env.DB.prepare(
      `INSERT INTO app_state (
         shop_id, validation_enabled, onboarding_status, onboarding_step, updated_at
       ) VALUES (?, 0, 'completed', 1, ?)`,
    ).bind(shopRow!.id, at),
    trialEvent(shopRow!.id, "onboarding_completed", "2026-08-24T10:20:00.000Z", "onboarding"),
    trialEvent(shopRow!.id, "validation_enabled", "2026-08-24T10:21:00.000Z", "validation"),
    trialEvent(shopRow!.id, "validation_disabled", "2026-08-24T10:22:00.000Z", "validation"),
  ]);

  expect(await pollLocalNotifications(env.DB, new Date("2026-08-24T10:30:00.000Z"))).toMatchObject({
    inserted: 3,
  });
  const { results } = await env.DB.prepare(
    `SELECT notification_kind, subject, body_text FROM owner_notifications ORDER BY id`,
  ).all<Record<string, string>>();
  expect(results.map(({ notification_kind }) => notification_kind)).toEqual([
    "lifecycle",
    "lifecycle",
    "lifecycle",
  ]);
  expect(results.map(({ subject }) => subject)).toEqual([
    "✅ CF Ready · Onboarding completato",
    "🟢 CF Ready · Validation attivata",
    "🟡 CF Ready · Validation disattivata",
  ]);
  expect(results[0].body_text).toContain("Onboarding: Completato");
  expect(results[1].body_text).toContain("Validation: Attiva");
  expect(results[2].body_text).toContain("Validation: Non attiva");
  expect(results.every(({ body_text }) => body_text.includes("Nome: Atelier <CF & Ready>"))).toBe(
    true,
  );
});

test("paginazione Partner e checkpoint restano idempotenti", async () => {
  const requests: Array<{ init?: RequestInit }> = [];
  const shop = "pagine.myshopify.com";
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ init });
    const after = JSON.parse(String(init?.body)).variables.after as string | null;
    return partnerResponse(
      [
        relationship(
          after ? "RELATIONSHIP_REACTIVATED" : "RELATIONSHIP_INSTALLED",
          shop,
          after ? "09:59" : "09:58",
        ),
      ],
      !after,
    );
  });
  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: fetcher as typeof fetch }),
  ).toMatchObject({ inserted: 2, pages: 2 });
  expect(JSON.parse(String(requests[1].init?.body)).variables.after).toBe("cursor-09:58");
});

test("shop/redact blocca eventi Partner precedenti ma consente una reinstallazione successiva", async () => {
  const shop = "redatto.myshopify.com";
  await env.DB.prepare(
    "INSERT INTO owner_notification_redactions (shop_hash, redacted_at) VALUES (?, ?)",
  )
    .bind(await trialLedgerHash(shop), "2026-08-24T09:55:00.000Z")
    .run();
  const fetcher = vi.fn(async () =>
    partnerResponse([
      relationship("RELATIONSHIP_UNINSTALLED", shop, "09:54"),
      relationship("RELATIONSHIP_REACTIVATED", shop, "09:56"),
    ]),
  );

  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: fetcher as typeof fetch }),
  ).toMatchObject({ inserted: 1 });
  expect(await env.DB.prepare("SELECT subject FROM owner_notifications").first()).toMatchObject({
    subject: "🟢 CF Ready · Reinstallazione",
  });
});

test("un errore Partner non avanza il checkpoint", async () => {
  await expect(
    pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () => Response.json({ errors: [{ message: "errore" }] })),
    }),
  ).rejects.toThrow("partner_api_graphql_error");
  expect(
    await env.DB.prepare(
      "SELECT state_value FROM owner_notification_state WHERE state_key = 'partner_events_polled_at'",
    ).first(),
  ).toBeNull();
});

test("il replay Partner recupera un evento pubblicato con quasi un giorno di ritardo", async () => {
  const shop = await insertShop("partner-in-ritardo.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
     VALUES ('partner_events_polled_at', ?, ?)`,
  )
    .bind("2026-08-24T09:55:00.000Z", "2026-08-24T09:55:00.000Z")
    .run();
  const delayed = relationship("RELATIONSHIP_INSTALLED", shop, "09:00");
  delayed.node.occurredAt = "2026-08-23T10:00:00.000Z";
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    partnerResponse([delayed]),
  );

  expect(await pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher })).toMatchObject({
    inserted: 1,
  });
  const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(request.variables.occurredAtMin).toBe("2026-08-23T09:55:00.000Z");
});

test("il billing locale recupera un'attivazione assente dagli eventi Partner", async () => {
  const shop = await insertShop("billing-fallback.myshopify.com");
  const shopId = await shopIdFor(shop);
  await seedBillingAccount(shopId, "monthly");
  await insertBillingEvent({
    shopId,
    resourceId: "gid://shopify/AppSubscription/fallback",
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:58:00.000Z",
    previousPlanKind: "none",
  });

  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () => partnerResponse([])),
    }),
  ).toMatchObject({ inserted: 0 });
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });
  expect(
    await env.DB.prepare(
      "SELECT notification_kind, subject, body_text FROM owner_notifications",
    ).first(),
  ).toMatchObject({
    notification_kind: "billing",
    subject: "🟢 CF Ready · Piano attivato",
    body_text: expect.stringContaining("Piano: Mensile\nImporto: 2,99 € / mese"),
  });
});

test("il primo cursore billing recupera solo i gap nati dopo l'attivazione dell'outbox", async () => {
  const shop = await insertShop("billing-bootstrap.myshopify.com");
  const shopId = await shopIdFor(shop);
  await seedBillingAccount(shopId, "monthly");
  await insertBillingEvent({
    shopId,
    resourceId: "gid://shopify/AppPurchaseOneTime/prima-outbox",
    eventType: "active",
    planKind: "one_time",
    occurredAt: "2026-08-20T09:00:00.000Z",
    previousPlanKind: "none",
  });
  await env.DB.prepare(
    `INSERT INTO owner_notifications (
       dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
       status, available_at, sent_at, created_at, updated_at
     ) VALUES ('outbox-attiva', 'lifecycle', ?, 'evento esistente', 'corpo', ?,
               'sent', ?, ?, ?, ?)`,
  )
    .bind(
      shop,
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
    )
    .run();
  await insertBillingEvent({
    shopId,
    resourceId: "gid://shopify/AppSubscription/dopo-outbox",
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:30:00.000Z",
    previousPlanKind: "none",
  });

  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });
  const { results } = await env.DB.prepare(
    "SELECT subject FROM owner_notifications WHERE notification_kind = 'billing'",
  ).all<{ subject: string }>();
  expect(results).toEqual([{ subject: "🟢 CF Ready · Piano attivato" }]);
});

test("Partner e riconciliazione locale producono una sola notifica di attivazione", async () => {
  const shop = await insertShop("billing-doppia-fonte.myshopify.com");
  const shopId = await shopIdFor(shop);
  await seedBillingAccount(shopId, "monthly");
  const resourceId = "gid://shopify/AppSubscription/doppia-fonte";
  await insertBillingEvent({
    shopId,
    resourceId,
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:58:00.000Z",
    previousPlanKind: "none",
  });
  const partner = subscription("SUBSCRIPTION_CHARGE_ACTIVATED", shop, "09:59");
  partner.node.charge.id = resourceId;

  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () => partnerResponse([partner])),
    }),
  ).toMatchObject({ inserted: 1 });
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first(),
  ).toMatchObject({ count: 1 });
});

test("il cursore locale per ID non perde eventi inseriti con un timestamp arretrato", async () => {
  const shop = await insertTrialShop("cursore-id.myshopify.com", "active");
  await trialEvent(shop.shopId, "trial_started", "2026-08-24T09:58:00.000Z").run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });

  await trialEvent(
    shop.shopId,
    "validation_enabled",
    "2026-08-20T09:58:00.000Z",
    "validation",
  ).run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });
  expect(
    await env.DB.prepare(
      "SELECT subject FROM owner_notifications WHERE subject LIKE '%Validation%'",
    ).first(),
  ).toMatchObject({ subject: "🟢 CF Ready · Validation attivata" });
});

test("il fallback locale copre l'intero ciclo commerciale osservabile da Shopify Admin", async () => {
  const cases = [
    ["attivo", "active", "monthly", "none", "🟢 CF Ready · Piano attivato"],
    ["cambio", "active", "annual", "monthly", "🔄 CF Ready · Piano cambiato"],
    ["disdetto", "ending", "monthly", "monthly", "🟡 CF Ready · Abbonamento in scadenza"],
    ["terminato", "expired", "none", "monthly", "🟡 CF Ready · Abbonamento terminato"],
    ["rimborsato", "refunded", "one_time", "one_time", "🔴 CF Ready · Pagamento unico rimborsato"],
  ] as const;

  for (const [slug, eventType, planKind, previousPlanKind] of cases) {
    const shop = await insertShop(`${slug}.myshopify.com`);
    const shopId = await shopIdFor(shop);
    await seedBillingAccount(shopId, planKind === "annual" ? "annual" : "monthly");
    await insertBillingEvent({
      shopId,
      resourceId: `gid://shopify/AppSubscription/${slug}`,
      eventType,
      planKind,
      occurredAt: "2026-08-24T09:58:00.000Z",
      previousPlanKind,
    });
  }

  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: cases.length });
  const { results } = await env.DB.prepare(
    "SELECT subject FROM owner_notifications ORDER BY id",
  ).all<{ subject: string }>();
  expect(results.map(({ subject }) => subject)).toEqual(cases.map((entry) => entry[4]));
});

test("installazione e disinstallazione locali coprono Partner senza duplicare", async () => {
  const shop = await insertShop("lifecycle-fallback.myshopify.com");
  const shopId = await shopIdFor(shop);
  await env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     VALUES (?, 'app_installed', 'lifecycle', ?)`,
  )
    .bind(shopId, "2026-08-24T09:58:00.000Z")
    .run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });
  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () =>
        partnerResponse([relationship("RELATIONSHIP_INSTALLED", shop, "09:58")]),
      ),
    }),
  ).toMatchObject({ inserted: 0 });

  const reverseShop = await insertShop("lifecycle-partner-prima.myshopify.com");
  const reverseShopId = await shopIdFor(reverseShop);
  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () =>
        partnerResponse([relationship("RELATIONSHIP_INSTALLED", reverseShop, "09:58")]),
      ),
    }),
  ).toMatchObject({ inserted: 1 });
  await env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     VALUES (?, 'app_installed', 'lifecycle', ?)`,
  )
    .bind(reverseShopId, "2026-08-24T09:58:00.000Z")
    .run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });

  await env.DB.batch([
    env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = ?").bind(
      shopId,
    ),
    env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_uninstalled', 'lifecycle', ?)`,
    ).bind(shopId, "2026-08-24T09:59:00.000Z"),
  ]);
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 1 });
  const { results } = await env.DB.prepare(
    "SELECT subject FROM owner_notifications ORDER BY id",
  ).all<{ subject: string }>();
  expect(results.map(({ subject }) => subject)).toEqual([
    "🟢 CF Ready · Nuova installazione",
    "🟢 CF Ready · Nuova installazione",
    "🔴 CF Ready · Disinstallazione",
  ]);
});

test("Telegram ritenta senza duplicare e invia una Rich Message strutturata", async () => {
  const shop = "telegram.myshopify.com";
  await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
    now: NOW,
    fetcher: vi.fn(async () =>
      partnerResponse([
        relationship("RELATIONSHIP_INSTALLED", shop, "09:58", "Atelier <CF & Ready>"),
      ]),
    ) as unknown as typeof fetch,
  });
  const telegram = {
    botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
    chatId: "987654321",
  };
  const send = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: false, description: "errore sintetico" }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 1 } }));

  expect(
    await deliverOwnerNotifications(env.DB, telegram, {
      now: new Date("2026-08-24T10:01:00.000Z"),
      fetcher: send as typeof fetch,
    }),
  ).toEqual({ sent: 0, failed: 1 });
  expect(
    await env.DB.prepare("SELECT status, attempts, available_at FROM owner_notifications").first(),
  ).toMatchObject({
    status: "pending",
    attempts: 1,
    available_at: "2026-08-24T10:06:00.000Z",
  });
  expect(
    await deliverOwnerNotifications(env.DB, telegram, {
      now: new Date("2026-08-24T10:06:00.000Z"),
      fetcher: send as typeof fetch,
    }),
  ).toEqual({ sent: 1, failed: 0 });

  expect(send.mock.calls[1][0]).toBe(
    `https://api.telegram.org/bot${telegram.botToken}/sendRichMessage`,
  );
  expect(send.mock.calls[1][1]).toMatchObject({
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const message = JSON.parse(String(send.mock.calls[1][1]?.body));
  expect(message).toMatchObject({
    chat_id: telegram.chatId,
    rich_message: { skip_entity_detection: true },
  });
  expect(message).not.toHaveProperty("protect_content");
  expect(message).not.toHaveProperty("parse_mode");
  expect(message).not.toHaveProperty("link_preview_options");
  const blocks = message.rich_message.blocks as Array<Record<string, unknown>>;
  expect(blocks[0]).toEqual({
    type: "heading",
    text: "🟢 CF Ready · Nuova installazione",
    size: 2,
  });
  expect(blocks).toContainEqual({
    type: "table",
    cells: [
      [{ text: { type: "bold", text: "Nome" }, is_header: true }, { text: "Atelier <CF & Ready>" }],
      [{ text: { type: "bold", text: "URL" }, is_header: true }, { text: `https://${shop}` }],
    ],
    is_bordered: true,
    is_striped: true,
    is_compact: true,
    caption: "🏪 Store",
  });
  expect(blocks).toContainEqual({
    type: "buttons",
    buttons: [
      { text: "Apri store", style: "primary", url: `https://${shop}` },
      { text: "Copia URL", copy_text: { text: `https://${shop}` } },
    ],
    align: "center",
  });
  expect(blocks).toContainEqual({
    type: "footer",
    text: expect.stringContaining("🕒 Evento:"),
  });
  expect(JSON.stringify(blocks)).toContain("Nessun piano attivo");
  expect(JSON.stringify(message)).not.toContain("gid://partners/Shop/");
});

test("un claim interrotto al quinto tentativo diventa terminale senza un sesto invio", async () => {
  await env.DB.prepare(
    `INSERT INTO owner_notifications (
       dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at, status,
       attempts, available_at, claim_token, claimed_at, created_at, updated_at
     ) VALUES (
       'claim-esaurito', 'lifecycle', 'claim-test.myshopify.com', 'oggetto', 'corpo', ?, 'processing', 5, ?,
       'claim-precedente', ?, ?, ?
     )`,
  )
    .bind(
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
    )
    .run();
  const send = vi.fn();
  expect(
    await deliverOwnerNotifications(
      env.DB,
      { botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD", chatId: "987654321" },
      { now: new Date("2026-08-24T09:16:00.000Z"), fetcher: send as typeof fetch },
    ),
  ).toEqual({ sent: 0, failed: 0 });
  expect(send).not.toHaveBeenCalled();
  expect(
    await env.DB.prepare(
      "SELECT status, attempts, last_error_code FROM owner_notifications",
    ).first(),
  ).toMatchObject({
    status: "failed",
    attempts: 5,
    last_error_code: "telegram_send_interrupted",
  });
});

test("i confini Partner rifiutano configurazione, trasporto, JSON, payload ed eventi invalidi", async () => {
  for (const config of [
    { ...PARTNER_CONFIG, organizationId: " " },
    { ...PARTNER_CONFIG, appId: " " },
    { ...PARTNER_CONFIG, accessToken: " " },
  ]) {
    await expect(pollPartnerEvents(env.DB, config, { now: NOW })).rejects.toThrow(
      "partner_api_configuration_incomplete",
    );
  }

  const cases: Array<[string, Response]> = [
    ["partner_api_request_failed", new Response("errore", { status: 503 })],
    ["partner_api_invalid_json", new Response("non-json")],
    ["partner_api_invalid_payload", Response.json({ data: { app: { events: null } } })],
    ["partner_api_invalid_payload", partnerResponse([{ cursor: "x", node: { type: "IGNORED" } }])],
  ];
  for (const [code, response] of cases) {
    await expect(
      pollPartnerEvents(env.DB, PARTNER_CONFIG, {
        now: NOW,
        fetcher: vi.fn(async () => response.clone()),
      }),
    ).rejects.toThrow(code);
  }

  const repeatedCursor = vi.fn(async () =>
    partnerResponse(
      [relationship("RELATIONSHIP_INSTALLED", "cursor.myshopify.com", "09:58")],
      true,
    ),
  );
  await expect(
    pollPartnerEvents(env.DB, PARTNER_CONFIG, { now: NOW, fetcher: repeatedCursor }),
  ).rejects.toThrow("partner_api_invalid_cursor");
});

test("le opzioni predefinite di poll usano orologio e fetch globali senza effetti esterni", async () => {
  const fetcher = vi.fn(async () => partnerResponse([]));
  vi.stubGlobal("fetch", fetcher);
  try {
    expect(await pollPartnerEvents(env.DB, PARTNER_CONFIG)).toMatchObject({
      inserted: 0,
      pages: 1,
    });
    expect(await pollLocalNotifications(env.DB)).toMatchObject({ inserted: 0, pages: 2 });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("il poll locale rifiuta timestamp ed eventi billing fuori contratto", async () => {
  const shop = await insertShop("payload-locale.myshopify.com");
  const shopId = await shopIdFor(shop);
  await env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     VALUES (?, 'trial_started', 'billing', 'non-data')`,
  )
    .bind(shopId)
    .run();
  await expect(pollLocalNotifications(env.DB, NOW)).rejects.toThrow(
    "billing_event_invalid_timestamp",
  );

  await env.DB.prepare("DELETE FROM app_events").run();
  await insertBillingEvent({
    shopId,
    resourceId: "gid://shopify/AppSubscription/invalido",
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:58:00.000Z",
    previousPlanKind: "none",
  });
  await env.DB.prepare("UPDATE billing_events SET shopify_resource_gid = ''").run();
  await expect(pollLocalNotifications(env.DB, NOW)).rejects.toThrow(
    "billing_event_invalid_payload",
  );
});

test("Telegram copre config invalide, risposta non JSON, claim perso e tentativo terminale", async () => {
  await expect(
    deliverOwnerNotifications(env.DB, { botToken: "invalido", chatId: "1" }),
  ).rejects.toThrow("telegram_bot_token_invalid");
  await expect(
    deliverOwnerNotifications(env.DB, {
      botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
      chatId: "chat",
    }),
  ).rejects.toThrow("telegram_chat_id_invalid");

  const insert = async (dedupeKey: string, attempts = 0, body = "corpo") => {
    await env.DB.prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         status, attempts, available_at, created_at, updated_at
       ) VALUES (?, 'lifecycle', 'errori.myshopify.com', 'Oggetto', ?, ?, 'pending', ?, ?, ?, ?)`,
    )
      .bind(
        dedupeKey,
        body,
        "2026-08-24T09:00:00.000Z",
        attempts,
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
      )
      .run();
  };
  const telegram = {
    botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
    chatId: "987654321",
  };

  await insert("json-invalido");
  expect(
    await deliverOwnerNotifications(env.DB, telegram, {
      now: NOW,
      fetcher: vi.fn(async () => new Response("non-json")),
    }),
  ).toEqual({ sent: 0, failed: 1 });

  await env.DB.prepare("DELETE FROM owner_notifications").run();
  await insert("claim-perso");
  expect(
    await deliverOwnerNotifications(env.DB, telegram, {
      now: NOW,
      fetcher: vi.fn(async () => {
        await env.DB.prepare("UPDATE owner_notifications SET claim_token = 'sostituito'").run();
        return Response.json({ ok: true });
      }),
    }),
  ).toEqual({ sent: 0, failed: 1 });

  await env.DB.prepare("DELETE FROM owner_notifications").run();
  await insert("terminale", 4);
  expect(
    await deliverOwnerNotifications(env.DB, telegram, {
      now: NOW,
      fetcher: vi.fn(async () => Response.json({ ok: false })),
    }),
  ).toEqual({ sent: 0, failed: 1 });
  expect(
    await env.DB.prepare("SELECT status, attempts, available_at FROM owner_notifications").first(),
  ).toMatchObject({
    status: "failed",
    attempts: 5,
    available_at: "2026-08-24T11:20:00.000Z",
  });
});

test("delivery rispetta il limite massimo di invii per ciclo", async () => {
  const at = "2026-08-24T09:00:00.000Z";
  await env.DB.batch(
    ["limite-1", "limite-2"].map((key) =>
      env.DB.prepare(
        `INSERT INTO owner_notifications (
           dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
           status, available_at, created_at, updated_at
         ) VALUES (?, 'lifecycle', 'limite.myshopify.com', 'Oggetto', 'corpo', ?, 'pending', ?, ?, ?)`,
      ).bind(key, at, at, at, at),
    ),
  );
  const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true }),
  );
  expect(
    await deliverOwnerNotifications(
      env.DB,
      { botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD", chatId: "987654321" },
      { now: NOW, max: 1, fetcher: send },
    ),
  ).toEqual({ sent: 1, failed: 0 });
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM owner_notifications WHERE status = 'pending'",
    ).first(),
  ).toMatchObject({ count: 1 });
});

test("la Rich Message degrada in sicurezza senza URL, etichette, descrizione o footer", async () => {
  await env.DB.prepare(
    `INSERT INTO owner_notifications (
       dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
       status, available_at, created_at, updated_at
     ) VALUES ('rich-minimale', 'lifecycle', 'rich.myshopify.com', 'Oggetto', ?, ?, 'pending', ?, ?, ?)`,
  )
    .bind(
      "🏪 Store\nURL: http://non-sicuro.example\nRiga senza etichetta\n⚙️ Stato operativo\nValore libero",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
      "2026-08-24T09:00:00.000Z",
    )
    .run();
  const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true }),
  );
  expect(
    await deliverOwnerNotifications(
      env.DB,
      { botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD", chatId: "987654321" },
      { now: NOW, max: 1, fetcher: send },
    ),
  ).toEqual({ sent: 1, failed: 0 });
  const blocks = JSON.parse(String(send.mock.calls[0][1]?.body)).rich_message.blocks;
  expect(blocks.some((block: { type: string }) => block.type === "paragraph")).toBe(false);
  expect(blocks.some((block: { type: string }) => block.type === "buttons")).toBe(false);
  expect(blocks.some((block: { type: string }) => block.type === "footer")).toBe(false);
  expect(JSON.stringify(blocks)).toContain("Riga senza etichetta");
});

test("fallback locali coprono reinstallazione, equivalenza, dettagli assenti e prova incompleta", async () => {
  const lifecycleShop = await insertShop("reinstallata-locale.myshopify.com");
  const lifecycleId = await shopIdFor(lifecycleShop);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_uninstalled', 'lifecycle', '2026-08-24T09:55:00.000Z')`,
    ).bind(lifecycleId),
    env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_installed', 'lifecycle', '2026-08-24T09:58:00.000Z')`,
    ).bind(lifecycleId),
    env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_installed', 'lifecycle', '2026-08-24T09:59:00.000Z')`,
    ).bind(lifecycleId),
  ]);

  const billingShop = await insertShop("dettagli-assenti.myshopify.com");
  const billingId = await shopIdFor(billingShop);
  await insertBillingEvent({
    shopId: billingId,
    resourceId: "gid://shopify/AppSubscription/dettagli-1",
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:58:00.000Z",
    previousPlanKind: "none",
  });
  await env.DB.prepare(
    "UPDATE billing_events SET amount_minor = NULL, currency = NULL, period_end = 'non-data' WHERE shop_id = ?",
  )
    .bind(billingId)
    .run();

  const trial = await insertTrialShop("prova-incompleta.myshopify.com", "active");
  await env.DB.prepare("UPDATE trials SET ends_at = NULL WHERE shop_id = ?")
    .bind(trial.shopId)
    .run();
  await trialEvent(trial.shopId, "trial_started", "2026-08-24T09:58:00.000Z").run();

  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 4 });
  const { results } = await env.DB.prepare(
    "SELECT subject, body_text FROM owner_notifications ORDER BY id",
  ).all<{ subject: string; body_text: string }>();
  expect(results.map(({ subject }) => subject)).toEqual([
    "🔴 CF Ready · Disinstallazione",
    "🟢 CF Ready · Reinstallazione",
    "🧪 CF Ready · Prova gratuita attivata",
    "🟢 CF Ready · Piano attivato",
  ]);
  expect(results[2].body_text).not.toContain("Termine prova:");
  expect(results[2].body_text).not.toContain("Giorni disponibili:");
  expect(results[3].body_text).not.toContain("Importo:");
  expect(results[3].body_text).not.toContain("Prossimo addebito:");

  await insertBillingEvent({
    shopId: billingId,
    resourceId: "gid://shopify/AppSubscription/dettagli-2",
    eventType: "active",
    planKind: "monthly",
    occurredAt: "2026-08-24T09:59:00.000Z",
    previousPlanKind: "none",
  });
  await env.DB.prepare(
    "UPDATE billing_events SET amount_minor = NULL, currency = NULL, period_end = 'non-data' WHERE shopify_resource_gid = ?",
  )
    .bind("gid://shopify/AppSubscription/dettagli-2")
    .run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });
});

test("un nome piano non classificabile usa il fallback senza inventare un entitlement", async () => {
  const shop = await insertShop("piano-speciale.myshopify.com");
  const event = subscription("SUBSCRIPTION_CHARGE_ACTIVATED", shop, "09:59");
  event.node.charge.name = "CF Ready — offerta speciale";
  expect(
    await pollPartnerEvents(env.DB, PARTNER_CONFIG, {
      now: NOW,
      fetcher: vi.fn(async () => partnerResponse([event])),
    }),
  ).toMatchObject({ inserted: 1 });
  expect(await env.DB.prepare("SELECT body_text FROM owner_notifications").first()).toMatchObject({
    body_text: expect.stringContaining("Piano: CF Ready — offerta speciale"),
  });
});

test("delivery usa i default in assenza di notifiche e stabilizza errori non canonici", async () => {
  const telegram = {
    botToken: "123456789:abcdefghijklmnopqrstuvwxyz_ABCD",
    chatId: "987654321",
  };
  vi.stubGlobal("fetch", vi.fn());
  try {
    expect(await deliverOwnerNotifications(env.DB, telegram)).toEqual({ sent: 0, failed: 0 });
  } finally {
    vi.unstubAllGlobals();
  }

  for (const [key, thrown] of [
    ["errore-stringa", "boom"],
    ["errore-non-canonico", new Error("Errore non canonico!")],
  ] as const) {
    await env.DB.prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         status, available_at, created_at, updated_at
       ) VALUES (?, 'trial', 'error-code.myshopify.com', 'Oggetto', 'corpo', ?, 'pending', ?, ?, ?)`,
    )
      .bind(
        key,
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T09:00:00.000Z",
      )
      .run();
    await deliverOwnerNotifications(env.DB, telegram, {
      now: NOW,
      max: 1,
      fetcher: vi.fn(async () => {
        throw thrown;
      }),
    });
  }
  const { results } = await env.DB.prepare(
    "SELECT metadata_json FROM app_events WHERE event_name = 'owner_notification_send_failed' ORDER BY id",
  ).all<{ metadata_json: string }>();
  expect(results.map(({ metadata_json }) => JSON.parse(metadata_json).error_code)).toEqual([
    "owner_notification_send_failed",
    "owner_notification_send_failed",
  ]);
});

test("il cursore legacy e uno stato numerico fuori range non saltano eventi nuovi", async () => {
  const shop = await insertShop("cursore-legacy.myshopify.com");
  const shopId = await shopIdFor(shop);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
       VALUES (?, 'app_installed', 'lifecycle', '2026-08-24T09:00:00.000Z')`,
    ).bind(shopId),
    env.DB.prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES ('local_notifications_polled_at', '2026-08-24T09:30:00.000Z', '2026-08-24T09:30:00.000Z')`,
    ),
    env.DB.prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES ('local_app_events_after_id', '999999999999999999999999', '2026-08-24T09:30:00.000Z')`,
    ),
  ]);
  await env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     VALUES (?, 'ignored_event', 'lifecycle', '2026-08-24T09:58:00.000Z')`,
  )
    .bind(shopId)
    .run();
  expect(await pollLocalNotifications(env.DB, NOW)).toMatchObject({ inserted: 0 });
});

function partnerResponse(edges: unknown[], hasNextPage = false) {
  return Response.json({ data: { app: { events: { edges, pageInfo: { hasNextPage } } } } });
}

function relationship(type: string, shop: string, time: string, name = "Negozio CF Ready") {
  return {
    cursor: `cursor-${time}`,
    node: {
      type,
      occurredAt: `2026-08-24T${time.length === 5 ? `${time}:00` : time}.000Z`,
      shop: { id: `gid://partners/Shop/${time}`, myshopifyDomain: shop, name },
    },
  };
}

function subscription(type: string, shop: string, time: string) {
  return {
    ...relationship(type, shop, time),
    node: {
      ...relationship(type, shop, time).node,
      charge: {
        id: `gid://shopify/AppSubscription/${time}`,
        name: "CF Ready — abbonamento mensile",
        amount: { amount: "2.99", currencyCode: "EUR" },
        billingOn: "2026-09-24T10:00:00.000Z",
        test: false,
      },
    },
  };
}

function oneTime(type: string, shop: string, time: string) {
  return {
    ...relationship(type, shop, time),
    node: {
      ...relationship(type, shop, time).node,
      charge: {
        id: `gid://shopify/AppPurchaseOneTime/${time}`,
        name: "CF Ready — pagamento unico",
        amount: { amount: "89.90", currencyCode: "EUR" },
        test: false,
      },
    },
  };
}

function billing(id: string, interval: "EVERY_30_DAYS" | "ANNUAL", amount: string) {
  return {
    subscription: {
      id,
      name:
        interval === "ANNUAL" ? "CF Ready — abbonamento annuale" : "CF Ready — abbonamento mensile",
      currentPeriodEnd: "2027-08-24T09:59:00.000Z",
      interval,
      amount,
      currency: "EUR",
    },
    oneTime: null,
    pendingOneTime: false,
  };
}

async function insertTrialShop(shop: string, status: "active" | "expired" | "converted") {
  await insertShop(shop);
  const shopRow = await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>();
  const at = "2026-08-24T09:00:00.000Z";
  const displayName = {
    active: "Prova avviata",
    expired: "Prova scaduta",
    converted: "Prova convertita",
  }[status];
  await env.DB.batch([
    env.DB.prepare("UPDATE shops SET display_name = ? WHERE id = ?").bind(displayName, shopRow!.id),
    env.DB.prepare(
      `INSERT INTO trials (
         shop_id, status, eligible_at, started_at, ends_at, pricing_generation, created_at, updated_at
       ) VALUES (?, ?, ?, ?, '2026-09-07', 'launch', ?, ?)`,
    ).bind(shopRow!.id, status, at, at, at, at),
  ]);
  return { shop, shopId: shopRow!.id };
}

function trialEvent(shopId: number, eventName: string, occurredAt: string, eventClass = "billing") {
  return env.DB.prepare(
    `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(shopId, eventName, eventClass, occurredAt);
}

async function shopIdFor(shop: string) {
  const row = await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?")
    .bind(shop)
    .first<{ id: number }>();
  return row!.id;
}

function insertBillingEvent({
  shopId,
  resourceId,
  eventType,
  planKind,
  occurredAt,
  previousPlanKind,
}: {
  shopId: number;
  resourceId: string;
  eventType: "active" | "ending" | "expired" | "refunded";
  planKind: "monthly" | "annual" | "one_time" | "none";
  occurredAt: string;
  previousPlanKind: "monthly" | "annual" | "one_time" | "none";
}) {
  return env.DB.prepare(
    `INSERT INTO billing_events (
       shop_id, shopify_resource_gid, event_type, status, amount_minor, currency,
       period_end, occurred_at, created_at, previous_entitlement_status, previous_plan_kind
     ) VALUES (?, ?, ?, ?, 299, 'EUR', '2026-09-24', ?, ?, 'none', ?)`,
  )
    .bind(shopId, resourceId, eventType, planKind, occurredAt, occurredAt, previousPlanKind)
    .run();
}

async function seedBillingAccount(shopId: number, planKind: "monthly" | "annual") {
  const at = "2026-08-24T09:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO billing_accounts (
       shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
       current_period_end, last_reconciled_at, created_at, updated_at
     ) VALUES (?, 'active', ?, 'launch', 'gid://shopify/AppSubscription/convertita',
               '2027-08-24', ?, ?, ?)`,
  )
    .bind(shopId, planKind, at, at, at)
    .run();
}
