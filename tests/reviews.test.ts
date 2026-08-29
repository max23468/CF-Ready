import { expect, test } from "vitest";
import { normalizeReviewRequestCode, REVIEW_REQUEST_CODES } from "../app/reviews";

test("accetta tutti e soli i codici documentati dalla Reviews API", () => {
  for (const code of REVIEW_REQUEST_CODES) expect(normalizeReviewRequestCode(code)).toBe(code);
  expect(normalizeReviewRequestCode("request-failed")).toBe("request-failed");
  expect(normalizeReviewRequestCode("future-code")).toBe("unknown");
  expect(normalizeReviewRequestCode(null)).toBe("unknown");
});
