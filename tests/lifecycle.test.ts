import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { recordEvent } from "../app/events.server";
import { markUninstalled, redactShop } from "../app/shop.server";
import { reconcile } from "../app/validation.server";
import { claimWebhook, finishWebhook } from "../app/webhooks.server";

const CONFIG = { schemaVersion: 2, rules: { taxCode: "required_validated" } };

async function insertShop(shopDomain: string) {
  const timestamp = "2026-07-30T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shopDomain, timestamp, timestamp, timestamp)
    .run();
  return shopDomain;
}

function shopContext(countryCode: string, enabled: boolean | null) {
  return {
    data: {
      shop: { name: "Store di prova", shopAddress: { countryCodeV2: countryCode } },
      validations: {
        nodes:
          enabled === null
            ? []
            : [
                {
                  id: "gid://shopify/Validation/1",
                  title: "CF Ready",
                  enabled,
                  blockOnFailure: false,
                  shopifyFunction: { handle: "cf-ready-validation" },
                  metafield: { jsonValue: CONFIG },
                },
              ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function adminStub(responses: unknown[]) {
  const calls: string[] = [];
  return {
    calls,
    graphql: async (query: string) => {
      calls.push(query.includes("validationUpdate") ? "update" : "context");
      return Response.json(responses.shift());
    },
  };
}

async function appState(shopDomain: string) {
  return env.DB.prepare(
    `SELECT a.validation_gid, a.validation_enabled, a.config_schema_version, a.config_hash,
            a.last_error_code, s.installation_status, s.country_code
     FROM app_state a JOIN shops s ON s.id = a.shop_id
     WHERE s.shop_domain = ?`,
  )
    .bind(shopDomain)
    .first<Record<string, unknown>>();
}

test("uno store non italiano viene bloccato e la Validation disattivata", async () => {
  const shop = await insertShop("francia.example.myshopify.com");
  const admin = adminStub([
    shopContext("FR", true),
    { data: { validationUpdate: { userErrors: [] } } },
    shopContext("FR", false),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.eligible).toBe(false);
  expect(state.validation?.enabled).toBe(false);
  expect(state.errorCode).toBeNull();
  expect(admin.calls).toEqual(["context", "update", "context"]);
  expect(await appState(shop)).toMatchObject({
    installation_status: "blocked_country",
    country_code: "FR",
    validation_enabled: 0,
    config_schema_version: 2,
    last_error_code: null,
    validation_gid: "gid://shopify/Validation/1",
  });
});

test("il rientro in Italia sblocca lo store senza riattivare la Validation", async () => {
  const shop = await insertShop("rientro.example.myshopify.com");
  await reconcile(
    adminStub([
      shopContext("FR", true),
      { data: { validationUpdate: { userErrors: [] } } },
      shopContext("FR", false),
    ]),
    env.DB,
    shop,
  );

  const admin = adminStub([shopContext("IT", false)]);
  const state = await reconcile(admin, env.DB, shop);

  expect(state.eligible).toBe(true);
  expect(admin.calls).toEqual(["context"]);
  expect(await appState(shop)).toMatchObject({
    installation_status: "active",
    country_code: "IT",
    validation_enabled: 0,
  });
});

test("una disattivazione non riuscita resta fail-open e registra un codice errore", async () => {
  const shop = await insertShop("errore.example.myshopify.com");
  const admin = adminStub([
    shopContext("DE", true),
    { data: { validationUpdate: { userErrors: [{ message: "limite raggiunto" }] } } },
    shopContext("DE", true),
  ]);

  const state = await reconcile(admin, env.DB, shop);

  expect(state.errorCode).toBe("validation_disable_failed");
  expect(await appState(shop)).toMatchObject({
    installation_status: "blocked_country",
    validation_enabled: 1,
    last_error_code: "validation_disable_failed",
  });
});

test("un webhook duplicato viene ignorato e un retry dopo errore viene rielaborato", async () => {
  const shop = await insertShop("webhook.example.myshopify.com");

  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toBe(true);
  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toBe(false);

  await finishWebhook(env.DB, "wh-1", "failed", "unhandled_error");
  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toBe(true);

  await finishWebhook(env.DB, "wh-1", "processed");
  expect(await claimWebhook(env.DB, "wh-1", "SHOP_UPDATE", shop)).toBe(false);
});

test("disinstallazione e redact ripuliscono i dati dello store", async () => {
  const shop = await insertShop("redact.example.myshopify.com");
  await recordEvent(env.DB, { shopDomain: shop, name: "app_installed", class: "lifecycle" });
  await claimWebhook(env.DB, "wh-redact", "SHOP_REDACT", shop);
  await reconcile(adminStub([shopContext("IT", true)]), env.DB, shop);

  await markUninstalled(env.DB, shop);
  expect(
    await env.DB.prepare(
      "SELECT installation_status, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ installation_status: "uninstalled" });
  expect(await appState(shop)).toMatchObject({ validation_enabled: 0, validation_gid: null });

  await redactShop(env.DB, shop);

  expect(
    await env.DB.prepare("SELECT id FROM shops WHERE shop_domain = ?").bind(shop).first(),
  ).toBeNull();
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS total FROM app_events WHERE event_name = ?")
      .bind("app_installed")
      .first<{ total: number }>(),
  ).toMatchObject({ total: 0 });
  expect(
    await env.DB.prepare("SELECT shop_domain, topic FROM webhook_events WHERE webhook_id = ?")
      .bind("wh-redact")
      .first(),
  ).toMatchObject({ shop_domain: null, topic: "SHOP_REDACT" });
});
