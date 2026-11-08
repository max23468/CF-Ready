import {
  recordEvent,
  type EventClass,
  type EventMetadata,
  type RecordedEventName,
} from "../events.server";
import { markUninstalled, redactShop } from "../shop.server";
import { findOfflineSession, sessionStorage, unauthenticated } from "../shopify.server";
import { reconcile } from "../validation/reconcile.server";
import { runClaimedWebhook } from "./webhooks.server";
import type { ClaimedWebhook, ScopesUpdatePayload, WebhookJob } from "./webhook-ingress.server";
import { recordCurrentScopes } from "../checkout-labels/service.server";
import {
  ORDER_BACKFILL_TOPIC,
  type OrderBackfillPayload,
} from "../order-normalization/backfill-queue.server";
import {
  type OrderCreatedPayload,
  processOrderBackfillJob,
  processOrderCreatedJob,
} from "../order-normalization/jobs.server";

type QueuedWebhookJob = WebhookJob<
  Partial<ScopesUpdatePayload> & OrderCreatedPayload & Partial<OrderBackfillPayload>
>;

type TopicHandler = (
  db: D1Database,
  claim: ClaimedWebhook,
  job: QueuedWebhookJob,
  queue?: Queue<WebhookJob>,
) => Promise<void>;

type ReconciledState = Awaited<ReturnType<typeof reconcile>>;

function reconcileHandler(outcome: {
  skipped: RecordedEventName;
  updated: RecordedEventName;
  class: EventClass;
  metadata: (state: ReconciledState) => EventMetadata;
}): TopicHandler {
  return async (db, { shop, webhookId }) => {
    if (!(await findOfflineSession(shop))) {
      await recordEvent(db, {
        shopDomain: shop,
        webhookId,
        name: outcome.skipped,
        class: outcome.class,
        metadata: { error_code: "missing_admin_context" },
      });
      return;
    }

    const { admin } = await unauthenticated.admin(shop);
    const state = await reconcile(admin, db, shop);
    if (state.retryable) {
      throw new Error(state.errorCode ?? "reconciliation_retryable");
    }
    await recordEvent(db, {
      shopDomain: shop,
      webhookId,
      name: outcome.updated,
      class: outcome.class,
      metadata: {
        ...outcome.metadata(state),
        ...(state.errorCode ? { error_code: state.errorCode } : {}),
      },
    });
  };
}

const reconcileBilling = reconcileHandler({
  skipped: "billing_update_skipped",
  updated: "billing_updated",
  class: "billing",
  metadata: (state) => ({ reason: state.account?.entitlement_status ?? "none" }),
});

// CF Ready non conserva dati acquirente: i topic customers/* non hanno nulla da cancellare.
const acknowledgeCompliance: TopicHandler = async (db, { shop, topic, webhookId }) => {
  await recordEvent(db, {
    shopDomain: shop,
    webhookId,
    name: "compliance_acknowledged",
    class: "lifecycle",
    metadata: { topic },
  });
};

export const TOPIC_HANDLERS = new Map<string, TopicHandler>([
  [
    "APP_UNINSTALLED",
    async (db, { shop, installationStartedAt, webhookId }) => {
      if (installationStartedAt) {
        await markUninstalled(db, shop, installationStartedAt, webhookId);
      }
    },
  ],
  [
    "APP_SCOPES_UPDATE",
    async (db, { shop }, { currentScopes }) => {
      const session = await findOfflineSession(shop);
      if (!session || !currentScopes) return;
      session.scope = currentScopes.join(",");
      await sessionStorage.storeSession(session);
      await recordCurrentScopes(db, shop, currentScopes);
    },
  ],
  [
    "SHOP_REDACT",
    async (db, { shop, topic, webhookId }) => {
      if (await redactShop(db, shop, webhookId)) return;
      await recordEvent(db, {
        shopDomain: shop,
        webhookId,
        name: "shop_redact_skipped",
        class: "lifecycle",
        metadata: { topic, reason: "installation_active" },
      });
    },
  ],
  ["CUSTOMERS_DATA_REQUEST", acknowledgeCompliance],
  ["CUSTOMERS_REDACT", acknowledgeCompliance],
  ["ORDERS_CREATE", (db, claim, job) => processOrderCreatedJob(db, claim, job)],
  [ORDER_BACKFILL_TOPIC, (db, claim, job, queue) => processOrderBackfillJob(db, claim, job, queue)],
  [
    "SHOP_UPDATE",
    reconcileHandler({
      skipped: "shop_update_skipped",
      updated: "shop_updated",
      class: "lifecycle",
      metadata: (state) => ({
        country_code: state.countryCode,
        enabled: state.validationEnabled,
      }),
    }),
  ],
  ["APP_SUBSCRIPTIONS_UPDATE", reconcileBilling],
  ["APP_PURCHASES_ONE_TIME_UPDATE", reconcileBilling],
]);

export async function processWebhookJob(
  db: D1Database,
  job: QueuedWebhookJob,
  queue?: Queue<WebhookJob>,
) {
  await runClaimedWebhook(db, job, async (claim) => {
    const handler = TOPIC_HANDLERS.get(claim.topic);
    if (!handler) throw new Error("unsupported_webhook_topic");
    await handler(db, claim, job, queue);
  });
}
