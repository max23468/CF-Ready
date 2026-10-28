import { pathToFileURL } from "node:url";

import {
  d1ReportCommand,
  fetchD1Report,
  parseReportEnvironment,
  parseD1Json,
} from "./d1-report.mjs";

import {
  PERFORMANCE_LAYOUT_SHIFT_QUERY,
  PERFORMANCE_MINIMUM_SAMPLES,
  PERFORMANCE_QUERY,
  PERFORMANCE_REGRESSION_INCREASE,
  PERFORMANCE_TIMING_QUERY,
  PERFORMANCE_WINDOW_DAYS,
  comparePerformanceVersions,
  parsePerformanceLayoutShifts,
  parsePerformanceRows,
  parsePerformanceTimings,
} from "../app/reporting/performance.ts";

export const TIMING_QUERY = PERFORMANCE_TIMING_QUERY;
export const LAYOUT_SHIFT_QUERY = PERFORMANCE_LAYOUT_SHIFT_QUERY;
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

export function parseD1Result(stdout) {
  const payload = parseD1Json(stdout);
  const result = payload?.[0];
  if (!result?.success || !Array.isArray(result.results)) {
    throw new Error("cf non ha restituito il report prestazioni atteso.");
  }

  return parsePerformanceRows(result.results);
}

export function fetchReport(environment, options = {}) {
  return fetchD1Report(environment, PERFORMANCE_QUERY, parseD1Result, options);
}

export function parseLayoutShiftResult(stdout) {
  const result = parseD1Json(stdout)?.[0];
  if (!result?.success) throw new Error("Aree CLS mancanti.");
  return parsePerformanceLayoutShifts(result.results);
}

export function fetchLayoutShifts(environment, options = {}) {
  return fetchD1Report(environment, LAYOUT_SHIFT_QUERY, parseLayoutShiftResult, options);
}

function main() {
  const { environment, versions } = parseOptions(process.argv.slice(2));
  const groups = fetchReport(environment);
  const layoutShiftSources = fetchLayoutShifts(environment);
  const timings = versions
    ? fetchD1Report(environment, TIMING_QUERY, (stdout) => {
        const result = parseD1Json(stdout)?.[0];
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
        layout_shift_sources: layoutShiftSources,
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
