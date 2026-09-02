export const PERFORMANCE_ENDPOINT = "/app/performance";

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
  "shopify_snapshot",
  "shopify_context",
  "shopify_billing",
  "d1_commercial",
  "d1_home",
  "d1_validation_schedule",
  "total",
] as const;

export type PerformanceMetricName = (typeof PERFORMANCE_METRIC_NAMES)[number];
export type PerformanceRoute = (typeof PERFORMANCE_ROUTES)[number];
export type PerformanceServerTimingName = (typeof PERFORMANCE_SERVER_TIMING_NAMES)[number];
