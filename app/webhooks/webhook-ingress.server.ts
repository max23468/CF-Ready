const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

export type WebhookJob = {
  webhookId: string;
  claimToken: string;
  shop: string;
  currentScopes?: string[];
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
    const { failClaimedWebhook } = await import("./webhooks.server");
    await failClaimedWebhook(db, job, new Error("queue_enqueue_failed"));
    return new Response(null, { status: 500 });
  }
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
