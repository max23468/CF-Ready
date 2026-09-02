import {
  PERFORMANCE_METRIC_NAMES,
  PERFORMANCE_ROUTES,
  PERFORMANCE_SERVER_TIMING_NAMES,
  type PerformanceMetricName,
  type PerformanceRoute,
  type PerformanceServerTimingName,
} from "./performance-contract";

export type PerformanceSample = {
  id: string;
  name: PerformanceMetricName;
  value: number;
  countryCode: string | null;
};

export type PerformanceReport = {
  route: PerformanceRoute;
  metrics: PerformanceSample[];
  serverTimings: Partial<Record<PerformanceServerTimingName, number>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizePerformanceReport(value: unknown): PerformanceReport | null {
  if (!isRecord(value) || !Array.isArray(value.metrics) || value.metrics.length > 10) return null;
  const route = PERFORMANCE_ROUTES.includes(value.route as PerformanceRoute)
    ? (value.route as PerformanceRoute)
    : "other";
  const rawServerTimings = value.serverTimings;
  const serverTimings = isRecord(rawServerTimings)
    ? Object.fromEntries(
        PERFORMANCE_SERVER_TIMING_NAMES.flatMap((name) => {
          const duration = rawServerTimings[name];
          return typeof duration === "number" &&
            Number.isFinite(duration) &&
            duration >= 0 &&
            duration <= 600_000
            ? [[name, duration] as const]
            : [];
        }),
      )
    : {};
  const metrics = value.metrics.flatMap((metric): PerformanceSample[] => {
    if (!isRecord(metric)) return [];
    const name = metric.name as PerformanceMetricName;
    const id = typeof metric.id === "string" ? metric.id : "";
    const value = metric.value;
    if (
      !PERFORMANCE_METRIC_NAMES.includes(name) ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(id) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 600_000
    ) {
      return [];
    }
    const countryCode =
      typeof metric.country === "string" && /^[A-Z]{2}$/.test(metric.country)
        ? metric.country
        : null;
    return [{ id, name, value, countryCode }];
  });

  return metrics.length ? { route, metrics, serverTimings } : null;
}

export async function recordPerformanceReport(
  db: D1Database,
  shopDomain: string,
  appVersion: string,
  report: PerformanceReport,
) {
  const observedAt = new Date().toISOString();
  const serverTimingJson = Object.keys(report.serverTimings).length
    ? JSON.stringify(report.serverTimings)
    : null;
  const results = await db.batch(
    report.metrics.map((metric) =>
      db
        .prepare(
          `INSERT INTO performance_samples (
             shop_id, metric_id, metric_name, metric_value, country_code,
             app_version, app_route, server_timing_json, observed_at
           )
           SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE shop_domain = ?
           ON CONFLICT(shop_id, metric_id, metric_name) DO NOTHING`,
        )
        .bind(
          metric.id,
          metric.name,
          metric.value,
          metric.countryCode,
          appVersion,
          report.route,
          serverTimingJson,
          observedAt,
          shopDomain,
        ),
    ),
  );
  return results.reduce((total, result) => total + result.meta.changes, 0);
}
