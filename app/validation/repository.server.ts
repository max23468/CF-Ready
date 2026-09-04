import { parseStoredAppErrorCode, type AppErrorCode } from "../app-error";
import { configHash } from "./domain";
import type { Validation } from "./types";
import { safeStoreDisplayName } from "../shop-profile.server";

type Config = { schemaVersion?: number; rules?: unknown; messages?: unknown };

export async function persistValidationState(
  db: D1Database,
  shopDomain: string,
  state: {
    displayName: string;
    countryCode: string;
    validation: Validation | undefined;
    validationEnabled?: boolean;
    errorCode: AppErrorCode | null;
    expectedRevision?: number;
  },
) {
  const now = new Date().toISOString();
  const config = state.validation?.metafield?.jsonValue;
  const schemaVersion =
    config && typeof config === "object" && typeof (config as Config).schemaVersion === "number"
      ? (config as Config).schemaVersion
      : null;

  await db.batch([
    db
      .prepare(
        `UPDATE shops SET
           display_name = ?,
           country_code = ?,
           installation_status = CASE
             WHEN installation_status = 'blocked_country' THEN 'active'
             ELSE installation_status
           END,
           updated_at = ?
         WHERE shop_domain = ?
           AND (? IS NULL OR COALESCE((
             SELECT validation_state_revision FROM app_state WHERE shop_id = shops.id
           ), 0) = ?)`,
      )
      .bind(
        safeStoreDisplayName(state.displayName),
        state.countryCode,
        now,
        shopDomain,
        state.expectedRevision ?? null,
        state.expectedRevision ?? null,
      ),
    db
      .prepare(
        `INSERT INTO app_state (
           shop_id, validation_gid, validation_enabled, config_schema_version,
           config_hash, last_sync_at, last_error_code, updated_at, validation_state_revision
         ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(shop_id) DO UPDATE SET
           validation_gid = excluded.validation_gid,
           validation_enabled = excluded.validation_enabled,
           config_schema_version = excluded.config_schema_version,
           config_hash = excluded.config_hash,
           last_sync_at = excluded.last_sync_at,
           last_error_code = excluded.last_error_code,
           updated_at = excluded.updated_at,
           validation_state_revision = app_state.validation_state_revision + 1
         WHERE ? IS NULL OR app_state.validation_state_revision = ?`,
      )
      .bind(
        shopDomain,
        state.validation?.id ?? null,
        Number(state.validationEnabled ?? state.validation?.enabled ?? false),
        schemaVersion,
        config === undefined || config === null ? null : await configHash(config),
        now,
        state.errorCode,
        now,
        state.expectedRevision ?? null,
        state.expectedRevision ?? null,
      ),
  ]);
}

export async function readValidationStateRevision(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT validation_state_revision FROM app_state
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{ validation_state_revision: number }>();
  return row?.validation_state_revision ?? 0;
}

export async function readAddress2Declaration(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT address2_conflict_declared_at FROM app_state
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{ address2_conflict_declared_at: string | null }>();
  return row?.address2_conflict_declared_at ?? null;
}

export async function saveAddress2Declaration(
  db: D1Database,
  shopDomain: string,
  declared: boolean,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
         SET address2_conflict_declared_at = CASE
               WHEN ? = 0 THEN NULL
               WHEN address2_conflict_declared_at IS NULL THEN ?
               ELSE address2_conflict_declared_at
             END,
             updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(Number(declared), now, now, shopDomain)
    .run();
}

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

export async function readHomeState(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT a.onboarding_status, a.onboarding_step, a.last_error_code,
              a.validation_enabled, a.address2_conflict_declared_at,
              EXISTS (
                SELECT 1 FROM app_events dismissed
                 WHERE dismissed.shop_id = shop.id
                   AND dismissed.event_name = 'merchant_checkin_dismissed'
              ) AS merchant_checkin_dismissed,
              (SELECT event.occurred_at
                 FROM app_events event
                WHERE event.shop_id = shop.id
                  AND event.event_name = 'validation_enabled'
                ORDER BY event.occurred_at DESC
                LIMIT 1) AS validation_enabled_since
         FROM shops shop
         LEFT JOIN app_state a ON a.shop_id = shop.id
        WHERE shop.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{
      onboarding_status: OnboardingStatus | null;
      onboarding_step: number | null;
      last_error_code: string | null;
      validation_enabled: number | null;
      address2_conflict_declared_at: string | null;
      merchant_checkin_dismissed: number;
      validation_enabled_since: string | null;
    }>();

  return {
    onboarding: {
      status: row?.onboarding_status ?? "not_started",
      step: Math.min(4, Math.max(1, row?.onboarding_step ?? 1)),
      errorCode: parseStoredAppErrorCode(row?.last_error_code),
      validationEnabled: Boolean(row?.validation_enabled),
    },
    address2Declaration: row?.address2_conflict_declared_at ?? null,
    merchantCheckInDismissed: Boolean(row?.merchant_checkin_dismissed),
    enabledSince: row?.validation_enabled_since ?? null,
  };
}

export async function readOnboarding(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT onboarding_status, onboarding_step, last_error_code, validation_enabled
       FROM app_state WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(shopDomain)
    .first<{
      onboarding_status: OnboardingStatus;
      onboarding_step: number;
      last_error_code: string | null;
      validation_enabled: number;
    }>();

  return {
    status: row?.onboarding_status ?? "not_started",
    // La colonna nasce a zero: `?? 1` non scatta su una riga che esiste già, e un passo zero
    // produce una schermata vuota. Il valore viene quindi riportato dentro l'intervallo.
    step: Math.min(4, Math.max(1, row?.onboarding_step ?? 1)),
    errorCode: parseStoredAppErrorCode(row?.last_error_code),
    validationEnabled: Boolean(row?.validation_enabled),
  };
}

export async function saveOnboarding(
  db: D1Database,
  shopDomain: string,
  { status, step }: { status: OnboardingStatus; step: number },
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE app_state
         SET onboarding_status = CASE
               WHEN onboarding_status = 'completed' THEN 'completed'
               ELSE ?
             END,
             onboarding_step = CASE
               WHEN onboarding_status = 'completed' THEN 1
               ELSE ?
             END,
             setup_checklist_dismissed_at = CASE
               WHEN ? = 'completed' AND setup_checklist_dismissed_at IS NULL THEN ?
               ELSE setup_checklist_dismissed_at
             END,
             updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(status, step, status, now, now, shopDomain)
    .run();
}

export async function completeOnboardingAutomatically(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE app_state
          SET onboarding_status = 'completed', onboarding_step = 1,
              setup_checklist_dismissed_at = COALESCE(setup_checklist_dismissed_at, ?),
              updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND onboarding_status != 'completed'`,
    )
    .bind(now, now, shopDomain)
    .run();
  return result.success && result.meta.changes > 0;
}

// Il momento dell'attivazione è già nel registro eventi, quindi non serve una colonna nuova.
export async function validationEnabledSince(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT occurred_at FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND event_name = 'validation_enabled'
       ORDER BY occurred_at DESC LIMIT 1`,
    )
    .bind(shopDomain)
    .first<{ occurred_at: string }>();
  return row?.occurred_at ?? null;
}
