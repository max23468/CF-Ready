// Le conferme guidate e i conflitti da rileggere richiedono una scelta del merchant,
// non sono fallimenti della sincronizzazione automatica.
export const CHECKOUT_LABEL_SYNC_ERRORS = [
  "checkout_labels_locale_missing",
  "checkout_labels_partial_sync",
  "checkout_labels_readback_failed",
  "checkout_labels_resource_ambiguous",
  "checkout_labels_resource_missing",
  "checkout_labels_stale_digest",
] as const;

export const CHECKOUT_LABEL_ERROR_FILTER = `a.checkout_labels_mode != 'off'
  AND a.checkout_labels_last_error_code IN (${CHECKOUT_LABEL_SYNC_ERRORS.map((code) => `'${code}'`).join(", ")})`;

export const OPEN_STORE_ERROR_FILTER = `(a.last_error_code IS NOT NULL OR (${CHECKOUT_LABEL_ERROR_FILTER}))`;
