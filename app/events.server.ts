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
    | "correlation_id",
    string | number | boolean
  >
>;

export async function recordEvent(
  db: D1Database,
  event: {
    shopDomain?: string | null;
    name: string;
    class: EventClass;
    metadata?: EventMetadata;
  },
) {
  const occurredAt = new Date().toISOString();

  if (event.class === "error") {
    console.error(
      JSON.stringify({
        event: event.name,
        class: event.class,
        occurredAt,
        ...event.metadata,
      }),
    );
  }

  try {
    await db
      .prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, metadata_json, occurred_at)
         VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?)`,
      )
      .bind(
        event.shopDomain ?? null,
        event.name,
        event.class,
        event.metadata ? JSON.stringify(event.metadata) : null,
        occurredAt,
      )
      .run();
  } catch {
    console.error(JSON.stringify({ event: "app_event_write_failed", class: "error", occurredAt }));
  }
}
