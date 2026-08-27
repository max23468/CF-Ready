import { useEffect } from "react";
import { sendPerformanceReport } from "./performance-report";

export function PerformanceReporter() {
  useEffect(() => {
    if (typeof shopify === "undefined" || !shopify.webVitals) return;
    const callback = (report: ShopifyWebVitalsReport) =>
      sendPerformanceReport(report, window.location.pathname);

    void shopify.webVitals.onReport(callback);
    return () => {
      void shopify.webVitals.onReport(null);
    };
  }, []);

  return null;
}
