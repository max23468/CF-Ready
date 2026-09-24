import { performanceReportKey } from "./hash.server";
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

// Il report parte con `sendBeacon` anche mentre l'iframe si chiude, quando il session token di App
// Bridge (valido un minuto e ottenuto in modo asincrono) non è più raggiungibile. Il documento
// autenticato riceve quindi una firma per il proprio store; CLS e INP arrivano anche ore dopo.
export const PERFORMANCE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_SEPARATOR = "~";

export async function createPerformanceToken(shopDomain: string, now = Date.now()) {
  const payload = `${shopDomain}${TOKEN_SEPARATOR}${now}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await performanceReportKey(),
    new TextEncoder().encode(payload),
  );
  return `${payload}${TOKEN_SEPARATOR}${toHex(new Uint8Array(signature))}`;
}

export async function verifyPerformanceToken(token: unknown, now = Date.now()) {
  if (typeof token !== "string" || token.length > 512) return null;
  const [shopDomain, issuedAt, signature, ...rest] = token.split(TOKEN_SEPARATOR);
  if (
    rest.length ||
    !shopDomain ||
    !/^\d{1,15}$/.test(issuedAt ?? "") ||
    !/^[0-9a-f]{64}$/.test(signature ?? "")
  ) {
    return null;
  }
  const age = now - Number(issuedAt);
  if (age < -60_000 || age > PERFORMANCE_TOKEN_TTL_MS) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await performanceReportKey(),
    fromHex(signature!),
    new TextEncoder().encode(`${shopDomain}${TOKEN_SEPARATOR}${issuedAt}`),
  );
  return valid ? shopDomain : null;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
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
