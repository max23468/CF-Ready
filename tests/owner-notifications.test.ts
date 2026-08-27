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
    occurredAtMin: "2026-08-24T09:45:00.000Z",
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
      [relationship("RELATIONSHIP_INSTALLED", shop, after ? "09:59" : "09:58")],
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
    await deliverOwnerNotifications(env.DB, telegram, {
      now: new Date("2026-08-24T10:06:00.000Z"),
      fetcher: send as typeof fetch,
    }),
  ).toEqual({ sent: 1, failed: 0 });

  expect(send.mock.calls[1][0]).toBe(
    `https://api.telegram.org/bot${telegram.botToken}/sendRichMessage`,
  );
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
