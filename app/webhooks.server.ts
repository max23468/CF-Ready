import { recordEvent } from "./events.server";

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export type WebhookJob = {
  webhookId: string;
  claimToken: string;
  shop: string;
  currentScopes?: string[];
};

export async function consumeWebhookMessage(
  db: D1Database,
  message: Message<WebhookJob>,
  finalizing: boolean,
  process: (db: D1Database, job: WebhookJob) => Promise<void>,
) {
  try {
    if (finalizing) {
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

export async function handleWebhook(
  db: D1Database,
  webhook: { webhookId: string; topic: string; shop: string; triggeredAt?: string },
  queue: Queue<WebhookJob> | undefined,
  details: Pick<WebhookJob, "currentScopes"> = {},
) {
  if (!queue) return new Response(null, { status: 500 });

  const { webhookId, topic, shop, triggeredAt } = webhook;
  const claim = await claimWebhook(db, webhookId, topic, shop, undefined, undefined, triggeredAt);

  if (!claim.acquired) {
    return new Response(null, { status: claim.retry ? 500 : 200 });
  }

  const job = { webhookId, claimToken: claim.token, shop, ...details };
  try {
    await queue.send(job);
    return new Response(null, { status: 200 });
  } catch {
    await failClaimedWebhook(db, job, new Error("queue_enqueue_failed"));
    return new Response(null, { status: 500 });
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

export async function claimWebhook(
  db: D1Database,
  webhookId: string,
  topic: string,
  shopDomain: string | null,
  now = new Date().toISOString(),
  token: string = crypto.randomUUID(),
  triggeredAt?: string,
) {
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
