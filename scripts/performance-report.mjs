import { pathToFileURL } from "node:url";

import {
  d1ReportCommand,
  fetchD1Report,
  parseReportEnvironment,
  parseWranglerJson,
} from "./d1-report.mjs";

import { PERFORMANCE_SERVER_TIMING_NAMES } from "../app/performance-contract.ts";

const WINDOW_DAYS = 28;
const MINIMUM_SAMPLES = 100;
const THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1 };
const REGRESSION_INCREASE = { LCP: 200, INP: 30, CLS: 0.02 };

const QUERY = `
WITH recent AS (
  SELECT metric_name, metric_value, app_version, app_route
    FROM performance_samples
   WHERE observed_at >= datetime('now', '-${WINDOW_DAYS} days')
     AND metric_name IN ('LCP', 'INP', 'CLS')
),
scoped AS (
  SELECT metric_name, metric_value, 'all' AS app_version, 'all' AS app_route FROM recent
  UNION ALL
  SELECT metric_name, metric_value, app_version, 'all' AS app_route FROM recent
  UNION ALL
  SELECT metric_name, metric_value, app_version, app_route FROM recent
),
ranked AS (
  SELECT metric_name, app_version, app_route, metric_value,
         ROW_NUMBER() OVER (
           PARTITION BY metric_name, app_version, app_route
           ORDER BY metric_value
         ) AS metric_rank,
         COUNT(*) OVER (
           PARTITION BY metric_name, app_version, app_route
         ) AS sample_count
    FROM scoped
)
SELECT metric_name, app_version, app_route, sample_count, metric_value AS p75
  FROM ranked
 WHERE metric_rank = CAST((3 * sample_count + 3) / 4 AS INTEGER)
 ORDER BY app_version, app_route, metric_name;
`;

// Le durate restano aggregate e allowlistate; nessun contenuto merchant esce dal DB.
export const TIMING_QUERY = `
WITH timing_samples AS (
  SELECT app_version, app_route, timing.key AS timing_name,
    CAST(timing.value AS REAL) AS duration
  FROM performance_samples, json_each(COALESCE(server_timing_json, '{}')) timing
  WHERE observed_at >= datetime('now', '-28 days')
    AND metric_name = 'LCP'
    AND timing.key IN (${PERFORMANCE_SERVER_TIMING_NAMES.map((name) => `'${name}'`).join(",")})
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY app_version, app_route, timing_name ORDER BY duration) AS rank,
    COUNT(*) OVER (PARTITION BY app_version, app_route, timing_name) AS sample_count
  FROM timing_samples
)
SELECT app_version, app_route, timing_name, sample_count, duration AS p75
FROM ranked WHERE rank = CAST((3 * sample_count + 3) / 4 AS INTEGER);
`;

export function parseTimings(rows) {
  if (!Array.isArray(rows)) throw new Error("Durate server mancanti.");
  return rows.map((row) => {
    if (
      !PERFORMANCE_SERVER_TIMING_NAMES.includes(row.timing_name) ||
      typeof row.app_version !== "string" ||
      typeof row.app_route !== "string" ||
      !Number.isInteger(row.sample_count) ||
      row.sample_count < 1 ||
      !Number.isFinite(row.p75) ||
      row.p75 < 0
    )
      throw new Error("Durata server non valida.");
    return {
      app_version: row.app_version,
      app_route: row.app_route,
      timing_name: row.timing_name,
      sample_count: row.sample_count,
      p75: row.p75,
    };
  });
}

export function compareVersions(groups, timings, previousVersion, currentVersion) {
  if (
    !previousVersion ||
    !currentVersion ||
    previousVersion === currentVersion ||
    [previousVersion, currentVersion].includes("all")
  )
    throw new Error("Scegli due versioni distinte.");
  const comparisons = groups
    .filter((group) => group.app_version === currentVersion && group.app_route !== "all")
    .map((current) => {
      const previous = groups.find(
        (group) =>
          group.app_version === previousVersion &&
          group.app_route === current.app_route &&
          group.metric === current.metric,
      );
      const enough =
        current.sample_count >= MINIMUM_SAMPLES && previous?.sample_count >= MINIMUM_SAMPLES;
      const delta = previous ? current.p75 - previous.p75 : null;
      const regression =
        enough && delta >= REGRESSION_INCREASE[current.metric] && delta >= previous.p75 * 0.2;
      return {
        route: current.app_route,
        metric: current.metric,
        previous: previous ?? null,
        current,
        delta,
        status: !enough ? "insufficient_samples" : regression ? "regression" : "stable",
        server_timings: timings.filter(
          (timing) =>
            timing.app_route === current.app_route &&
            [previousVersion, currentVersion].includes(timing.app_version),
        ),
      };
    });
  return {
    previous_version: previousVersion,
    current_version: currentVersion,
    status: comparisons.length ? "compared" : "insufficient_samples",
    comparisons,
    alerts: comparisons.filter((comparison) => comparison.status === "regression"),
  };
}

export function parseOptions(args) {
  if (args.length === 1) return { environment: parseEnvironment(args), versions: null };
  if (
    args.length !== 4 ||
    args[1] !== "--compare" ||
    !args[2] ||
    !args[3] ||
    args[2] === args[3] ||
    args.slice(2).includes("all")
  )
    throw new Error(
      "Uso: report:performance -- development|production [--compare precedente corrente]",
    );
  return { environment: parseEnvironment(args.slice(0, 1)), versions: args.slice(2) };
}

export function parseEnvironment(args) {
  return parseReportEnvironment(args, "Uso: npm run report:performance -- development|production");
}

export function commandFor(environment) {
  return d1ReportCommand(environment, QUERY);
}

export function parseWranglerResult(stdout) {
  const payload = parseWranglerJson(stdout);
  const result = payload?.[0];
  if (!result?.success || !Array.isArray(result.results)) {
    throw new Error("Wrangler non ha restituito il report prestazioni atteso.");
  }

  return result.results.map((row) => {
    const threshold = THRESHOLDS[row.metric_name];
    if (
      threshold === undefined ||
      typeof row.app_version !== "string" ||
      typeof row.app_route !== "string" ||
      !Number.isInteger(row.sample_count) ||
      row.sample_count < 1 ||
      typeof row.p75 !== "number" ||
      row.p75 < 0
    ) {
      throw new Error("Riga del report prestazioni non valida.");
    }
    return {
      metric: row.metric_name,
      app_version: row.app_version,
      app_route: row.app_route,
      sample_count: row.sample_count,
      p75: row.p75,
      threshold,
      status:
        row.sample_count < MINIMUM_SAMPLES
          ? "insufficient_samples"
          : row.p75 <= threshold
            ? "pass"
            : "fail",
    };
  });
}

export function fetchReport(environment, options = {}) {
  return fetchD1Report(environment, QUERY, parseWranglerResult, options);
}

function main() {
  const { environment, versions } = parseOptions(process.argv.slice(2));
  const groups = fetchReport(environment);
  const timings = versions
    ? fetchD1Report(environment, TIMING_QUERY, (stdout) => {
        const result = parseWranglerJson(stdout)?.[0];
        if (!result?.success) throw new Error("Durate server mancanti.");
        return parseTimings(result.results);
      })
    : [];
  const comparison = versions ? compareVersions(groups, timings, ...versions) : null;
  process.stdout.write(
    `${JSON.stringify(
      {
        environment,
        window_days: WINDOW_DAYS,
        minimum_samples: MINIMUM_SAMPLES,
        groups,
        comparison,
        comparison_policy: {
          minimum_samples_per_version: MINIMUM_SAMPLES,
          minimum_relative_increase: 0.2,
          absolute_increase: REGRESSION_INCREASE,
          note: "Descriptive comparison, not statistical significance. Server timings are LCP-document aggregates, not causal attribution. Alerts are report output only.",
        },
      },
      null,
      2,
    )}\n`,
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
