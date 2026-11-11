const REVIEW_REQUEST_CODES = [
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

type ReviewRequestCode = (typeof REVIEW_REQUEST_CODES)[number] | "request-failed" | "unknown";

export const COMPLETED_REVIEW_REQUEST_CODES = [
  "success",
  "already-reviewed",
] as const satisfies readonly ReviewRequestCode[];

export function isCompletedReviewRequest(code: ReviewRequestCode) {
  return (COMPLETED_REVIEW_REQUEST_CODES as readonly ReviewRequestCode[]).includes(code);
}

export function normalizeReviewRequestCode(value: unknown): ReviewRequestCode {
  if (value === "request-failed") return value;
  return typeof value === "string" &&
    REVIEW_REQUEST_CODES.includes(value as (typeof REVIEW_REQUEST_CODES)[number])
    ? (value as (typeof REVIEW_REQUEST_CODES)[number])
    : "unknown";
}
