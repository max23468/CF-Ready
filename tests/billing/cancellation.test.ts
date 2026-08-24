import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { cancelSubscription, markTrialConverted, startTrial } from "../../app/billing.server";
import { insertShop } from "../support/billing";

test("la cancellazione riporta un errore invece di fingere il successo", async () => {
  const risposta = (userErrors: { message: string }[]) => ({
    json: async () => ({ data: { appSubscriptionCancel: { userErrors } } }),
  });

  expect(
    await cancelSubscription(
      { graphql: async () => risposta([]) as unknown as Response },
      "gid://shopify/AppSubscription/50",
      { prorate: false },
    ),
  ).toBeNull();
  expect(
    await cancelSubscription(
      { graphql: async () => risposta([{ message: "non cancellabile" }]) as unknown as Response },
      "gid://shopify/AppSubscription/50",
      { prorate: true },
    ),
  ).toBe("subscription_cancel_failed");
  expect(
    await cancelSubscription(
      { graphql: async () => Promise.reject(new Error("Shopify non disponibile")) },
      "gid://shopify/AppSubscription/50",
      { prorate: false },
    ),
  ).toBe("subscription_cancel_failed");
});

test("la prova risulta convertita quando il merchant paga", async () => {
  const shop = await insertShop("convertita.example.myshopify.com");
  await startTrial(env.DB, shop, { eligible: true, today: "2026-07-30" });

  await markTrialConverted(env.DB, shop);
  await markTrialConverted(env.DB, shop);

  expect(
    await env.DB.prepare(
      "SELECT status FROM trials WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ status: "converted" });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND event_name = 'trial_converted'`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ total: 1 });
});
