import { parseStoredAppErrorCode, type AppErrorCode } from "./app-error";

export type SupportDiagnosticState = {
  configHash: string | null;
  configSchemaVersion: number | null;
  entitlementKind: "annual" | "complimentary" | "monthly" | "none" | "one_time" | "trial";
  errorCode: AppErrorCode | null;
  lastSyncAt: string | null;
  validationEnabled: boolean;
  validationStateRevision: number;
};

export async function readSupportDiagnosticState(
  db: D1Database,
  shopDomain: string,
): Promise<SupportDiagnosticState> {
  const row = await db
    .prepare(
      `SELECT state.config_schema_version, state.config_hash, state.last_sync_at,
              state.last_error_code, state.validation_enabled,
              state.validation_state_revision,
              billing.plan_kind, billing.entitlement_status,
              trial.status AS trial_status,
              complimentary.status AS complimentary_status
         FROM shops shop
         LEFT JOIN app_state state ON state.shop_id = shop.id
         LEFT JOIN billing_accounts billing ON billing.shop_id = shop.id
         LEFT JOIN trials trial ON trial.shop_id = shop.id
         LEFT JOIN complimentary_entitlements complimentary ON complimentary.shop_id = shop.id
        WHERE shop.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{
      config_schema_version: number | null;
      config_hash: string | null;
      last_sync_at: string | null;
      last_error_code: string | null;
      validation_enabled: number | null;
      validation_state_revision: number | null;
      plan_kind: "annual" | "monthly" | "none" | "one_time" | null;
      entitlement_status: string | null;
      trial_status: string | null;
      complimentary_status: string | null;
    }>();

  const entitlementKind =
    row?.complimentary_status === "active"
      ? "complimentary"
      : row?.entitlement_status === "active" || row?.entitlement_status === "ending"
        ? (row.plan_kind ?? "none")
        : row?.trial_status === "active"
          ? "trial"
          : "none";

  return {
    configHash: row?.config_hash ?? null,
    configSchemaVersion: row?.config_schema_version ?? null,
    entitlementKind,
    errorCode: parseStoredAppErrorCode(row?.last_error_code),
    lastSyncAt: row?.last_sync_at ?? null,
    validationEnabled: Boolean(row?.validation_enabled),
    validationStateRevision: row?.validation_state_revision ?? 0,
  };
}
