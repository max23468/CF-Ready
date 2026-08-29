export const REVIEW_REQUEST_CODES = [
  "success",
  "mobile-app",
  "already-reviewed",
  "annual-limit-reached",
  "cooldown-period",
  "merchant-ineligible",
  "recently-installed",
  "already-open",
  "open-in-progress",
  "cancelled",
] as const;

export type ReviewRequestCode =
  | (typeof REVIEW_REQUEST_CODES)[number]
  | "request-failed"
  | "unknown";

export function normalizeReviewRequestCode(value: unknown): ReviewRequestCode {
  if (value === "request-failed") return value;
  return typeof value === "string" &&
    REVIEW_REQUEST_CODES.includes(value as (typeof REVIEW_REQUEST_CODES)[number])
    ? (value as (typeof REVIEW_REQUEST_CODES)[number])
    : "unknown";
}
