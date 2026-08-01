import { recordEvent } from "./events.server";

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export async function handleWebhook(
  db: D1Database,
  webhook: { webhookId: string; topic: string; shop: string },
  handler: (claim: { installationStartedAt: string | null; receivedAt: string }) => Promise<void>,
) {
  const { webhookId, topic, shop } = webhook;
  const claim = await claimWebhook(db, webhookId, topic, shop);

  if (!claim.acquired) {
    return new Response(null, { status: claim.retry ? 500 : 200 });
  }

  try {
    await handler({
      installationStartedAt: claim.installationStartedAt,
      receivedAt: claim.receivedAt,
    });
  } catch (error) {
    const code = errorCode(error);
    if (await finishWebhook(db, webhookId, claim.token, "failed", code)) {
      await recordEvent(db, {
        shopDomain: shop,
        name: "webhook_failed",
        class: "error",
        metadata: { topic, error_code: code, correlation_id: webhookId },
      });
    }
    return new Response(null, { status: 500 });
  }

  await finishWebhook(db, webhookId, claim.token, "processed");
  return new Response();
}

export async function claimWebhook(
  db: D1Database,
  webhookId: string,
  topic: string,
  shopDomain: string | null,
  now = new Date().toISOString(),
  token: string = crypto.randomUUID(),
) {
  const staleBefore = new Date(Date.parse(now) - PROCESSING_TIMEOUT_MS).toISOString();
  const claim = await db
    .prepare(
      `INSERT INTO webhook_events (
         webhook_id, shop_domain, topic, status, received_at, claim_token, installation_started_at
       )
       VALUES (?, ?, ?, 'processing', ?, ?, (SELECT installed_at FROM shops WHERE shop_domain = ?))
       ON CONFLICT (webhook_id) DO UPDATE SET
         status = 'processing',
         received_at = excluded.received_at,
         claim_token = excluded.claim_token,
         installation_started_at = COALESCE(
           webhook_events.installation_started_at,
           excluded.installation_started_at
         ),
         processed_at = NULL,
         error_code = NULL
       WHERE webhook_events.status = 'failed'
          OR (webhook_events.status = 'processing' AND webhook_events.received_at <= ?)
       RETURNING claim_token, installation_started_at`,
    )
    .bind(webhookId, shopDomain, topic, now, token, shopDomain, staleBefore)
    .first<{ claim_token: string; installation_started_at: string | null }>();

  if (claim) {
    return {
      acquired: true as const,
      token: claim.claim_token,
      installationStartedAt: claim.installation_started_at,
      receivedAt: now,
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
