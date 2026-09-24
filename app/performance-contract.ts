export const PERFORMANCE_ENDPOINT = "/performance";

export const PERFORMANCE_METRIC_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export const PERFORMANCE_ROUTES = [
  "home",
  "rules",
  "messages",
  "guide",
  "onboarding",
  "other",
] as const;
export const PERFORMANCE_SERVER_TIMING_NAMES = [
  "auth",
  "auth_session_lookup",
  "auth_session_decrypt",
  "auth_session_encrypt",
  "auth_session_store",
  "auth_token_exchange",
  "auth_after_hook",
  "reconcile_total",
  "shopify_snapshot",
  "shopify_context",
  "shopify_billing",
  "shopify_scopes",
  "shopify_checkout_labels",
  "d1_commercial",
  "d1_commercial_sync",
  "d1_home",
  "d1_address",
  "d1_onboarding",
  "d1_support",
  "d1_validation_schedule",
  "d1_validation_revision",
  "d1_validation_state",
  "validation_entitlement_sync",
  "d1_configuration_history",
  "d1_checkout_labels",
  "total",
] as const;

export type PerformanceMetricName = (typeof PERFORMANCE_METRIC_NAMES)[number];
export type PerformanceRoute = (typeof PERFORMANCE_ROUTES)[number];
export type PerformanceServerTimingName = (typeof PERFORMANCE_SERVER_TIMING_NAMES)[number];
