import { env } from "cloudflare:workers";
import { authenticateWebhookRequest } from "./webhook-auth.server";

type WebhookBindings = Env & { SHOPIFY_API_SECRET?: string };

const bindings = env as WebhookBindings;
const encoder = new TextEncoder();
const WEBHOOK_HEADERS = {
  hmac: "x-shopify-hmac-sha256",
  topic: "x-shopify-topic",
  domain: "x-shopify-shop-domain",
  apiVersion: "x-shopify-api-version",
  webhookId: "x-shopify-webhook-id",
  triggeredAt: "x-shopify-triggered-at",
} as const;
const EVENT_HEADERS = {
  hmac: "shopify-hmac-sha256",
  topic: "shopify-topic",
  domain: "shopify-shop-domain",
  apiVersion: "shopify-api-version",
  webhookId: "shopify-webhook-id",
  eventId: "shopify-event-id",
  triggeredAt: "shopify-triggered-at",
} as const;

export const authenticateWebhook = (request: Request) =>
  authenticateWebhookRequest(request, ({ rawBody, rawRequest }) =>
    validateShopifyWebhook(rawRequest.headers, rawBody, bindings.SHOPIFY_API_SECRET || ""),
  );

export async function validateShopifyWebhook(headers: Headers, rawBody: string, secret: string) {
  const names = headers.has(EVENT_HEADERS.hmac) ? EVENT_HEADERS : WEBHOOK_HEADERS;
  const hmac = headers.get(names.hmac);
  if (!rawBody) return { valid: false as const, reason: "missing_body" };
  if (!hmac) return { valid: false as const, reason: "missing_hmac" };
  if (!(await validHmac(rawBody, secret, hmac))) {
    return { valid: false as const, reason: "invalid_hmac" };
  }

  const topic = headers.get(names.topic);
  const domain = headers.get(names.domain);
  const apiVersion = headers.get(names.apiVersion);
  const webhookId = headers.get(names.webhookId);
  const eventId = "eventId" in names ? headers.get(names.eventId) : "present";
  if (!topic || !domain || !apiVersion || !webhookId || !eventId) {
    return { valid: false as const, reason: "missing_header" };
  }

  const triggeredAt = headers.get(names.triggeredAt);
  return {
    valid: true as const,
    webhookId,
    topic: topic.toUpperCase().replace(/[/.]/g, "_"),
    domain,
    ...(triggeredAt ? { triggeredAt } : {}),
  };
}

async function validHmac(rawBody: string, secret: string, received: string) {
  if (!secret) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(left: ArrayBufferView, right: ArrayBufferView): boolean;
  };
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(rawBody)));
  const actual = new Uint8Array(expected.byteLength);
  let validEncoding = false;
  try {
    const decoded = Uint8Array.from(atob(received), (character) => character.charCodeAt(0));
    validEncoding = decoded.byteLength === actual.byteLength;
    actual.set(decoded.subarray(0, actual.byteLength));
  } catch {
    // Il confronto a lunghezza fissa resta costante anche con Base64 non valido.
  }
  const equal = subtle.timingSafeEqual(actual, expected);
  return validEncoding && equal;
}
