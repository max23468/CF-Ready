import { parseStoredAppErrorCode, type AppErrorCode } from "./app-error";
import type {
  Address2Classification,
  Address2Decision,
  CheckoutLabelsMode,
  CheckoutLabelState,
  CheckoutLabelsStatus,
} from "./checkout-labels/domain";
import { checkoutLabelsStatus } from "./checkout-labels/domain";

export type SupportDiagnosticState = {
  configHash: string | null;
  configSchemaVersion: number | null;
  entitlementKind: "annual" | "complimentary" | "monthly" | "none" | "one_time" | "trial";
  errorCode: AppErrorCode | null;
  lastSyncAt: string | null;
  validationEnabled: boolean;
  validationStateRevision: number;
  checkoutLabelsEnabled: boolean;
  checkoutLabelsMode: CheckoutLabelsMode;
  checkoutLabelsStatus: CheckoutLabelsStatus;
  address2Classification: Address2Classification;
  address2Decision: Address2Decision;
  address2MarketOverride: boolean;
  checkoutLabelLocales: string;
  checkoutLabelMarketCount: number;
  checkoutLabelsLastSyncAt: string | null;
  checkoutLabelsErrorCode: string | null;
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
              state.checkout_labels_mode, state.checkout_labels_last_sync_at,
              state.checkout_labels_last_error_code, state.checkout_labels_decision,
              state.checkout_labels_accepted_revision, state.checkout_labels_reviewed_at,
              state.address2_classification,
              state.address2_decision, state.address2_has_market_override,
              state.address2_external_change_at, state.address2_form_mode,
              state.address2_form_hidden,
              (SELECT GROUP_CONCAT(DISTINCT locale)
                 FROM checkout_label_slots slots WHERE slots.shop_id = shop.id) AS label_locales,
              (SELECT COUNT(DISTINCT NULLIF(market_id, ''))
                 FROM checkout_label_slots slots WHERE slots.shop_id = shop.id) AS label_market_count,
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
      checkout_labels_mode: CheckoutLabelsMode | null;
      checkout_labels_last_sync_at: string | null;
      checkout_labels_last_error_code: string | null;
      checkout_labels_decision: "pending" | "accepted" | null;
      checkout_labels_accepted_revision: string | null;
      checkout_labels_reviewed_at: string | null;
      address2_classification: Address2Classification | null;
      address2_decision: Address2Decision | null;
      address2_has_market_override: number | null;
      address2_external_change_at: string | null;
      address2_form_mode: "required" | "optional" | null;
      address2_form_hidden: number | null;
      label_locales: string | null;
      label_market_count: number | null;
    }>();

  const entitlementKind =
    row?.complimentary_status === "active"
      ? "complimentary"
      : row?.entitlement_status === "active" || row?.entitlement_status === "ending"
        ? (row.plan_kind ?? "none")
        : row?.trial_status === "active"
          ? "trial"
          : "none";

  const checkoutLabelState: CheckoutLabelState = {
    mode: row?.checkout_labels_mode ?? "off",
    managementEpoch: null,
    enabledAt: null,
    lastSyncAt: row?.checkout_labels_last_sync_at ?? null,
    lastErrorCode: row?.checkout_labels_last_error_code ?? null,
    decision: row?.checkout_labels_decision ?? "pending",
    acceptedRevision: row?.checkout_labels_accepted_revision ?? null,
    reviewedAt: row?.checkout_labels_reviewed_at ?? null,
    address2Classification: row?.address2_classification ?? "unknown",
    address2HasMarketOverride: Boolean(row?.address2_has_market_override),
    address2ExternalChangeAt: row?.address2_external_change_at ?? null,
    address2Decision: row?.address2_decision ?? "pending",
    address2ReviewedAt: null,
    address2FormMode: row?.address2_form_hidden ? "hidden" : (row?.address2_form_mode ?? null),
  };

  return {
    configHash: row?.config_hash ?? null,
    configSchemaVersion: row?.config_schema_version ?? null,
    entitlementKind,
    errorCode: parseStoredAppErrorCode(row?.last_error_code),
    lastSyncAt: row?.last_sync_at ?? null,
    validationEnabled: Boolean(row?.validation_enabled),
    validationStateRevision: row?.validation_state_revision ?? 0,
    checkoutLabelsEnabled: checkoutLabelState.mode !== "off",
    checkoutLabelsMode: checkoutLabelState.mode,
    checkoutLabelsStatus: checkoutLabelsStatus(checkoutLabelState),
    address2Classification: checkoutLabelState.address2Classification,
    address2Decision: checkoutLabelState.address2Decision,
    address2MarketOverride: checkoutLabelState.address2HasMarketOverride,
    checkoutLabelLocales: row?.label_locales ?? "",
    checkoutLabelMarketCount: row?.label_market_count ?? 0,
    checkoutLabelsLastSyncAt: checkoutLabelState.lastSyncAt,
    checkoutLabelsErrorCode: checkoutLabelState.lastErrorCode,
  };
}
