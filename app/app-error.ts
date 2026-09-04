export const APP_ERROR_CODES = [
  "billing_read_failed",
  "cancel_failed",
  "charge_failed",
  "charge_pending",
  "config_conflict",
  "duplicate_validations",
  "duplicate_validations_active",
  "entitlement_readback_failed",
  "entitlement_required",
  "entitlement_write_failed",
  "generic",
  "no_subscription",
  "one_time_already_active",
  "subscription_cancel_failed",
  "trial_unavailable",
  "validation_limit_reached",
  "validation_locked",
  "validation_readback_failed",
  "validation_write_failed",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const APP_ERROR_CODE_SET = new Set<string>(APP_ERROR_CODES);

export function parseAppErrorCode(value: unknown): AppErrorCode | null {
  return typeof value === "string" && APP_ERROR_CODE_SET.has(value)
    ? (value as AppErrorCode)
    : null;
}

// Un valore persistito non vuoto rappresenta comunque un errore aperto. Ridurlo a `null`
// nasconderebbe il banner operativo e potrebbe sbloccare onboarding o recensioni mentre lo
// stato è ancora incerto. I codici futuri o corrotti degradano quindi al fallback pubblico.
export function parseStoredAppErrorCode(value: unknown): AppErrorCode | null {
  if (value === null || value === undefined || value === "") return null;
  return parseAppErrorCode(value) ?? "generic";
}

export function localizedError(
  errors: Record<string, string> & { generic: string },
  errorCode: unknown,
) {
  const parsed = parseAppErrorCode(errorCode);
  return parsed && parsed in errors ? errors[parsed] : errors.generic;
}
