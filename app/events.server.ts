export const EVENT_CLASSES = [
  "lifecycle",
  "billing",
  "validation",
  "onboarding",
  "support",
  "error",
] as const;

export type EventClass = (typeof EVENT_CLASSES)[number];

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
    | "correlation_id"
    | "updated_count",
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

export type RecordedEventName =
  | "app_installed"
  | "app_uninstalled"
  | "billing_reconciliation_cycle_failed"
  | "billing_update_skipped"
  | "billing_updated"
  | "charge_create_failed"
  | "compliance_acknowledged"
  | "install_refused"
  | "merchant_checkin_dismissed"
  | "offline_token_refresh_failed"
  | "onboarding_auto_completed"
  | "onboarding_completed"
  | "order_fields_normalized"
  | "order_fields_skipped"
  | "owner_control_command_failed"
  | "owner_control_delivery_untracked"
  | "owner_notification_cycle_failed"
  | "owner_notification_partner_event_skipped"
  | "owner_notification_send_failed"
  | "retention_failed"
  | "review_prompt_result"
  | "rules_saved"
  | "shop_redact_skipped"
  | "shop_redacted"
  | "shop_update_skipped"
  | "shop_updated"
  | "subscription_cancelled"
  | "subscription_converted"
  | "support_diagnostics_copied"
  | "trial_converted"
  | "trial_expired"
  | "trial_started"
  | "validation_disabled"
  | "validation_enabled"
  | "validation_state_persist_failed"
  | "webhook_failed";

export function recordedEventSql(...names: RecordedEventName[]) {
  return names.map((name) => `'${name}'`).join(", ");
}

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

export async function recordEvent(db: D1Database, event: AppEvent & { name: RecordedEventName }) {
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
  // La colonna conserva la chiusura oltre la retention degli eventi; l'evento resta per i report.
  // Le due scritture sono idempotenti: se la seconda fallisce, la chiusura si può ripetere.
  const event = await db
    .prepare(
      `INSERT INTO app_events (shop_id, event_name, event_class, metadata_json, occurred_at)
       SELECT shop.id, 'merchant_checkin_dismissed', 'support', NULL, ?
         FROM shops shop
         LEFT JOIN app_state state ON state.shop_id = shop.id
        WHERE shop.shop_domain = ?
          AND state.merchant_checkin_dismissed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM app_events event
             WHERE event.shop_id = shop.id
               AND event.event_name = 'merchant_checkin_dismissed'
          )`,
    )
    .bind(occurredAt, shopDomain)
    .run();
  if (!event.success) return false;
  const state = await db
    .prepare(
      `UPDATE app_state
          SET merchant_checkin_dismissed_at = COALESCE(merchant_checkin_dismissed_at, ?)
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(occurredAt, shopDomain)
    .run();
  return state.success;
}
