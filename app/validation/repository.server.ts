import { parseStoredAppErrorCode, type AppErrorCode } from "../app-error";
import { CONFIG_SCHEMA_VERSION } from "../config";
import { recordedEventSql } from "../events.server";
import { COMPLETED_REVIEW_REQUEST_CODES } from "../reviews";
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
    ianaTimezone?: string;
    partnerDevelopment?: boolean;
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
           iana_timezone = COALESCE(?, iana_timezone),
           partner_development = COALESCE(?, partner_development),
           updated_at = ?
         WHERE shop_domain = ?
           AND (? IS NULL OR COALESCE((
             SELECT validation_state_revision FROM app_state WHERE shop_id = shops.id
           ), 0) = ?)`,
      )
      .bind(
        safeStoreDisplayName(state.displayName),
        state.countryCode,
        state.ianaTimezone ?? null,
        state.partnerDevelopment === undefined ? null : Number(state.partnerDevelopment),
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

type OnboardingStatus = "not_started" | "in_progress" | "completed";

export async function readHomeState(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT a.onboarding_status, a.onboarding_step, a.last_error_code,
              a.validation_enabled, a.last_sync_at,
              -- Le colonne sopravvivono alla retention di app_events. Gli eventi coprono le
              -- scritture del Worker precedente tra migrazione e deploy.
              a.merchant_checkin_dismissed_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM app_events dismissed
                 WHERE dismissed.shop_id = shop.id
                   AND dismissed.event_name = ${recordedEventSql("merchant_checkin_dismissed")}
              ) AS merchant_checkin_dismissed,
              a.review_completed_at IS NOT NULL OR EXISTS (
                SELECT 1 FROM app_events reviewed
                 WHERE reviewed.shop_id = shop.id
                   AND reviewed.event_name = ${recordedEventSql("review_prompt_result")}
                   AND json_extract(reviewed.metadata_json, '$.reason')
                       IN (${COMPLETED_REVIEW_REQUEST_CODES.map((code) => `'${code}'`).join(", ")})
              ) AS review_completed,
              MAX(COALESCE(a.validation_enabled_since, ''), COALESCE((
                SELECT event.occurred_at
                  FROM app_events event
                 WHERE event.shop_id = shop.id
                   AND event.event_name = ${recordedEventSql("validation_enabled")}
                 ORDER BY event.occurred_at DESC
                 LIMIT 1), '')) AS validation_enabled_since
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
      last_sync_at: string | null;
      merchant_checkin_dismissed: number;
      review_completed: number;
      validation_enabled_since: string | null;
    }>();

  return {
    onboarding: {
      status: row?.onboarding_status ?? "not_started",
      // La colonna nasce a zero: `?? 1` non scatta su una riga che esiste già, e un passo zero
      // produce una schermata vuota.
      step: Math.min(4, Math.max(1, row?.onboarding_step ?? 1)),
      errorCode: parseStoredAppErrorCode(row?.last_error_code),
      validationEnabled: Boolean(row?.validation_enabled),
    },
    merchantCheckInDismissed: Boolean(row?.merchant_checkin_dismissed),
    reviewCompleted: Boolean(row?.review_completed),
    enabledSince: row?.validation_enabled_since || null,
    lastSyncAt: row?.last_sync_at ?? null,
  };
}

// Fatti permanenti della Home: gli eventi corrispondenti scadono con la retention.
export async function markReviewCompleted(db: D1Database, shopDomain: string) {
  await db
    .prepare(
      `UPDATE app_state SET review_completed_at = COALESCE(review_completed_at, ?)
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(new Date().toISOString(), shopDomain)
    .run();
}

export async function markValidationEnabledSince(db: D1Database, shopDomain: string) {
  await db
    .prepare(
      `UPDATE app_state SET validation_enabled_since = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(new Date().toISOString(), shopDomain)
    .run();
}

// Ultimo stato noto per il primo paint della Home (D-167, D-199): nome, paese, fuso, tipo di store
// e ultima configurazione scritta dall'app. Non è autorevole; la riconciliazione Shopify lo sostituisce appena risponde.
export async function readStoredShopSnapshot(db: D1Database, shopDomain: string) {
  const row = await db
    .prepare(
      `SELECT shop.display_name, shop.country_code, shop.iana_timezone, shop.partner_development,
              history.rules_json, history.messages_json
         FROM shops shop
         LEFT JOIN configuration_history history ON history.id = (
           SELECT latest.id FROM configuration_history latest
            WHERE latest.shop_id = shop.id
            ORDER BY datetime(latest.created_at) DESC, latest.id DESC
            LIMIT 1)
        WHERE shop.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{
      display_name: string | null;
      country_code: string | null;
      iana_timezone: string | null;
      partner_development: number | null;
      rules_json: string | null;
      messages_json: string | null;
    }>();

  let config: Config | null = null;
  try {
    if (row?.rules_json && row.messages_json) {
      config = {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        rules: JSON.parse(row.rules_json),
        messages: JSON.parse(row.messages_json),
      };
    }
  } catch {
    config = null;
  }
  return {
    displayName: row?.display_name ?? null,
    countryCode: row?.country_code ?? null,
    timeZone: row?.iana_timezone ?? null,
    partnerDevelopment:
      row?.partner_development === null || row?.partner_development === undefined
        ? null
        : row.partner_development === 1,
    config,
  };
}

export async function readOnboarding(db: D1Database, shopDomain: string) {
  return (await readHomeState(db, shopDomain)).onboarding;
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
             updated_at = ?
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(status, step, now, shopDomain)
    .run();
}

export async function completeOnboardingAutomatically(db: D1Database, shopDomain: string) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE app_state
          SET onboarding_status = 'completed', onboarding_step = 1, updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
          AND onboarding_status != 'completed'`,
    )
    .bind(now, shopDomain)
    .run();
  return result.success && result.meta.changes > 0;
}
