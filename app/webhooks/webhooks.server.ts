import {
  type ClaimedWebhook,
  failClaimedWebhook,
  finishWebhook,
  loadClaimedWebhook,
  PROCESSING_TIMEOUT_MS,
  renewWebhookClaim,
  type WebhookJob,
} from "./webhook-ingress.server";
import {
  WEBHOOK_FAILURE_QUEUE_SUFFIX,
  WEBHOOK_FAILURE_RETRY_DELAY_SECONDS,
  WEBHOOK_RETRY_DELAY_SECONDS,
} from "../worker-triggers";

const FAILURE_QUEUE_PROCESS_ATTEMPTS = 2;

export async function consumeWebhookBatch(
  db: D1Database,
  batch: MessageBatch<WebhookJob>,
  process: (db: D1Database, job: WebhookJob) => Promise<void>,
) {
  const finalizing = batch.queue.endsWith(WEBHOOK_FAILURE_QUEUE_SUFFIX);
  for (const message of batch.messages) {
    try {
      if (finalizing && message.attempts > FAILURE_QUEUE_PROCESS_ATTEMPTS) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await failClaimedWebhook(db, message.body, new Error("queue_retries_exhausted"));
      } else {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await process(db, message.body);
      }
      message.ack();
    } catch {
      message.retry({
        delaySeconds: finalizing
          ? WEBHOOK_FAILURE_RETRY_DELAY_SECONDS
          : WEBHOOK_RETRY_DELAY_SECONDS,
      });
    }
  }
}

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
