import { recordEvent } from "./events.server";

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export async function handleWebhook(
  db: D1Database,
  webhook: { webhookId: string; topic: string; shop: string; triggeredAt?: string },
  handler: (claim: { installationStartedAt: string | null }) => Promise<void>,
) {
  const { webhookId, topic, shop, triggeredAt } = webhook;
  const claim = await claimWebhook(db, webhookId, topic, shop, undefined, undefined, triggeredAt);

  if (!claim.acquired) {
    return new Response(null, { status: claim.retry ? 500 : 200 });
  }
  const heartbeat = startWebhookClaimHeartbeat(db, webhookId, claim.token);

  try {
    await handler({
      installationStartedAt: claim.installationStartedAt,
    });
    if (!(await heartbeat.isHeld())) return new Response(null, { status: 500 });
  } catch (error) {
    const code = errorCode(error);
    if (await finishWebhook(db, webhookId, claim.token, "failed", code)) {
      await recordEvent(db, {
        shopDomain: shop,
        webhookId,
        name: "webhook_failed",
        class: "error",
        metadata: { topic, error_code: code, correlation_id: webhookId },
      });
    }
    return new Response(null, { status: 500 });
  } finally {
    await heartbeat.stop();
  }

  const processed = await finishWebhook(db, webhookId, claim.token, "processed");
  return new Response(null, { status: processed ? 200 : 500 });
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
  const eventTime =
    triggeredAt && !Number.isNaN(Date.parse(triggeredAt))
      ? new Date(triggeredAt).toISOString()
      : "";
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
