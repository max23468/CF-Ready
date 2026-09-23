import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  entitlementFor,
  markOrdinaryCancellationConfirmed,
  recordOrdinaryCancellationIntent,
  syncBillingAccount,
} from "../../app/billing.server";
import { reconcileNextStaleBilling } from "../../app/billing/periodic-reconciliation.server";
import { insertShop, NESSUN_ADDEBITO, opzioni, abbonamento } from "../support/billing";
import { shopContext } from "../support/lifecycle";

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

test("una sottoscrizione attiva senza fine periodo non inventa una data", async () => {
  const shop = await insertShop("periodo-assente.example.myshopify.com");
  const billing = abbonamento("gid://shopify/AppSubscription/senza-periodo", null);

  const account = await syncBillingAccount(env.DB, shop, billing, opzioni);

  expect(account).toMatchObject({
    entitlement_status: "active",
    shopify_status: "ACTIVE",
    current_period_start: null,
    current_period_end: null,
  });
});

test("il backfill storico resta unknown finché Shopify non viene riconciliato ed è idempotente", async () => {
  const shop = await insertShop("backfill-storico.example.myshopify.com");
  const timestamp = "2026-07-01T00:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, shopify_charge_gid,
         created_at, updated_at
       ) SELECT id, 'active', 'annual', 'launch', 'gid://shopify/AppSubscription/legacy',
                ?, ? FROM shops WHERE shop_domain = ?`,
    ).bind(timestamp, timestamp, shop),
    env.DB.prepare(
      `INSERT INTO shopify_sessions (
         id, shop_id, is_online, access_token_ciphertext, session_payload_ciphertext,
         created_at, updated_at
       ) SELECT ?, id, 0, 'ciphertext', 'payload', ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(`offline_${shop}`, timestamp, timestamp, shop),
  ]);

  expect(
    await env.DB.prepare(
      "SELECT is_test, shopify_status FROM billing_accounts WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ is_test: null, shopify_status: "UNKNOWN" });

  const reconciler = async (_admin: unknown, db: D1Database, shopDomain: string) => {
    await db
      .prepare(
        `UPDATE billing_accounts SET is_test = 0, shopify_status = 'ACTIVE',
                last_reconciled_at = ?, updated_at = ?
          WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind("2026-09-21T10:00:00.000Z", "2026-09-21T10:00:00.000Z", shopDomain)
      .run();
    return { retryable: false, errorCode: null };
  };
  const options = {
    now: new Date("2026-09-21T10:00:00.000Z"),
    adminForShop: async () => ({}) as never,
    reconciler: reconciler as never,
  };

  await expect(reconcileNextStaleBilling(env.DB, options)).resolves.toMatchObject({
    attempted: true,
    shopDomain: shop,
    errorCode: null,
  });
  await expect(reconcileNextStaleBilling(env.DB, options)).resolves.toEqual({
    attempted: false,
    shopDomain: null,
    errorCode: null,
  });
});

test("la riconciliazione periodica predefinita legge Shopify e aggiorna il dominio commerciale", async () => {
  const shop = await insertShop("riconciliazione-periodica.example.myshopify.com");
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/periodica", "2026-10-31T22:59:59Z"),
    opzioni,
  );
  await env.DB.prepare(
    `INSERT INTO shopify_sessions (
       id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
     ) SELECT ?, id, 0, 'payload', ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("offline_periodica", "2026-09-20", "2026-09-20", shop)
    .run();
  const subscription = {
    id: "gid://shopify/AppSubscription/periodica",
    name: "balanced-monthly",
    status: "ACTIVE",
    createdAt: "2026-09-21T08:00:00Z",
    trialDays: 0,
    test: false,
    currentPeriodEnd: "2026-10-31T22:59:59Z",
    lineItems: [
      {
        plan: {
          pricingDetails: {
            interval: "EVERY_30_DAYS",
            price: { amount: "3.99", currencyCode: "EUR" },
          },
        },
      },
    ],
  };
  const admin = {
    graphql: async (query: string) =>
      query.includes("CfReadyContext")
        ? Response.json({
            data: {
              shop: {
                name: "Store periodico",
                ianaTimezone: "Europe/Rome",
                plan: { partnerDevelopment: false },
                shopAddress: { countryCodeV2: "IT" },
              },
              validations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          })
        : Response.json({
            data: {
              currentAppInstallation: {
                activeSubscriptions: [subscription],
                allSubscriptions: {
                  nodes: [subscription],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
                oneTimePurchases: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          }),
  };
  await env.DB.prepare(
    `UPDATE billing_accounts
        SET is_test = COALESCE(is_test, 0), last_reconciled_at = '2026-09-23T10:00:00.000Z'
      WHERE shop_id != (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();
  // syncBillingAccount registra la riconciliazione con l'orologio reale: la ancoriamo al `now`
  // fisso del test, altrimenti il conto smette di essere scaduto col passare del tempo.
  await env.DB.prepare(
    `UPDATE billing_accounts
        SET last_reconciled_at = '2026-09-22T09:00:00.000Z',
            reconciliation_attempted_at = '2026-09-22T09:00:00.000Z'
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();

  await expect(
    reconcileNextStaleBilling(env.DB, {
      now: new Date("2026-09-23T10:00:00.000Z"),
      adminForShop: async () => admin,
    }),
  ).resolves.toEqual({
    attempted: true,
    shopDomain: shop,
    errorCode: null,
  });
  expect(
    await env.DB.prepare(
      `SELECT b.is_test, b.shopify_status
         FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
        WHERE s.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toEqual({ is_test: 0, shopify_status: "ACTIVE" });
});

test("un rinnovo senza webhook aggiorna il metafield prima degli account ordinari", async () => {
  const shop = await insertShop("rinnovo-periodico.example.myshopify.com");
  const ordinary = await insertShop("rinnovo-ordinario.example.myshopify.com");
  const chargeGid = "gid://shopify/AppSubscription/rinnovo-periodico";
  await syncBillingAccount(env.DB, shop, abbonamento(chargeGid, "2026-09-21T21:59:59Z"), {
    ...opzioni,
    today: "2026-09-01",
  });
  await syncBillingAccount(
    env.DB,
    ordinary,
    abbonamento("gid://shopify/AppSubscription/rinnovo-ordinario", "2026-10-31T22:59:59Z"),
    opzioni,
  );
  for (const domain of [shop, ordinary]) {
    await env.DB.prepare(
      `INSERT INTO shopify_sessions (
         id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
       ) SELECT ?, id, 0, 'payload', ?, ? FROM shops WHERE shop_domain = ?`,
    )
      .bind(`offline_${domain}`, "2026-09-20", "2026-09-20", domain)
      .run();
  }
  // Il rinnovo è stato riconciliato da poco ma resta dovuto; l'account ordinario è più vecchio.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE billing_accounts
          SET is_test = COALESCE(is_test, 0), last_reconciled_at = '2026-09-22T12:00:00.000Z'
        WHERE shop_id NOT IN (SELECT id FROM shops WHERE shop_domain IN (?, ?))`,
    ).bind(shop, ordinary),
    env.DB.prepare(
      `UPDATE billing_accounts
          SET is_test = 1, last_reconciled_at = '2026-09-22T09:00:00.000Z',
              reconciliation_attempted_at = '2026-09-22T09:00:00.000Z'
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    ).bind(shop),
    env.DB.prepare(
      `UPDATE billing_accounts SET is_test = 1, last_reconciled_at = NULL
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    ).bind(ordinary),
  ]);

  const context = shopContext("IT", true, { kind: "subscription", validThrough: "2026-09-21" });
  const renewed = {
    id: chargeGid,
    name: "launch-monthly",
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00Z",
    trialDays: 0,
    test: true,
    currentPeriodEnd: "2099-10-21T21:59:59Z",
    lineItems: [
      {
        plan: {
          pricingDetails: {
            interval: "EVERY_30_DAYS",
            price: { amount: "2.99", currencyCode: "EUR" },
          },
        },
      },
    ],
  };
  const updates: { validation: { metafields: { value: string }[] } }[] = [];
  const admin = {
    graphql: async (query: string, options?: { variables?: unknown }) => {
      if (query.includes("CfReadyValidationUpdate")) {
        const variables = options?.variables as (typeof updates)[number];
        updates.push(variables);
        context.data.validations.nodes[0].metafield.jsonValue = JSON.parse(
          variables.validation.metafields[0].value,
        );
        return Response.json({ data: { validationUpdate: { userErrors: [] } } });
      }
      if (query.includes("CfReadyBilling")) {
        return Response.json({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [renewed],
              allSubscriptions: {
                nodes: [renewed],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              oneTimePurchases: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          },
        });
      }
      return Response.json(context);
    },
  };

  await expect(
    reconcileNextStaleBilling(env.DB, {
      now: new Date("2026-09-22T10:30:00.000Z"),
      adminForShop: async () => admin,
    }),
  ).resolves.toEqual({ attempted: true, shopDomain: shop, errorCode: null });
  expect(updates).toHaveLength(1);
  expect(JSON.parse(updates[0].validation.metafields[0].value).entitlement).toEqual({
    kind: "subscription",
    validThrough: "2099-10-21",
  });
  expect(
    await env.DB.prepare(
      `SELECT b.current_period_end FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
        WHERE s.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toEqual({ current_period_end: "2099-10-21" });
  await env.DB.prepare("DELETE FROM shopify_sessions WHERE id IN (?, ?)")
    .bind(`offline_${shop}`, `offline_${ordinary}`)
    .run();
});

test("uno store senza addebiti già tentato non precede un abbonato scaduto", async () => {
  const free = await insertShop("mai-pagante.example.myshopify.com");
  const paying = await insertShop("abbonato-scaduto.example.myshopify.com");
  await syncBillingAccount(env.DB, free, NESSUN_ADDEBITO, opzioni);
  await syncBillingAccount(
    env.DB,
    paying,
    abbonamento("gid://shopify/AppSubscription/abbonato-scaduto", "2026-10-31T22:59:59Z"),
    opzioni,
  );
  await env.DB.batch([
    ...[free, paying].map((domain) =>
      env.DB.prepare(
        `INSERT INTO shopify_sessions (
           id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
         ) SELECT ?, id, 0, 'payload', ?, ? FROM shops WHERE shop_domain = ?`,
      ).bind(`offline_${domain}`, "2026-09-20", "2026-09-20", domain),
    ),
    env.DB.prepare(
      `UPDATE billing_accounts SET reconciliation_attempted_at = '2026-09-22T10:00:00.000Z'
        WHERE shop_id NOT IN (SELECT id FROM shops WHERE shop_domain IN (?, ?))`,
    ).bind(free, paying),
    // Il ciclo ha già tentato lo store senza addebiti: `is_test` resta NULL perché Shopify
    // non restituisce alcun addebito da cui ricavarlo.
    env.DB.prepare(
      `UPDATE billing_accounts
          SET last_reconciled_at = '2026-09-22T08:00:00.000Z',
              reconciliation_attempted_at = '2026-09-22T08:00:00.000Z'
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    ).bind(free),
    env.DB.prepare(
      `UPDATE billing_accounts
          SET last_reconciled_at = '2026-09-21T08:00:00.000Z',
              reconciliation_attempted_at = '2026-09-21T08:00:00.000Z'
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    ).bind(paying),
  ]);
  expect(
    await env.DB.prepare(
      `SELECT b.is_test FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
        WHERE s.shop_domain = ?`,
    )
      .bind(free)
      .first(),
  ).toEqual({ is_test: null });

  await expect(
    reconcileNextStaleBilling(env.DB, {
      now: new Date("2026-09-22T10:30:00.000Z"),
      adminForShop: async () => ({}) as never,
      reconciler: async () => ({ retryable: false, errorCode: null }),
    }),
  ).resolves.toEqual({ attempted: true, shopDomain: paying, errorCode: null });
  await env.DB.prepare("DELETE FROM shopify_sessions WHERE id IN (?, ?)")
    .bind(`offline_${free}`, `offline_${paying}`)
    .run();
});

test("un diritto non scritto nel metafield viene ritentato dopo un'ora", async () => {
  const shop = await insertShop("diritto-non-scritto.example.myshopify.com");
  const timestamp = "2026-09-22T09:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE billing_accounts
          SET is_test = COALESCE(is_test, 0), last_reconciled_at = '2026-09-22T12:00:00.000Z'`,
    ),
    env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation, is_test,
         last_reconciled_at, reconciliation_attempted_at, reconciliation_error_code,
         created_at, updated_at
       ) SELECT id, 'none', 'none', 'balanced', 0, ?, ?, 'entitlement_write_failed', ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(timestamp, timestamp, timestamp, timestamp, shop),
    env.DB.prepare(
      `INSERT INTO shopify_sessions (
         id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
       ) SELECT ?, id, 0, 'payload', ?, ? FROM shops WHERE shop_domain = ?`,
    ).bind("offline_diritto_non_scritto", timestamp, timestamp, shop),
  ]);
  const options = {
    adminForShop: async () => ({}) as never,
    reconciler: async () => ({ retryable: false, errorCode: null }),
  };

  await expect(
    reconcileNextStaleBilling(env.DB, { ...options, now: new Date("2026-09-22T09:30:00.000Z") }),
  ).resolves.toMatchObject({ attempted: false });
  await expect(
    reconcileNextStaleBilling(env.DB, { ...options, now: new Date("2026-09-22T10:00:00.000Z") }),
  ).resolves.toEqual({ attempted: true, shopDomain: shop, errorCode: null });
  await env.DB.prepare(
    "DELETE FROM shopify_sessions WHERE id = 'offline_diritto_non_scritto'",
  ).run();
});

test("la riconciliazione periodica registra errori stabili senza concedere stato", async () => {
  const shop = await insertShop("riconciliazione-fallita.example.myshopify.com");
  const timestamp = "2026-09-19T00:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO billing_accounts (
         shop_id, entitlement_status, plan_kind, pricing_generation,
         created_at, updated_at
       ) SELECT id, 'none', 'none', 'balanced', ?, ?
           FROM shops WHERE shop_domain = ?`,
    ).bind(timestamp, timestamp, shop),
    env.DB.prepare(
      `INSERT INTO shopify_sessions (
         id, shop_id, is_online, session_payload_ciphertext, created_at, updated_at
       ) SELECT ?, id, 0, 'payload', ?, ? FROM shops WHERE shop_domain = ?`,
    ).bind("offline_fallita", timestamp, timestamp, shop),
  ]);
  await env.DB.prepare(
    `UPDATE billing_accounts
        SET is_test = COALESCE(is_test, 0), last_reconciled_at = '2026-09-23T10:00:00.000Z'
      WHERE shop_id != (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();
  const now = new Date("2026-09-23T10:00:00.000Z");
  const adminForShop = async () => ({}) as never;

  await expect(
    reconcileNextStaleBilling(env.DB, {
      now,
      adminForShop,
      reconciler: async () => ({ retryable: true, errorCode: null }),
    }),
  ).resolves.toMatchObject({ errorCode: "billing_reconciliation_retryable" });
  await env.DB.prepare(
    "UPDATE billing_accounts SET reconciliation_attempted_at = '2026-09-19T00:00:00.000Z'",
  ).run();
  await expect(
    reconcileNextStaleBilling(env.DB, {
      now,
      adminForShop: async () => {
        throw new Error("Messaggio non allowlistato");
      },
    }),
  ).resolves.toMatchObject({ errorCode: "billing_reconciliation_failed" });
  expect(
    await env.DB.prepare(
      "SELECT entitlement_status, reconciliation_error_code FROM billing_accounts WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toEqual({
    entitlement_status: "none",
    reconciliation_error_code: "billing_reconciliation_failed",
  });
});

test("la riconciliazione storica ricostruisce la conversione senza inventare credito", async () => {
  const shop = await insertShop("conversione-storica.example.myshopify.com");
  const subscription = abbonamento(
    "gid://shopify/AppSubscription/storica",
    "2026-08-31T21:59:59Z",
  ).subscription;
  const billing = {
    subscription: null,
    latestSubscription: { ...subscription, status: "CANCELLED" as const, test: false },
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/storica",
      createdAt: "2026-08-15T10:00:00.000Z",
      test: false,
      amount: "89.90",
      currency: "EUR",
    },
    pendingOneTime: false,
  };

  await syncBillingAccount(env.DB, shop, billing, opzioni);
  await syncBillingAccount(env.DB, shop, billing, opzioni);

  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS count, source, credit_status, credit_estimate_minor, cancelled_at, is_test
         FROM billing_conversions
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    count: 1,
    source: "historical_reconciliation",
    credit_status: "needs_review",
    credit_estimate_minor: null,
    cancelled_at: null,
    is_test: 0,
  });
});

test("la cancellazione lascia l'accesso fino a fine periodo e poi scade", async () => {
  const shop = await insertShop("cancellato.example.myshopify.com");
  const attivo = abbonamento("gid://shopify/AppSubscription/2", "2026-08-31T21:59:59Z");
  await syncBillingAccount(env.DB, shop, attivo, opzioni);
  expect(
    await recordOrdinaryCancellationIntent(
      env.DB,
      shop,
      { ...attivo.subscription, currentPeriodEnd: null },
      opzioni.today,
      opzioni.timeZone,
    ),
  ).toBe(false);
  expect(
    await recordOrdinaryCancellationIntent(
      env.DB,
      shop,
      attivo.subscription,
      opzioni.today,
      opzioni.timeZone,
    ),
  ).toBe(true);
  await markOrdinaryCancellationConfirmed(env.DB, attivo.subscription.id);

  const cancellato = {
    ...NESSUN_ADDEBITO,
    latestSubscription: { ...attivo.subscription, status: "CANCELLED" as const },
  };
  const inScadenza = await syncBillingAccount(env.DB, shop, cancellato, opzioni);
  expect(inScadenza).toMatchObject({
    entitlement_status: "ending",
    current_period_end: "2026-08-31",
  });
  expect(entitlementFor(null, "2026-08-31", inScadenza)).toEqual({
    kind: "subscription",
    validThrough: "2026-08-31",
  });

  const scaduto = await syncBillingAccount(env.DB, shop, cancellato, {
    ...opzioni,
    today: "2026-09-01",
  });
  expect(scaduto.entitlement_status).toBe("expired");
  expect(entitlementFor(null, "2026-09-01", scaduto)).toEqual({ kind: "none", validThrough: null });
});

test("una cancellazione non qualificata non eredita il periodo residuo", async () => {
  const shop = await insertShop("cancellazione-esterna.example.myshopify.com");
  const attivo = abbonamento(
    "gid://shopify/AppSubscription/cancellazione-esterna",
    "2027-08-31T21:59:59Z",
    "ANNUAL",
  );
  await syncBillingAccount(env.DB, shop, attivo, opzioni);

  const account = await syncBillingAccount(
    env.DB,
    shop,
    {
      ...NESSUN_ADDEBITO,
      latestSubscription: { ...attivo.subscription, status: "CANCELLED" },
    },
    opzioni,
  );

  expect(account).toMatchObject({ entitlement_status: "expired", shopify_status: "CANCELLED" });
  expect(entitlementFor(null, opzioni.today, account).kind).toBe("none");
});

test("una sottoscrizione congelata perde subito il diritto anche se il periodo annuale è lontano", async () => {
  const shop = await insertShop("congelato.example.myshopify.com");
  const attivo = abbonamento(
    "gid://shopify/AppSubscription/frozen",
    "2027-08-31T21:59:59Z",
    "ANNUAL",
  );
  await syncBillingAccount(env.DB, shop, attivo, opzioni);

  const congelato = await syncBillingAccount(
    env.DB,
    shop,
    {
      ...NESSUN_ADDEBITO,
      latestSubscription: { ...attivo.subscription, status: "FROZEN" },
    },
    opzioni,
  );

  expect(congelato).toMatchObject({
    entitlement_status: "expired",
    plan_kind: "annual",
    shopify_status: "FROZEN",
    current_period_end: "2027-08-31",
  });
  expect(entitlementFor(null, "2026-08-01", congelato)).toEqual({
    kind: "none",
    validThrough: null,
  });
});

test("una sottoscrizione mensile congelata perde subito il diritto", async () => {
  const shop = await insertShop("congelato-mensile.example.myshopify.com");
  const attivo = abbonamento(
    "gid://shopify/AppSubscription/frozen-monthly",
    "2026-08-31T21:59:59Z",
  );
  await syncBillingAccount(env.DB, shop, attivo, opzioni);

  const account = await syncBillingAccount(
    env.DB,
    shop,
    {
      ...NESSUN_ADDEBITO,
      latestSubscription: { ...attivo.subscription, status: "FROZEN" },
    },
    opzioni,
  );

  expect(account).toMatchObject({ entitlement_status: "expired", shopify_status: "FROZEN" });
});

test("la scomparsa di un piano senza stato Shopify non inventa un periodo pagato", async () => {
  const shop = await insertShop("stato-assente.example.myshopify.com");
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/missing", "2027-08-31T21:59:59Z", "ANNUAL"),
    opzioni,
  );

  const account = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);
  expect(account.entitlement_status).toBe("expired");
  expect(entitlementFor(null, "2026-08-01", account).kind).toBe("none");
});

test("gli eventi billing sono append-only e idempotenti", async () => {
  const shop = await insertShop("eventi.example.myshopify.com");
  const stato = abbonamento("gid://shopify/AppSubscription/3", "2026-08-31T21:59:59Z");
  const cancellato = {
    ...NESSUN_ADDEBITO,
    latestSubscription: { ...stato.subscription, status: "CANCELLED" as const },
  };

  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await recordOrdinaryCancellationIntent(
    env.DB,
    shop,
    stato.subscription,
    opzioni.today,
    opzioni.timeZone,
  );
  await syncBillingAccount(env.DB, shop, cancellato, opzioni);

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

test("un nuovo charge o ciclo non eredita la vendita osservata in precedenza", async () => {
  const shop = await insertShop("ricevuta-ciclo.example.myshopify.com");
  const first = abbonamento("gid://shopify/AppSubscription/ricevuta-1", "2026-08-31T21:59:59Z");
  await syncBillingAccount(env.DB, shop, first, opzioni);
  await env.DB.prepare(
    `UPDATE billing_accounts
          SET sale_observed_at = '2026-08-01T10:00:00.000Z',
              sale_checked_at = '2026-08-02T10:00:00.000Z',
              sale_charge_gid = shopify_charge_gid,
              sale_cycle_start = current_period_start,
              sale_transaction_gid = 'gid://partners/AppSubscriptionSale/old'
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();

  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/ricevuta-1", "2026-09-30T21:59:59Z"),
    { ...opzioni, today: "2026-09-01" },
  );
  expect(
    await env.DB.prepare(
      `SELECT sale_observed_at, sale_checked_at, sale_charge_gid,
                sale_cycle_start, sale_transaction_gid
           FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
          WHERE s.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    sale_observed_at: null,
    sale_checked_at: null,
    sale_charge_gid: null,
    sale_cycle_start: null,
    sale_transaction_gid: null,
  });

  await env.DB.prepare(
    `UPDATE billing_accounts
          SET sale_observed_at = '2026-09-01T10:00:00.000Z',
              sale_charge_gid = shopify_charge_gid,
              sale_cycle_start = current_period_start
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shop)
    .run();
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/ricevuta-2", "2026-10-31T21:59:59Z"),
    { ...opzioni, today: "2026-10-01" },
  );
  expect(
    await env.DB.prepare(
      `SELECT sale_observed_at, sale_charge_gid
           FROM billing_accounts b JOIN shops s ON s.id = b.shop_id
          WHERE s.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ sale_observed_at: null, sale_charge_gid: null });
});

test("la conversione a una tantum registra il prezzo dell'acquisto", async () => {
  const shop = await insertShop("conversione.example.myshopify.com");
  const billing = {
    ...abbonamento("gid://shopify/AppSubscription/conversione", "2026-08-31T21:59:59Z"),
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/conversione",
      createdAt: "2026-08-01T10:00:00Z",
      test: true,
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
