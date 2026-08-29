export type EventClass =
  | "lifecycle"
  | "billing"
  | "validation"
  | "onboarding"
  | "support"
  | "error";

// L'allowlist dei campi sanitizzati è il tipo stesso: niente payload, header, token, CF o PEC.
export type EventMetadata = Partial<
  Record<
    | "topic"
    | "country_code"
    | "error_code"
    | "reason"
    | "enabled"
    | "schema_version"
    | "pricing_generation"
    | "correlation_id",
    string | number | boolean
  >
>;

type AppEvent = {
  shopDomain?: string | null;
  webhookId?: string;
  name: string;
  class: EventClass;
  metadata?: EventMetadata;
};

const ORDINARY_LOG_SAMPLE = 0.1;

function correlationIdFor(event: AppEvent) {
  return String(event.metadata?.correlation_id ?? event.webhookId ?? crypto.randomUUID());
}

export function logEvent(event: AppEvent, occurredAt: string, sample = Math.random()) {
  const correlationId = correlationIdFor(event);
  if (event.class !== "error" && !event.webhookId && sample >= ORDINARY_LOG_SAMPLE) {
    return correlationId;
  }

  const record = {
    event: event.name,
    class: event.class,
    occurredAt,
    ...event.metadata,
    correlation_id: correlationId,
    webhook: Boolean(event.webhookId),
  };
  if (event.class === "error") console.error(record);
  else console.info(record);
  return correlationId;
}

export async function recordEvent(db: D1Database, event: AppEvent) {
  const occurredAt = new Date().toISOString();
  const correlationId = correlationIdFor(event);

  try {
    const result = await db
      .prepare(
        `INSERT INTO app_events (
           shop_id, webhook_id, event_name, event_class, metadata_json, occurred_at
         ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?)
         ON CONFLICT(webhook_id, event_name) WHERE webhook_id IS NOT NULL DO NOTHING`,
      )
      .bind(
        event.shopDomain ?? null,
        event.webhookId ?? null,
        event.name,
        event.class,
        event.metadata ? JSON.stringify(event.metadata) : null,
        occurredAt,
      )
      .run();
    if (!result.success) throw new Error("Scrittura evento non riuscita");
    if (result.meta.changes === 0) return;
    logEvent(
      {
        ...event,
        metadata: { ...event.metadata, correlation_id: correlationId },
      },
      occurredAt,
    );
  } catch {
    logEvent(
      {
        name: "app_event_write_failed",
        class: "error",
        metadata: { correlation_id: correlationId },
      },
      occurredAt,
    );
  }
}

export async function dismissMerchantCheckIn(db: D1Database, shopDomain: string) {
  const occurredAt = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, metadata_json, occurred_at)
       SELECT shop.id, 'merchant_checkin_dismissed', 'support', NULL, ?
         FROM shops shop
        WHERE shop.shop_domain = ?
          AND NOT EXISTS (
            SELECT 1 FROM app_events event
             WHERE event.shop_id = shop.id
               AND event.event_name = 'merchant_checkin_dismissed'
          )`,
    )
    .bind(occurredAt, shopDomain)
    .run();
  return result.success;
}
