import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  readCommercialInputs,
  syncCommercialEntitlement,
} from "../../app/billing/commercial-entitlement.server";
import { startTrial } from "../../app/billing/repository.server";
import { NESSUN_ADDEBITO, abbonamento } from "../support/billing";
import { insertShop } from "../support/lifecycle";

const TODAY = "2026-08-01";
const TIME_ZONE = "Europe/Rome";

async function activeTrial(shopDomain: string) {
  await startTrial(env.DB, shopDomain, { today: TODAY });
  return readCommercialInputs(env.DB, shopDomain, TODAY);
}

async function trialStatus(shopDomain: string) {
  return env.DB.prepare(
    `SELECT status FROM trials
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(shopDomain)
    .first<{ status: string }>();
}

test("il confine commerciale converte la prova quando Shopify conferma un piano attivo", async () => {
  const shop = await insertShop("commercial-paid.example.myshopify.com");
  const inputs = await activeTrial(shop);

  const result = await syncCommercialEntitlement(env.DB, shop, {
    billing: abbonamento("gid://shopify/AppSubscription/commercial-paid", "2026-08-31T21:59:59Z"),
    inputs,
    timeZone: TIME_ZONE,
    today: TODAY,
  });

  expect(result).toMatchObject({
    complimentaryOperational: false,
    entitlement: { kind: "subscription", validThrough: "2026-08-31" },
  });
  expect(await trialStatus(shop)).toMatchObject({ status: "converted" });
});

test("un omaggio attivo e confermato converte la prova senza inventare una subscription", async () => {
  const shop = await insertShop("commercial-complimentary.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements (
       shop_id, status, granted_at, created_at, updated_at
     ) SELECT id, 'active', ?, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind("2026-07-31T10:00:00.000Z", "2026-07-31T10:00:00.000Z", "2026-07-31T10:00:00.000Z", shop)
    .run();
  const inputs = await activeTrial(shop);

  const result = await syncCommercialEntitlement(env.DB, shop, {
    billing: NESSUN_ADDEBITO,
    inputs,
    timeZone: TIME_ZONE,
    today: TODAY,
  });

  expect(result).toMatchObject({
    complimentaryOperational: true,
    entitlement: { kind: "one_time", validThrough: null },
  });
  expect(await trialStatus(shop)).toMatchObject({ status: "converted" });
});

test("un omaggio revocato non converte né sostituisce la prova ancora attiva", async () => {
  const shop = await insertShop("commercial-revoked.example.myshopify.com");
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements (
       shop_id, status, granted_at, revoked_at, created_at, updated_at
     ) SELECT id, 'revoked', ?, ?, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(
      "2026-07-30T10:00:00.000Z",
      "2026-07-31T10:00:00.000Z",
      "2026-07-30T10:00:00.000Z",
      "2026-07-31T10:00:00.000Z",
      shop,
    )
    .run();
  const inputs = await activeTrial(shop);

  const result = await syncCommercialEntitlement(env.DB, shop, {
    billing: NESSUN_ADDEBITO,
    inputs,
    timeZone: TIME_ZONE,
    today: TODAY,
  });

  expect(result).toMatchObject({
    complimentaryOperational: false,
    entitlement: { kind: "trial", validThrough: "2026-08-14" },
  });
  expect(await trialStatus(shop)).toMatchObject({ status: "active" });
});

test("un diritto già convertito non ripete la conversione della prova", async () => {
  const shop = await insertShop("commercial-already-converted.example.myshopify.com");
  const activeInputs = await activeTrial(shop);
  const billing = abbonamento(
    "gid://shopify/AppSubscription/commercial-already-converted",
    "2026-08-31T21:59:59Z",
  );
  await syncCommercialEntitlement(env.DB, shop, {
    billing,
    inputs: activeInputs,
    timeZone: TIME_ZONE,
    today: TODAY,
  });
  const convertedInputs = await readCommercialInputs(env.DB, shop, TODAY);
  const trialRow = () =>
    env.DB.prepare(
      `SELECT * FROM trials WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
      .bind(shop)
      .first();
  const before = await trialRow();

  await syncCommercialEntitlement(env.DB, shop, {
    billing,
    inputs: convertedInputs,
    timeZone: TIME_ZONE,
    today: TODAY,
  });

  expect(await trialRow()).toEqual(before);
  expect(before).toMatchObject({ status: "converted" });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND event_name = 'trial_converted'`,
    )
      .bind(shop)
      .first("total"),
  ).toBe(1);
});
