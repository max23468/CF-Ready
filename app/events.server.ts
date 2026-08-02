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

export function logEvent(event: AppEvent, occurredAt: string, sample = Math.random()) {
  if (event.class !== "error" && !event.webhookId && sample >= ORDINARY_LOG_SAMPLE) return;

  const record = {
    event: event.name,
    class: event.class,
    occurredAt,
    ...event.metadata,
    correlation_id: event.metadata?.correlation_id ?? event.webhookId ?? crypto.randomUUID(),
    webhook: Boolean(event.webhookId),
  };
  if (event.class === "error") console.error(record);
  else console.info(record);
}

export async function recordEvent(db: D1Database, event: AppEvent) {
  const occurredAt = new Date().toISOString();
  logEvent(event, occurredAt);

  try {
    await db
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
  } catch {
    logEvent({ name: "app_event_write_failed", class: "error" }, occurredAt);
  }
}
