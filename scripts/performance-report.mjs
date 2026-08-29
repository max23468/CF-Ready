import { pathToFileURL } from "node:url";

import {
  d1ReportCommand,
  fetchD1Report,
  parseReportEnvironment,
  parseWranglerJson,
} from "./d1-report.mjs";

const WINDOW_DAYS = 28;
const MINIMUM_SAMPLES = 100;
const THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1 };

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
  const environment = parseEnvironment(process.argv.slice(2));
  const groups = fetchReport(environment);
  process.stdout.write(
    `${JSON.stringify(
      {
        environment,
        window_days: WINDOW_DAYS,
        minimum_samples: MINIMUM_SAMPLES,
        groups,
      },
      null,
      2,
    )}\n`,
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
