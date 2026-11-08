import { recordEvent } from "../events.server";
import { findOfflineSession, unauthenticated } from "../shopify.server";
import type { WebhookJob } from "../webhooks/webhook-ingress.server";
import { enqueueOrderBackfill, type OrderBackfillPayload } from "./backfill-queue.server";
import { normalizeOrder, normalizeOrdersPage } from "./service.server";

// D-206: un payload senza ID valido arriva comunque in coda e chiude il job senza effetti.
export type OrderCreatedPayload = { orderId?: string };

type Claim = { webhookId: string; shop: string };

export async function processOrderCreatedJob(
  db: D1Database,
  claim: Claim,
  job: WebhookJob<OrderCreatedPayload>,
) {
  if (!job.orderId) return;
  const admin = await offlineAdmin(db, claim);
  if (!admin) return;
  try {
    const { updated } = await normalizeOrder(admin, job.orderId);
    if (updated > 0) await recordNormalized(db, claim, { updated_count: updated });
  } catch (error) {
    if (await skippedForMerchantAction(db, claim, error)) return;
    throw error;
  }
}

export async function processOrderBackfillJob(
  db: D1Database,
  claim: Claim,
  job: WebhookJob<Partial<OrderBackfillPayload>>,
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
    if (await skippedForMerchantAction(db, claim, error)) return;
    throw error;
  }
}

async function offlineAdmin(db: D1Database, claim: Claim) {
  if (!(await findOfflineSession(claim.shop))) {
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

// Scope revocati o Validation duplicate: un retry non cambierebbe l'esito, serve un'azione del
// merchant che la UI già chiede.
const SKIPPED_ORDER_ERRORS = new Set(["order_scope_missing", "duplicate_validations"]);

async function skippedForMerchantAction(db: D1Database, claim: Claim, error: unknown) {
  if (!(error instanceof Error) || !SKIPPED_ORDER_ERRORS.has(error.message)) return false;
  await recordEvent(db, {
    shopDomain: claim.shop,
    webhookId: claim.webhookId,
    name: "order_fields_skipped",
    class: "lifecycle",
    metadata: { error_code: error.message },
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
