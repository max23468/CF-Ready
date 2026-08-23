import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  currentPricingGeneration,
  proratedCredit,
  readBilling,
  syncBillingAccount,
} from "../../app/billing.server";
import { insertShop, NESSUN_ADDEBITO, opzioni, abbonamento } from "../support/billing";

test("una sottoscrizione attiva Shopify vale anche quando la review la marca come test", async () => {
  const risposta = (test: boolean) => ({
    json: async () => ({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/99",
              name: "launch-monthly",
              status: "ACTIVE",
              test,
              currentPeriodEnd: "2026-08-31T21:59:59Z",
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
            },
          ],
          oneTimePurchases: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  const admin = (test: boolean) => ({ graphql: async () => risposta(test) as unknown as Response });

  expect((await readBilling(admin(true))).subscription).toMatchObject({
    id: "gid://shopify/AppSubscription/99",
  });
});

test("la lettura pagina tutti gli acquisti e riconosce quelli pendenti", async () => {
  const after: unknown[] = [];
  const pages = [
    {
      nodes: [
        {
          id: "gid://shopify/AppPurchaseOneTime/pending",
          status: "PENDING",
          test: true,
          createdAt: "2026-08-01T12:00:00Z",
          price: { amount: "89.90", currencyCode: "EUR" },
        },
      ],
      pageInfo: { hasNextPage: true, endCursor: "pagina-2" },
    },
    {
      nodes: [
        {
          id: "gid://shopify/AppPurchaseOneTime/active",
          status: "ACTIVE",
          test: true,
          createdAt: "2026-07-01T12:00:00Z",
          price: { amount: "89.90", currencyCode: "EUR" },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  ];
  const admin = {
    graphql: async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      after.push(options?.variables?.after);
      return Response.json({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [],
            oneTimePurchases: pages.shift(),
          },
        },
      });
    },
  };

  expect(await readBilling(admin)).toMatchObject({
    oneTime: { id: "gid://shopify/AppPurchaseOneTime/active" },
    pendingOneTime: true,
  });
  expect(after).toEqual([null, "pagina-2"]);
});

test("la generazione cambia solo dopo una cessazione commerciale completa", async () => {
  const trial = {
    status: "expired" as const,
    started_at: "2026-07-30T00:00:00Z",
    ends_at: "2026-08-12",
    pricing_generation: "launch" as const,
  };
  const active = {
    entitlement_status: "active" as const,
    plan_kind: "monthly" as const,
    pricing_generation: "launch" as const,
    shopify_charge_gid: "gid://shopify/AppSubscription/generation",
    current_period_end: "2026-12-31",
  };

  expect(currentPricingGeneration(trial, active, "2026-12-01")).toBe("launch");
  expect(
    currentPricingGeneration(trial, { ...active, entitlement_status: "expired" }, "2026-12-01"),
  ).toBe("balanced");

  const shop = await insertShop("nuova-generazione.example.myshopify.com");
  await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, {
    today: "2026-12-01",
    timeZone: "Europe/Rome",
    pricingGeneration: "launch",
  });
  const renewedBilling = abbonamento(
    "gid://shopify/AppSubscription/generation-new",
    "2026-12-31T22:59:59Z",
  );
  renewedBilling.subscription.amount = "3.99";
  const renewed = await syncBillingAccount(env.DB, shop, renewedBilling, {
    today: "2026-12-01",
    timeZone: "Europe/Rome",
    pricingGeneration: "balanced",
  });
  expect(renewed.pricing_generation).toBe("balanced");
});

test("un addebito Shopify attivo ricostruisce la generazione tariffaria", async () => {
  const launchShop = await insertShop("addebito-launch.example.myshopify.com");
  const launch = await syncBillingAccount(
    env.DB,
    launchShop,
    abbonamento("gid://shopify/AppSubscription/launch-source", "2026-12-31T22:59:59Z"),
    { today: "2026-12-01", timeZone: "Europe/Rome", pricingGeneration: "balanced" },
  );
  expect(launch.pricing_generation).toBe("launch");

  const balancedShop = await insertShop("addebito-balanced.example.myshopify.com");
  const balancedBilling = abbonamento(
    "gid://shopify/AppSubscription/balanced-source",
    "2026-12-31T22:59:59Z",
  );
  balancedBilling.subscription.amount = "3.99";
  const balanced = await syncBillingAccount(env.DB, balancedShop, balancedBilling, opzioni);
  expect(balanced.pricing_generation).toBe("balanced");
});

test("il credito stimato copre solo il ciclo corrente", () => {
  const mensile = {
    amount: "2.99",
    interval: "EVERY_30_DAYS" as const,
    periodEnd: "2026-08-31",
  };

  // Metà ciclo residuo su trenta giorni.
  expect(proratedCredit({ ...mensile, today: "2026-08-16" })).toBeCloseTo(1.495, 3);
  // Ciclo concluso: nessun credito, e nessun cumulo dai cicli precedenti.
  expect(proratedCredit({ ...mensile, today: "2026-08-31" })).toBe(0);
  expect(proratedCredit({ ...mensile, today: "2026-09-10" })).toBe(0);
  expect(
    proratedCredit({
      amount: "29.90",
      interval: "ANNUAL",
      periodEnd: "2027-07-31",
      today: "2027-06-01",
    }),
  ).toBeCloseTo(4.915, 3);
  expect(
    proratedCredit({ amount: null, interval: null, periodEnd: null, today: "2026-08-16" }),
  ).toBeNull();
});
