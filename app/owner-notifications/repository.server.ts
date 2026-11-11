import { sha256Hex } from "../primitives";
import { validIsoDate, type OperationalSnapshot, type PartnerEventType } from "./model";

const PARTNER_POLL_REPLAY_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_PAGES = 100;
export const NOTIFICATION_PAGE_SIZE = 100;
export const LOCAL_EVENT_CURSOR_KEY = "local_notification_event_id";
export const BILLING_EVENT_CURSOR_KEY = "billing_notification_event_id";
export const PARTNER_EVENTS_POLLED_KEY = "partner_events_polled_at";

const SAME_SOURCE_INSTANT_SQL = "ABS(unixepoch(source_occurred_at) - unixepoch(?)) <= 300";

export const NOT_REDACTED_SQL = `NOT EXISTS (
  SELECT 1 FROM owner_notification_redactions
   WHERE shop_hash = ? AND redacted_at >= ?
)`;

export const OPERATIONAL_SNAPSHOT_COLUMNS = `s.display_name, s.installation_status, s.country_code,
  s.installed_at, a.onboarding_status, a.onboarding_step,
  a.validation_enabled, t.status AS trial_status, b.plan_kind, b.entitlement_status,
  c.status AS complimentary_status`;

export const OPERATIONAL_SNAPSHOT_JOINS = `LEFT JOIN app_state a ON a.shop_id = s.id
  LEFT JOIN trials t ON t.shop_id = s.id
  LEFT JOIN billing_accounts b ON b.shop_id = s.id
  LEFT JOIN complimentary_entitlements c ON c.shop_id = s.id`;

export type NotificationKind = "lifecycle" | "billing" | "trial" | "operational";

export function outboxStatement(
  db: D1Database,
  notification: {
    dedupeKey: string;
    kind: NotificationKind;
    shopDomain: string | null;
    subject: string;
    body: string;
    occurredAt: string;
  },
  guard: { where: string; bindings: unknown[] },
) {
  return db
    .prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         status, available_at, created_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
       WHERE ${guard.where}
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .bind(
      notification.dedupeKey,
      notification.kind,
      notification.shopDomain,
      notification.subject,
      notification.body,
      notification.occurredAt,
      notification.occurredAt,
      notification.occurredAt,
      notification.occurredAt,
      ...guard.bindings,
    );
}

export function notificationStatement(
  db: D1Database,
  notification: {
    dedupeKey: string;
    kind: "lifecycle" | "billing" | "trial";
    shopDomain: string;
    shopHash: string;
    subject: string;
    body: string;
    occurredAt: string;
  },
) {
  return outboxStatement(db, notification, {
    where: NOT_REDACTED_SQL,
    bindings: [notification.shopHash, notification.occurredAt],
  });
}

export function readOperationalSnapshot(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT ${OPERATIONAL_SNAPSHOT_COLUMNS}, t.ends_at AS trial_ends_at
       FROM shops s
       ${OPERATIONAL_SNAPSHOT_JOINS}
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<OperationalSnapshot>();
}

export async function previousPlanKind(
  db: D1Database,
  shopDomain: string,
  chargeId: string,
  currentKind: "monthly" | "annual" | "one_time" | null,
) {
  if (!currentKind) return null;
  const transition = await db
    .prepare(
      `SELECT previous_plan_kind FROM billing_events
       WHERE shopify_resource_gid = ? AND event_type = 'active'
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(chargeId)
    .first<{ previous_plan_kind: string | null }>();
  const previous = transition?.previous_plan_kind;
  if (previous && previous !== "none" && previous !== currentKind) {
    return previous as "monthly" | "annual" | "one_time";
  }
  const account = await db
    .prepare(
      `SELECT b.plan_kind FROM billing_accounts b
       JOIN shops s ON s.id = b.shop_id WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{ plan_kind: string }>();
  return account?.plan_kind && account.plan_kind !== "none" && account.plan_kind !== currentKind
    ? (account.plan_kind as "monthly" | "annual" | "one_time")
    : null;
}

export async function partnerPollWindow(db: D1Database, key: string, now: Date) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  const previous = state && validIsoDate(state.state_value) ? Date.parse(state.state_value) : null;
  return {
    checkpointAt: previous === null ? null : new Date(previous).toISOString(),
    occurredAtMin: new Date(
      previous === null
        ? now.getTime() - PARTNER_POLL_REPLAY_MS
        : previous - PARTNER_POLL_REPLAY_MS,
    ).toISOString(),
  };
}

export async function localEventCursor(db: D1Database) {
  return (await readIntegerState(db, LOCAL_EVENT_CURSOR_KEY)) ?? 0;
}

export async function billingEventCursor(db: D1Database, now: Date) {
  const existing = await readIntegerState(db, BILLING_EVENT_CURSOR_KEY);
  if (existing !== null) return existing;
  const firstNotification = await db
    .prepare("SELECT MIN(created_at) AS created_at FROM owner_notifications")
    .first<{ created_at: string | null }>();
  const coverageStartedAt = validIsoDate(firstNotification?.created_at ?? undefined)
    ? firstNotification!.created_at!
    : new Date(now.getTime() - PARTNER_POLL_REPLAY_MS).toISOString();
  const row = await db
    .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM billing_events WHERE occurred_at < ?")
    .bind(coverageStartedAt)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

async function readIntegerState(db: D1Database, key: string) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  if (!state || !/^\d+$/.test(state.state_value)) return null;
  const value = Number(state.state_value);
  return Number.isSafeInteger(value) ? value : null;
}

export async function writeNotificationState(
  db: D1Database,
  key: string,
  value: string,
  now = new Date(),
) {
  await db
    .prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         state_value = excluded.state_value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, value, now.toISOString())
    .run();
}

export async function relationshipNotificationKey(
  shopDomain: string,
  type: Extract<PartnerEventType, `RELATIONSHIP_${string}`>,
  installationStartedAt: string,
) {
  const transition = type.toLocaleLowerCase("en-US").replace("relationship_", "");
  return notificationKey("relationship", `${shopDomain}:${installationStartedAt}:${transition}`);
}

export async function hasEquivalentNotification(
  db: D1Database,
  shopDomain: string,
  subject: string | readonly string[],
  occurredAt: string,
) {
  const subjects = typeof subject === "string" ? [subject] : subject;
  // Più oggetti equivalenti indicano la stessa installazione vista da sorgente locale e Partner
  // API, i cui orari in Production distano fino a un quarto d'ora.
  const instant =
    subjects.length > 1
      ? "ABS(unixepoch(source_occurred_at) - unixepoch(?)) <= 1800"
      : SAME_SOURCE_INSTANT_SQL;
  const match = await db
    .prepare(
      `SELECT id FROM owner_notifications
       WHERE shop_domain = ? AND subject IN (${subjects.map(() => "?").join(", ")})
         AND ${instant}
       LIMIT 1`,
    )
    .bind(shopDomain, ...subjects, occurredAt)
    .first<{ id: number }>();
  return match !== null;
}

export async function replacePendingEquivalentBody(
  db: D1Database,
  input: { body: string; shopDomain: string; subject: string; occurredAt: string; now: Date },
) {
  const updated = await db
    .prepare(
      `UPDATE owner_notifications SET body_text = ?, updated_at = ?
       WHERE shop_domain = ? AND subject = ? AND status = 'pending'
         AND ${SAME_SOURCE_INSTANT_SQL}`,
    )
    .bind(input.body, input.now.toISOString(), input.shopDomain, input.subject, input.occurredAt)
    .run();
  return updated.meta.changes > 0;
}

export function readEquivalentNotificationBody(
  db: D1Database,
  shopDomain: string,
  subject: string,
  occurredAt: string,
) {
  return db
    .prepare(
      `SELECT body_text FROM owner_notifications
       WHERE shop_domain = ? AND subject = ?
         AND ${SAME_SOURCE_INSTANT_SQL}
       ORDER BY id LIMIT 1`,
    )
    .bind(shopDomain, subject, occurredAt)
    .first<{ body_text: string }>();
}

// Stati condivisi da Partner e billing locale: la stessa transizione produce la stessa chiave.
const PARTNER_BILLING_STATES = {
  SUBSCRIPTION_CHARGE_ACCEPTED: "accepted",
  SUBSCRIPTION_CHARGE_ACTIVATED: "active",
  SUBSCRIPTION_CHARGE_CANCELED: "ending",
  SUBSCRIPTION_CHARGE_DECLINED: "declined",
  SUBSCRIPTION_CHARGE_EXPIRED: "request_expired",
  SUBSCRIPTION_CHARGE_FROZEN: "frozen",
  SUBSCRIPTION_CHARGE_UNFROZEN: "unfrozen",
  ONE_TIME_CHARGE_ACCEPTED: "accepted",
  ONE_TIME_CHARGE_ACTIVATED: "active",
  ONE_TIME_CHARGE_DECLINED: "declined",
  ONE_TIME_CHARGE_EXPIRED: "request_expired",
} as const;

const LOCAL_BILLING_STATES = {
  active: "active",
  ending: "ending",
  expired: "entitlement_expired",
  refunded: "refunded",
} as const;

export function partnerBillingState(type: PartnerEventType) {
  return PARTNER_BILLING_STATES[type as keyof typeof PARTNER_BILLING_STATES];
}

export function localBillingState(type: keyof typeof LOCAL_BILLING_STATES) {
  return LOCAL_BILLING_STATES[type];
}

export function billingNotificationKey(resourceId: string, state: string) {
  return notificationKey("billing", `${resourceId}:${state}`);
}

export function notificationKey(kind: string, source: string) {
  return sha256Hex(`${kind}:${source}`);
}
