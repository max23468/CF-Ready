import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { normalizeReviewRequestCode } from "../../reviews";
import type { action } from "./home.server";

export function useNativeReviewPrompt(reviewDue: boolean) {
  const fetcher = useFetcher<typeof action>();
  const requested = useRef(false);

  useEffect(() => {
    if (!reviewDue || typeof shopify === "undefined" || requested.current) return;
    requested.current = true;
    void shopify.reviews
      .request()
      .then((result) => {
        fetcher.submit(
          { intent: "review_prompt_result", code: normalizeReviewRequestCode(result.code) },
          { method: "post" },
        );
      })
      .catch(() => {
        fetcher.submit(
          { intent: "review_prompt_result", code: "request-failed" },
          { method: "post" },
        );
      });
  }, [fetcher, reviewDue]);
}
