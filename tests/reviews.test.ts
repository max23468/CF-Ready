import { expect, test } from "vitest";
import { normalizeReviewRequestCode } from "../app/reviews";

test.each([
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
  "request-failed",
])("conserva il codice documentato dalla Reviews API: %s", (code) => {
  expect(normalizeReviewRequestCode(code)).toBe(code);
});

test.each(["future-code", "", null])("riduce a unknown un codice non documentato: %j", (code) => {
  expect(normalizeReviewRequestCode(code)).toBe("unknown");
});
