import { recordEvent } from "../events.server";
import { sessionStorage, unauthenticated } from "../shopify.server";
import type { WebhookJob } from "../webhooks/webhook-ingress.server";
import { enqueueOrderBackfill } from "./backfill-queue.server";
import { normalizeOrder, normalizeOrdersPage } from "./service.server";

export { ORDER_BACKFILL_TOPIC } from "./backfill-queue.server";

type Claim = { webhookId: string; shop: string };

export async function processOrderCreatedJob(db: D1Database, claim: Claim, job: WebhookJob) {
  if (!job.orderId) return;
  const admin = await offlineAdmin(db, claim);
  if (!admin) return;
  try {
    const { updated } = await normalizeOrder(admin, job.orderId);
    if (updated > 0) await recordNormalized(db, claim, { updated_count: updated });
  } catch (error) {
    if (await skippedForMissingScope(db, claim, error)) return;
    throw error;
  }
}

export async function processOrderBackfillJob(
  db: D1Database,
  claim: Claim,
  job: WebhookJob,
  queue: Queue<WebhookJob> | undefined,
) {
  if (!job.backfill || !queue) throw new Error("order_backfill_unavailable");
  const admin = await offlineAdmin(db, claim);
  if (!admin) return;
  try {
    const page = await normalizeOrdersPage(admin, job.backfill.since, job.backfill.cursor);
    if (page.updated > 0) await recordNormalized(db, claim, { updated_count: page.updated });
    if (page.nextCursor) {
      await enqueueOrderBackfill(db, queue, claim.shop, {
        since: job.backfill.since,
        cursor: page.nextCursor,
      });
    }
  } catch (error) {
    if (await skippedForMissingScope(db, claim, error)) return;
    throw error;
  }
}

async function offlineAdmin(db: D1Database, claim: Claim) {
  const sessions = await sessionStorage.findSessionsByShop(claim.shop);
  if (!sessions.some(({ isOnline }) => !isOnline)) {
    await recordEvent(db, {
      shopDomain: claim.shop,
      webhookId: claim.webhookId,
      name: "order_fields_skipped",
      class: "lifecycle",
      metadata: { error_code: "missing_admin_context" },
    });
    return null;
  }
  return (await unauthenticated.admin(claim.shop)).admin;
}

// Scope revocati dopo l'attivazione: nessun retry, la UI chiede di nuovo il permesso.
async function skippedForMissingScope(db: D1Database, claim: Claim, error: unknown) {
  if (!(error instanceof Error) || error.message !== "order_scope_missing") return false;
  await recordEvent(db, {
    shopDomain: claim.shop,
    webhookId: claim.webhookId,
    name: "order_fields_skipped",
    class: "lifecycle",
    metadata: { error_code: "order_scope_missing" },
  });
  return true;
}

async function recordNormalized(db: D1Database, claim: Claim, metadata: { updated_count: number }) {
  await recordEvent(db, {
    shopDomain: claim.shop,
    webhookId: claim.webhookId,
    name: "order_fields_normalized",
    class: "lifecycle",
    metadata,
  });
}
