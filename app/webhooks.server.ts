import { recordEvent } from "./events.server";

export async function handleWebhook(
  db: D1Database,
  webhook: { webhookId: string; topic: string; shop: string },
  handler: () => Promise<void>,
) {
  const { webhookId, topic, shop } = webhook;

  if (!(await claimWebhook(db, webhookId, topic, shop))) {
    return new Response();
  }

  try {
    await handler();
  } catch (error) {
    const code = errorCode(error);
    await finishWebhook(db, webhookId, "failed", code);
    await recordEvent(db, {
      shopDomain: shop,
      name: "webhook_failed",
      class: "error",
      metadata: { topic, error_code: code, correlation_id: webhookId },
    });
    return new Response(null, { status: 500 });
  }

  await finishWebhook(db, webhookId, "processed");
  return new Response();
}

export async function claimWebhook(
  db: D1Database,
  webhookId: string,
  topic: string,
  shopDomain: string | null,
  now = new Date().toISOString(),
) {
  const claim = await db
    .prepare(
      `INSERT INTO webhook_events (webhook_id, shop_domain, topic, status, received_at)
       VALUES (?, ?, ?, 'processing', ?)
       ON CONFLICT (webhook_id) DO UPDATE SET
         status = 'processing',
         received_at = excluded.received_at,
         processed_at = NULL,
         error_code = NULL
       WHERE webhook_events.status = 'failed'
       RETURNING webhook_id`,
    )
    .bind(webhookId, shopDomain, topic, now)
    .first<{ webhook_id: string }>();

  return claim !== null;
}

export async function finishWebhook(
  db: D1Database,
  webhookId: string,
  status: "processed" | "failed",
  code: string | null = null,
) {
  await db
    .prepare(
      `UPDATE webhook_events SET status = ?, processed_at = ?, error_code = ? WHERE webhook_id = ?`,
    )
    .bind(status, new Date().toISOString(), code, webhookId)
    .run();
}

// Solo codici stabili: il messaggio di un errore imprevisto può contenere dati non sanitizzati.
export function errorCode(error: unknown) {
  if (error instanceof Response) return `response_${error.status}`;
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "unhandled_error";
}
