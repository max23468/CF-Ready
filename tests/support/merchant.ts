import { env } from "cloudflare:test";
import { createAppContext } from "../../app/context.server";
import { insertShop } from "./lifecycle";
import { shopifyAdmin } from "./shopify-admin";

// Store reale in D1 e Shopify simulato per i test che attraversano loader e action.
export async function merchant(name = "merchant") {
  const shop = await insertShop(`${name}-${crypto.randomUUID()}.myshopify.com`);
  await env.DB.prepare(
    `INSERT INTO app_state (shop_id, updated_at)
     SELECT id, '2026-07-30T00:00:00.000Z' FROM shops WHERE shop_domain = ?`,
  )
    .bind(shop)
    .run();
  return { shop, shopify: shopifyAdmin() };
}

export function post(path: string, values: Record<string, string>) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    body: new URLSearchParams(values),
  });
}

export function routeArgs(request: Request, db: D1Database = env.DB, queue?: Queue) {
  return { request, context: createAppContext(db, queue as never), params: {} } as never;
}

export async function eventsOf(shop: string, name: string) {
  const { results } = await env.DB.prepare(
    `SELECT metadata_json FROM app_events
     WHERE event_name = ? AND shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
  )
    .bind(name, shop)
    .all<{ metadata_json: string | null }>();
  return results.map(({ metadata_json }) =>
    metadata_json === null ? null : (JSON.parse(metadata_json) as Record<string, unknown>),
  );
}

// Gli eventi legati a un webhook, nell'ordine di scrittura, anche dopo la cancellazione dello store.
export async function eventsOfWebhook(webhookId: string) {
  const { results } = await env.DB.prepare(
    `SELECT event_name, event_class, metadata_json FROM app_events
     WHERE webhook_id = ? ORDER BY id`,
  )
    .bind(webhookId)
    .all<{ event_name: string; event_class: string; metadata_json: string | null }>();
  return results.map(({ event_name, event_class, metadata_json }) => ({
    name: event_name,
    class: event_class,
    metadata: metadata_json === null ? null : JSON.parse(metadata_json),
  }));
}

export async function grantComplimentary(shop: string) {
  const at = "2026-07-31T10:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO complimentary_entitlements (shop_id, status, granted_at, created_at, updated_at)
     SELECT id, 'active', ?, ?, ? FROM shops WHERE shop_domain = ?`,
  )
    .bind(at, at, at, shop)
    .run();
}
