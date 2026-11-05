import { claimWebhook, type WebhookJob } from "../webhooks/webhook-ingress.server";
import { ORDER_BACKFILL_DAYS } from "./domain";

// D-206: le pagine della correzione degli ordini esistenti passano dalla coda webhook e ne
// riusano claim, retry e dead letter con un ID sintetico. Il modulo resta senza client
// Shopify perché lo importa anche l'azione della pagina Regole.
export const ORDER_BACKFILL_TOPIC = "ORDER_FIELDS_BACKFILL";

export function orderBackfillSince(now = new Date()) {
  return new Date(now.getTime() - ORDER_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function enqueueOrderBackfill(
  db: D1Database,
  queue: Queue<WebhookJob>,
  shop: string,
  backfill: WebhookJob["backfill"] = { since: orderBackfillSince(), cursor: null },
) {
  const webhookId = `order-fields-backfill:${crypto.randomUUID()}`;
  const claim = await claimWebhook(db, webhookId, ORDER_BACKFILL_TOPIC, shop);
  if (!claim.acquired) throw new Error("order_backfill_enqueue_failed");
  await queue.send({ webhookId, claimToken: claim.token, shop, backfill });
}
