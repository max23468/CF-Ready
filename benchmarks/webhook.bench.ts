import { beforeAll, bench, describe } from "vitest";
import { validateShopifyWebhook } from "../app/shopify-webhook.server";

const secret = "synthetic-secret";
const encoder = new TextEncoder();
const payloads = {
  small: JSON.stringify({ country_code: "IT", id: "synthetic" }),
  large: JSON.stringify({ country_code: "IT", padding: "x".repeat(32 * 1024) }),
};
const headers = new Map<string, Headers>();

beforeAll(async () => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  for (const [name, body] of Object.entries(payloads)) {
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
    headers.set(
      name,
      new Headers({
        "X-Shopify-Hmac-Sha256": btoa(String.fromCharCode(...signature)),
        "X-Shopify-Topic": "shop/update",
        "X-Shopify-Shop-Domain": "synthetic.myshopify.com",
        "X-Shopify-API-Version": "2026-07",
        "X-Shopify-Webhook-Id": `synthetic-${name}`,
      }),
    );
  }
});

describe("percorso CPU webhook sintetico", () => {
  bench("HMAC e header, payload piccolo", async () => {
    await validateShopifyWebhook(headers.get("small")!, payloads.small, secret);
  });

  bench("JSON.parse, payload piccolo", () => {
    JSON.parse(payloads.small);
  });

  bench("HMAC e header, payload 32 KiB", async () => {
    await validateShopifyWebhook(headers.get("large")!, payloads.large, secret);
  });

  bench("JSON.parse, payload 32 KiB", () => {
    JSON.parse(payloads.large);
  });
});
