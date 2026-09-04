import { validIsoDate, type OperationalSnapshot, type PartnerEventType } from "./model";

const PARTNER_POLL_REPLAY_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_PAGES = 100;
export const NOTIFICATION_PAGE_SIZE = 100;
export const LOCAL_EVENT_CURSOR_KEY = "local_notification_event_id";
export const BILLING_EVENT_CURSOR_KEY = "billing_notification_event_id";

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
  return db
    .prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         status, available_at, created_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM owner_notification_redactions
         WHERE shop_hash = ? AND redacted_at >= ?
       )
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
      notification.shopHash,
      notification.occurredAt,
    );
}

export function readOperationalSnapshot(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT s.display_name, s.installation_status, s.country_code, s.shop_currency,
              s.billing_currency, s.installed_at, a.onboarding_status, a.onboarding_step,
              a.validation_enabled, t.status AS trial_status, t.ends_at AS trial_ends_at,
              b.plan_kind, b.entitlement_status
       FROM shops s
       LEFT JOIN app_state a ON a.shop_id = s.id
       LEFT JOIN billing_accounts b ON b.shop_id = s.id
       LEFT JOIN trials t ON t.shop_id = s.id
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

export async function partnerPollStart(db: D1Database, key: string, now: Date) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  const previous = state && validIsoDate(state.state_value) ? Date.parse(state.state_value) : null;
  return new Date(
    previous === null ? now.getTime() - PARTNER_POLL_REPLAY_MS : previous - PARTNER_POLL_REPLAY_MS,
  ).toISOString();
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
  subject: string,
  occurredAt: string,
) {
  const match = await db
    .prepare(
      `SELECT id FROM owner_notifications
       WHERE shop_domain = ? AND subject = ?
         AND ABS(unixepoch(source_occurred_at) - unixepoch(?)) <= 300
       LIMIT 1`,
    )
    .bind(shopDomain, subject, occurredAt)
    .first<{ id: number }>();
  return match !== null;
}

export function billingNotificationKey(resourceId: string, state: string) {
  return notificationKey("billing", `${resourceId}:${state}`);
}

export async function notificationKey(kind: string, source: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${kind}:${source}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
