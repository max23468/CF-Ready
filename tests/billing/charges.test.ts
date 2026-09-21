import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import {
  createCharge,
  entitlementFor,
  markBillingConversionCancelled,
  recordBillingConversion,
  syncBillingAccount,
} from "../../app/billing.server";
import { insertShop, NESSUN_ADDEBITO, opzioni } from "../support/billing";

test("un acquisto una tantum rimborsato revoca il diritto", async () => {
  const shop = await insertShop("rimborso.example.myshopify.com");
  const acquisto = {
    subscription: null,
    latestSubscription: null,
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/1",
      createdAt: "2026-08-01T10:00:00Z",
      test: true,
      amount: "89.90",
      currency: "EUR",
    },
    pendingOneTime: false,
  };

  const attivo = await syncBillingAccount(env.DB, shop, acquisto, opzioni);
  expect(attivo).toMatchObject({ entitlement_status: "active", plan_kind: "one_time" });
  expect(entitlementFor(null, "2026-08-01", attivo)).toEqual({
    kind: "one_time",
    validThrough: null,
  });

  // Un rimborso totale toglie l'acquisto dagli attivi: gli acquisti una tantum non scadono.
  const rimborsato = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);
  expect(rimborsato.entitlement_status).toBe("refunded");
  expect(entitlementFor(null, "2026-08-01", rimborsato)).toEqual({
    kind: "none",
    validThrough: null,
  });
});

test("la ricevuta di conversione distingue credito nullo, zero e da verificare", async () => {
  const shop = await insertShop("ricevuta-conversione.example.myshopify.com");
  await recordBillingConversion(env.DB, shop, {
    subscriptionGid: "gid://shopify/AppSubscription/senza-stima",
    oneTimeGid: "gid://shopify/AppPurchaseOneTime/senza-stima",
    creditEstimate: null,
    currency: "EUR",
    isTest: false,
  });
  await recordBillingConversion(env.DB, shop, {
    subscriptionGid: "gid://shopify/AppSubscription/zero",
    oneTimeGid: "gid://shopify/AppPurchaseOneTime/zero",
    creditEstimate: 0,
    currency: "EUR",
    isTest: false,
  });
  await recordBillingConversion(env.DB, shop, {
    subscriptionGid: "gid://shopify/AppSubscription/positivo",
    oneTimeGid: "gid://shopify/AppPurchaseOneTime/positivo",
    creditEstimate: 1.23,
    currency: "EUR",
    isTest: false,
  });
  await recordBillingConversion(env.DB, shop, {
    subscriptionGid: "gid://shopify/AppSubscription/negativo",
    oneTimeGid: "gid://shopify/AppPurchaseOneTime/negativo",
    creditEstimate: -5,
    currency: "EUR",
    isTest: false,
  });
  await markBillingConversionCancelled(env.DB, "gid://shopify/AppPurchaseOneTime/positivo");

  expect(
    await env.DB.prepare(
      `SELECT credit_estimate_minor, credit_status, cancelled_at IS NOT NULL AS cancelled
         FROM billing_conversions ORDER BY id`,
    ).all(),
  ).toMatchObject({
    results: [
      { credit_estimate_minor: null, credit_status: "needs_review", cancelled: 0 },
      { credit_estimate_minor: 0, credit_status: "not_applicable", cancelled: 0 },
      { credit_estimate_minor: 123, credit_status: "pending", cancelled: 1 },
      { credit_estimate_minor: 0, credit_status: "not_applicable", cancelled: 0 },
    ],
  });
});

test("l'addebito restituisce l'URL di conferma e distingue i due tipi", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const chiamate: { query: string; variables: unknown }[] = [];
  const admin = (payload: unknown) => ({
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      chiamate.push({ query, variables: options?.variables });
      return { json: async () => payload } as unknown as Response;
    },
  });

  const abbonamento = await createCharge(
    admin({
      data: {
        appSubscriptionCreate: { confirmationUrl: "https://shopify/conferma", userErrors: [] },
      },
    }),
    {
      name: "CF Ready — abbonamento mensile",
      amount: 2.99,
      currency: "EUR",
      interval: "EVERY_30_DAYS",
      trialDays: 6,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(abbonamento).toEqual({ confirmationUrl: "https://shopify/conferma", error: null });
  expect(chiamate[0].query).toContain("appSubscriptionCreate");
  expect(chiamate[0].variables).toMatchObject({
    trialDays: 6,
    test: true,
    returnUrl: "https://app.example/app",
    replacementBehavior: "STANDARD",
  });

  const unaTantum = await createCharge(
    admin({
      data: {
        appPurchaseOneTimeCreate: { confirmationUrl: "https://shopify/unica", userErrors: [] },
      },
    }),
    {
      name: "CF Ready — pagamento unico",
      amount: 89.9,
      currency: "EUR",
      interval: null,
      trialDays: 0,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(unaTantum.confirmationUrl).toBe("https://shopify/unica");
  expect(chiamate[1].query).toContain("appPurchaseOneTimeCreate");
  expect(chiamate[1].variables).toMatchObject({ returnUrl: "https://app.example/app" });

  // Un rifiuto di Shopify non deve passare per successo con un URL mancante.
  const rifiutato = await createCharge(
    admin({
      data: { appSubscriptionCreate: { confirmationUrl: null, userErrors: [{ message: "no" }] } },
    }),
    {
      name: "CF Ready — abbonamento mensile",
      amount: 2.99,
      currency: "EUR",
      interval: "EVERY_30_DAYS",
      trialDays: 0,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(rifiutato).toEqual({ confirmationUrl: null, error: "charge_create_failed" });

  expect(
    await createCharge(
      { graphql: async () => Promise.reject(new Error("Shopify non disponibile")) },
      {
        name: "CF Ready — abbonamento mensile",
        amount: 2.99,
        currency: "EUR",
        interval: "EVERY_30_DAYS",
        trialDays: 0,
        test: true,
        returnUrl: "https://app.example/app",
      },
    ),
  ).toEqual({ confirmationUrl: null, error: "charge_create_failed" });

  expect(error.mock.calls.map(([record]) => record.error_code)).toEqual([
    "shopify_charge_rejected",
    "shopify_charge_request_failed",
  ]);
  error.mockRestore();
});
