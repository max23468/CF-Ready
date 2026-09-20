import { recordEvent } from "./events.server";
import type { WebhookJob } from "./webhook-ingress.server";

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const FAILURE_QUEUE_PROCESS_ATTEMPTS = 2;

export type { WebhookJob } from "./webhook-ingress.server";

export async function consumeWebhookMessage(
  db: D1Database,
  message: Message<WebhookJob>,
  finalizing: boolean,
  process: (db: D1Database, job: WebhookJob) => Promise<void>,
) {
  try {
    if (finalizing && message.attempts > FAILURE_QUEUE_PROCESS_ATTEMPTS) {
      await failClaimedWebhook(db, message.body, new Error("queue_retries_exhausted"));
    } else {
      await process(db, message.body);
    }
    message.ack();
  } catch {
    message.retry({ delaySeconds: finalizing ? 60 : 10 });
  }
}

type ClaimedWebhook = {
  webhookId: string;
  topic: string;
  shop: string;
  installationStartedAt: string | null;
};

export async function runClaimedWebhook(
  db: D1Database,
  job: WebhookJob,
  handler: (claim: ClaimedWebhook) => Promise<void>,
) {
  const claim = await loadClaimedWebhook(db, job);
  if (!claim) return;

  const heartbeat = startWebhookClaimHeartbeat(db, job.webhookId, job.claimToken);

  try {
    await handler(claim);
    if (!(await heartbeat.isHeld())) throw new Error("webhook_claim_lost");
    if (!(await finishWebhook(db, job.webhookId, job.claimToken, "processed"))) {
      throw new Error("webhook_claim_lost");
    }
  } finally {
    await heartbeat.stop();
  }
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

async function loadClaimedWebhook(db: D1Database, job: WebhookJob) {
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

export async function renewWebhookClaim(
  db: D1Database,
  webhookId: string,
  token: string,
  now = new Date().toISOString(),
) {
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

function startWebhookClaimHeartbeat(db: D1Database, webhookId: string, token: string) {
  let held = true;
  let running = Promise.resolve();
  const renew = () => {
    running = running
      .then(async () => {
        if (held) held = await renewWebhookClaim(db, webhookId, token);
      })
      .catch(() => undefined);
    return running;
  };
  const timer = setInterval(() => void renew(), PROCESSING_TIMEOUT_MS / 3);

  return {
    async isHeld() {
      await renew();
      return held;
    },
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
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

// Solo codici stabili: il messaggio di un errore imprevisto può contenere dati non sanitizzati.
export function errorCode(error: unknown) {
  if (error instanceof Response) return `response_${error.status}`;
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "unhandled_error";
}
