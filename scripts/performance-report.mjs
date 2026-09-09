import { pathToFileURL } from "node:url";

import {
  d1ReportCommand,
  fetchD1Report,
  parseReportEnvironment,
  parseWranglerJson,
} from "./d1-report.mjs";

import {
  PERFORMANCE_MINIMUM_SAMPLES,
  PERFORMANCE_QUERY,
  PERFORMANCE_REGRESSION_INCREASE,
  PERFORMANCE_TIMING_QUERY,
  PERFORMANCE_WINDOW_DAYS,
  comparePerformanceVersions,
  parsePerformanceRows,
  parsePerformanceTimings,
} from "../app/reporting/performance.ts";

export const TIMING_QUERY = PERFORMANCE_TIMING_QUERY;
export const parseTimings = parsePerformanceTimings;
export const compareVersions = comparePerformanceVersions;

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
  return d1ReportCommand(environment, PERFORMANCE_QUERY);
}

export function parseWranglerResult(stdout) {
  const payload = parseWranglerJson(stdout);
  const result = payload?.[0];
  if (!result?.success || !Array.isArray(result.results)) {
    throw new Error("Wrangler non ha restituito il report prestazioni atteso.");
  }

  return parsePerformanceRows(result.results);
}

export function fetchReport(environment, options = {}) {
  return fetchD1Report(environment, PERFORMANCE_QUERY, parseWranglerResult, options);
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
        window_days: PERFORMANCE_WINDOW_DAYS,
        minimum_samples: PERFORMANCE_MINIMUM_SAMPLES,
        groups,
        comparison,
        comparison_policy: {
          minimum_samples_per_version: PERFORMANCE_MINIMUM_SAMPLES,
          minimum_relative_increase: 0.2,
          absolute_increase: PERFORMANCE_REGRESSION_INCREASE,
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
