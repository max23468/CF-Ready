import { recordEvent } from "../events.server";
import { stableErrorCode } from "../primitives";

export const PROCESSING_TIMEOUT_MINUTES = 5;
export const PROCESSING_TIMEOUT_MS = PROCESSING_TIMEOUT_MINUTES * 60 * 1000;

export const ORDER_WEBHOOK_PATH = "/webhooks/orders/create";
// Il payload contiene dati del cliente: la sottoscrizione chiede solo questo campo.
export const ORDER_WEBHOOK_ID_FIELD = "admin_graphql_api_id";

// I campi di ogni topic viaggiano accanto a quelli comuni: i messaggi già in coda hanno questa forma.
export type WebhookJob<Payload extends object = object> = {
  webhookId: string;
  claimToken: string;
  shop: string;
} & Payload;

export type ScopesUpdatePayload = { currentScopes: string[] };

export type ClaimedWebhook = {
  webhookId: string;
  topic: string;
  shop: string;
  installationStartedAt: string | null;
};

export async function handleWebhook<Payload extends object>(
  db: D1Database,
  webhook: { webhookId: string; topic: string; shop: string; triggeredAt?: string },
  queue: Queue<WebhookJob> | undefined,
  payload?: Payload,
) {
  if (!queue) return new Response(null, { status: 500 });

  const { webhookId, topic, shop, triggeredAt } = webhook;
  const claim = await claimWebhook(db, webhookId, topic, shop, { triggeredAt });

  if (!claim.acquired) {
    return new Response(null, { status: claim.retry ? 500 : 200 });
  }

  const job = { webhookId, claimToken: claim.token, shop, ...payload };
  const enqueued = await enqueueClaimedJob(db, queue, job);
  return new Response(null, { status: enqueued ? 200 : 500 });
}

export async function enqueueClaimedJob(db: D1Database, queue: Queue<WebhookJob>, job: WebhookJob) {
  try {
    await queue.send(job);
    return true;
  } catch {
    await failClaimedWebhook(db, job, new Error("queue_enqueue_failed"));
    return false;
  }
}

export async function claimWebhook(
  db: D1Database,
  webhookId: string,
  topic: string,
  shopDomain: string | null,
  { triggeredAt }: { triggeredAt?: string } = {},
) {
  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  const staleBefore = new Date(Date.parse(now) - PROCESSING_TIMEOUT_MS).toISOString();
  const eventTimestamp = triggeredAt ? Date.parse(triggeredAt) : Number.NaN;
  if (topic === "APP_UNINSTALLED" && Number.isNaN(eventTimestamp)) {
    return { acquired: false, retry: true } as const;
  }
  const eventTime = Number.isNaN(eventTimestamp) ? "" : new Date(eventTimestamp).toISOString();
  const claim = await db
    .prepare(
      `INSERT INTO webhook_events (
         webhook_id, shop_domain, topic, status, received_at, claim_token, installation_started_at
       )
       VALUES (
         ?, ?, ?, 'processing', ?, ?,
         (SELECT installed_at FROM shops
          WHERE shop_domain = ? AND (? != 'APP_UNINSTALLED' OR installed_at <= ?))
       )
       ON CONFLICT (webhook_id) DO UPDATE SET
         status = 'processing',
         received_at = excluded.received_at,
         claim_token = excluded.claim_token,
         installation_started_at = webhook_events.installation_started_at,
         processed_at = NULL,
         error_code = NULL
       WHERE webhook_events.status = 'failed'
          OR (webhook_events.status = 'processing' AND webhook_events.received_at <= ?)
       RETURNING claim_token, installation_started_at`,
    )
    .bind(webhookId, shopDomain, topic, now, token, shopDomain, topic, eventTime, staleBefore)
    .first<{ claim_token: string; installation_started_at: string | null }>();

  if (claim) {
    return {
      acquired: true as const,
      token: claim.claim_token,
      installationStartedAt: claim.installation_started_at,
    };
  }

  const existing = await db
    .prepare("SELECT status FROM webhook_events WHERE webhook_id = ?")
    .bind(webhookId)
    .first<{ status: "processing" | "processed" | "failed" }>();
  return { acquired: false as const, retry: existing?.status !== "processed" };
}

export async function loadClaimedWebhook(
  db: D1Database,
  job: WebhookJob,
): Promise<ClaimedWebhook | null> {
  const claim = await db
    .prepare(
      `SELECT webhook_id, topic, shop_domain, installation_started_at
       FROM webhook_events
       WHERE webhook_id = ? AND status = 'processing' AND claim_token = ?`,
    )
    .bind(job.webhookId, job.claimToken)
    .first<{
      webhook_id: string;
      topic: string;
      shop_domain: string | null;
      installation_started_at: string | null;
    }>();

  return claim
    ? {
        webhookId: claim.webhook_id,
        topic: claim.topic,
        shop: claim.shop_domain ?? job.shop,
        installationStartedAt: claim.installation_started_at,
      }
    : null;
}

export async function renewWebhookClaim(db: D1Database, webhookId: string, token: string) {
  const now = new Date().toISOString();
  const renewed = await db
    .prepare(
      `UPDATE webhook_events SET received_at = ?
       WHERE webhook_id = ? AND status = 'processing' AND claim_token = ?
       RETURNING webhook_id`,
    )
    .bind(now, webhookId, token)
    .first<{ webhook_id: string }>();
  return renewed !== null;
}

export async function finishWebhook(
  db: D1Database,
  webhookId: string,
  token: string,
  status: "processed" | "failed",
  code: string | null = null,
) {
  const finished = await db
    .prepare(
      `UPDATE webhook_events SET status = ?, processed_at = ?, error_code = ?
       WHERE webhook_id = ? AND status = 'processing' AND claim_token = ?
       RETURNING webhook_id`,
    )
    .bind(status, new Date().toISOString(), code, webhookId, token)
    .first<{ webhook_id: string }>();
  return finished !== null;
}

export async function failClaimedWebhook(db: D1Database, job: WebhookJob, error: unknown) {
  const claim = await loadClaimedWebhook(db, job);
  if (!claim) return;

  const code = errorCode(error);
  if (await finishWebhook(db, job.webhookId, job.claimToken, "failed", code)) {
    await recordEvent(db, {
      shopDomain: claim.shop,
      webhookId: job.webhookId,
      name: "webhook_failed",
      class: "error",
      metadata: { topic: claim.topic, error_code: code, correlation_id: job.webhookId },
    });
  }
}

export function errorCode(error: unknown) {
  if (error instanceof Response) return `response_${error.status}`;
  return stableErrorCode(error, "unhandled_error");
}
