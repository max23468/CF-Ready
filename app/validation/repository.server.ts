import { configHash } from "./domain";
import type { Validation } from "./types";

type Config = { schemaVersion?: number; rules?: unknown; messages?: unknown };

export async function persistValidationState(
  db: D1Database,
  shopDomain: string,
  state: {
    countryCode: string;
    eligible: boolean;
    validation: Validation | undefined;
    validationEnabled?: boolean;
    errorCode: string | null;
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
           country_code = ?,
           installation_status = CASE
             WHEN ? = 0 AND installation_status = 'active' THEN 'blocked_country'
             WHEN ? = 1 AND installation_status = 'blocked_country' THEN 'active'
             ELSE installation_status
           END,
           updated_at = ?
         WHERE shop_domain = ?`,
      )
      .bind(state.countryCode, Number(state.eligible), Number(state.eligible), now, shopDomain),
    db
      .prepare(
        `INSERT INTO app_state (
           shop_id, validation_gid, validation_enabled, config_schema_version,
           config_hash, last_sync_at, last_error_code, updated_at
         ) VALUES ((SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shop_id) DO UPDATE SET
           validation_gid = excluded.validation_gid,
           validation_enabled = excluded.validation_enabled,
           config_schema_version = excluded.config_schema_version,
           config_hash = excluded.config_hash,
           last_sync_at = excluded.last_sync_at,
           last_error_code = excluded.last_error_code,
           updated_at = excluded.updated_at`,
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
      ),
  ]);
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
    errorCode: row?.last_error_code ?? null,
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
