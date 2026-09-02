import { useEffect } from "react";
import { readNavigationServerTimings, sendPerformanceReport } from "./performance-report";

export function PerformanceReporter() {
  useEffect(() => {
    if (typeof shopify === "undefined" || !shopify.webVitals) return;
    const pathname = window.location.pathname;
    const serverTimings = readNavigationServerTimings();
    const callback = (report: ShopifyWebVitalsReport) =>
      sendPerformanceReport(report, pathname, fetch, serverTimings);

    void shopify.webVitals.onReport(callback);
    return () => {
      void shopify.webVitals.onReport(null);
    };
  }, []);

  return null;
}
