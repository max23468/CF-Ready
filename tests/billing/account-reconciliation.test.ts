import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { entitlementFor, syncBillingAccount } from "../../app/billing.server";
import { insertShop, NESSUN_ADDEBITO, opzioni, abbonamento } from "../support/billing";

test("una sottoscrizione attiva diventa diritto fino a fine periodo", async () => {
  const shop = await insertShop("abbonato.example.myshopify.com");

  const account = await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/1", "2026-08-31T21:59:59Z"),
    opzioni,
  );

  expect(account).toMatchObject({
    entitlement_status: "active",
    plan_kind: "monthly",
    current_period_end: "2026-08-31",
  });
  expect(entitlementFor(null, "2026-08-01", account)).toEqual({
    kind: "subscription",
    validThrough: "2026-08-31",
  });
});

test("la cancellazione lascia l'accesso fino a fine periodo e poi scade", async () => {
  const shop = await insertShop("cancellato.example.myshopify.com");
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/2", "2026-08-31T21:59:59Z"),
    opzioni,
  );

  // Shopify non elenca più la sottoscrizione cancellata: il periodo pagato resta nostro.
  const inScadenza = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);
  expect(inScadenza).toMatchObject({
    entitlement_status: "ending",
    current_period_end: "2026-08-31",
  });
  expect(entitlementFor(null, "2026-08-31", inScadenza)).toEqual({
    kind: "subscription",
    validThrough: "2026-08-31",
  });

  const scaduto = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, {
    ...opzioni,
    today: "2026-09-01",
  });
  expect(scaduto.entitlement_status).toBe("expired");
  expect(entitlementFor(null, "2026-09-01", scaduto)).toEqual({ kind: "none", validThrough: null });
});

test("gli eventi billing sono append-only e idempotenti", async () => {
  const shop = await insertShop("eventi.example.myshopify.com");
  const stato = abbonamento("gid://shopify/AppSubscription/3", "2026-08-31T21:59:59Z");

  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);

  const { results } = await env.DB.prepare(
    `SELECT event_type, status, amount_minor, currency, period_end FROM billing_events
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
     ORDER BY id`,
  )
    .bind(shop)
    .all<Record<string, unknown>>();

  expect(results).toEqual([
    {
      event_type: "active",
      status: "monthly",
      amount_minor: 299,
      currency: "EUR",
      period_end: "2026-08-31",
    },
    {
      event_type: "ending",
      status: "monthly",
      amount_minor: null,
      currency: null,
      period_end: "2026-08-31",
    },
  ]);
});

test("conto ed evento billing falliscono atomicamente", async () => {
  const shop = await insertShop("evento-atomico.example.myshopify.com");
  await env.DB.prepare(
    `CREATE TRIGGER rifiuta_evento BEFORE INSERT ON billing_events
     BEGIN SELECT RAISE(FAIL, 'evento rifiutato'); END`,
  ).run();

  await expect(
    syncBillingAccount(
      env.DB,
      shop,
      abbonamento("gid://shopify/AppSubscription/atomico", "2026-08-31T21:59:59Z"),
      opzioni,
    ),
  ).rejects.toThrow();
  await env.DB.prepare("DROP TRIGGER rifiuta_evento").run();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS totale FROM billing_accounts WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ totale: 0 });
});

test("un cambio di piano produce un evento anche se lo stato resta attivo", async () => {
  const shop = await insertShop("cambio.example.myshopify.com");

  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/10", "2026-08-31T21:59:59Z"),
    opzioni,
  );
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/11", "2027-07-31T21:59:59Z", "ANNUAL"),
    opzioni,
  );

  const { results } = await env.DB.prepare(
    `SELECT shopify_resource_gid, status FROM billing_events
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
     ORDER BY id`,
  )
    .bind(shop)
    .all<{ shopify_resource_gid: string; status: string }>();

  expect(results).toEqual([
    { shopify_resource_gid: "gid://shopify/AppSubscription/10", status: "monthly" },
    { shopify_resource_gid: "gid://shopify/AppSubscription/11", status: "annual" },
  ]);
});

test("la conversione a una tantum registra il prezzo dell'acquisto", async () => {
  const shop = await insertShop("conversione.example.myshopify.com");
  const billing = {
    ...abbonamento("gid://shopify/AppSubscription/conversione", "2026-08-31T21:59:59Z"),
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/conversione",
      createdAt: "2026-08-01T10:00:00Z",
      amount: "89.90",
      currency: "EUR",
    },
  };

  await syncBillingAccount(env.DB, shop, billing, opzioni);

  expect(
    await env.DB.prepare(
      `SELECT shopify_resource_gid, amount_minor, currency FROM billing_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    shopify_resource_gid: "gid://shopify/AppPurchaseOneTime/conversione",
    amount_minor: 8990,
    currency: "EUR",
  });
});
