import { PERFORMANCE_SERVER_TIMING_NAMES } from "../performance-contract.ts";

export const PERFORMANCE_WINDOW_DAYS = 28;
export const PERFORMANCE_MINIMUM_SAMPLES = 100;
export const PERFORMANCE_THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1 } as const;
export const PERFORMANCE_REGRESSION_INCREASE = { LCP: 200, INP: 30, CLS: 0.02 } as const;

export type PerformanceMetric = keyof typeof PERFORMANCE_THRESHOLDS;
export type PerformanceGroup = {
  metric: PerformanceMetric;
  app_version: string;
  app_route: string;
  sample_count: number;
  p75: number;
  threshold: number;
  status: "insufficient_samples" | "pass" | "fail";
};
export type PerformanceTiming = {
  app_version: string;
  app_route: string;
  timing_name: string;
  sample_count: number;
  p75: number;
};

export const PERFORMANCE_QUERY = `
WITH recent AS (
  SELECT metric_name, metric_value, app_version, app_route
    FROM performance_samples
   WHERE datetime(observed_at) >= datetime('now', '-${PERFORMANCE_WINDOW_DAYS} days')
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
           PARTITION BY metric_name, app_version, app_route ORDER BY metric_value
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

export const PERFORMANCE_TIMING_QUERY = `
WITH timing_samples AS (
  SELECT app_version, app_route, timing.key AS timing_name,
    CAST(timing.value AS REAL) AS duration
  FROM performance_samples, json_each(COALESCE(server_timing_json, '{}')) timing
  WHERE datetime(observed_at) >= datetime('now', '-${PERFORMANCE_WINDOW_DAYS} days')
    AND metric_name = 'LCP'
    AND timing.key IN (${PERFORMANCE_SERVER_TIMING_NAMES.map((name) => `'${name}'`).join(",")})
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY app_version, app_route, timing_name ORDER BY duration
  ) AS rank,
  COUNT(*) OVER (
    PARTITION BY app_version, app_route, timing_name
  ) AS sample_count
  FROM timing_samples
)
SELECT app_version, app_route, timing_name, sample_count, duration AS p75
FROM ranked WHERE rank = CAST((3 * sample_count + 3) / 4 AS INTEGER);
`;

export function parsePerformanceRows(rows: unknown): PerformanceGroup[] {
  if (!Array.isArray(rows)) throw new Error("Righe del report prestazioni mancanti.");
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    const threshold = PERFORMANCE_THRESHOLDS[row.metric_name as PerformanceMetric];
    if (
      threshold === undefined ||
      typeof row.app_version !== "string" ||
      typeof row.app_route !== "string" ||
      !Number.isInteger(row.sample_count) ||
      (row.sample_count as number) < 1 ||
      typeof row.p75 !== "number" ||
      row.p75 < 0
    ) {
      throw new Error("Riga del report prestazioni non valida.");
    }
    return {
      metric: row.metric_name as PerformanceMetric,
      app_version: row.app_version,
      app_route: row.app_route,
      sample_count: row.sample_count as number,
      p75: row.p75,
      threshold,
      status:
        (row.sample_count as number) < PERFORMANCE_MINIMUM_SAMPLES
          ? "insufficient_samples"
          : row.p75 <= threshold
            ? "pass"
            : "fail",
    };
  });
}

export function parsePerformanceTimings(rows: unknown): PerformanceTiming[] {
  if (!Array.isArray(rows)) throw new Error("Durate server mancanti.");
  return rows.map((value) => {
    const row = value as Record<string, unknown>;
    if (
      typeof row.timing_name !== "string" ||
      !PERFORMANCE_SERVER_TIMING_NAMES.includes(
        row.timing_name as (typeof PERFORMANCE_SERVER_TIMING_NAMES)[number],
      ) ||
      typeof row.app_version !== "string" ||
      typeof row.app_route !== "string" ||
      !Number.isInteger(row.sample_count) ||
      (row.sample_count as number) < 1 ||
      typeof row.p75 !== "number" ||
      !Number.isFinite(row.p75) ||
      row.p75 < 0
    ) {
      throw new Error("Durata server non valida.");
    }
    return {
      app_version: row.app_version,
      app_route: row.app_route,
      timing_name: row.timing_name,
      sample_count: row.sample_count as number,
      p75: row.p75,
    };
  });
}

export function comparePerformanceVersions(
  groups: PerformanceGroup[],
  timings: PerformanceTiming[],
  previousVersion: string,
  currentVersion: string,
) {
  if (
    !previousVersion ||
    !currentVersion ||
    previousVersion === currentVersion ||
    [previousVersion, currentVersion].includes("all")
  ) {
    throw new Error("Scegli due versioni distinte.");
  }
  const comparisons = groups.flatMap((current) => {
    if (current.app_version !== currentVersion || current.app_route === "all") return [];
    const previous = groups.find(
      (group) =>
        group.app_version === previousVersion &&
        group.app_route === current.app_route &&
        group.metric === current.metric,
    );
    const enough =
      current.sample_count >= PERFORMANCE_MINIMUM_SAMPLES &&
      (previous?.sample_count ?? 0) >= PERFORMANCE_MINIMUM_SAMPLES;
    const delta = previous ? current.p75 - previous.p75 : null;
    const regression =
      enough &&
      delta !== null &&
      delta >= PERFORMANCE_REGRESSION_INCREASE[current.metric] &&
      delta >= previous!.p75 * 0.2;
    return [
      {
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
      },
    ];
  });
  return {
    previous_version: previousVersion,
    current_version: currentVersion,
    status: comparisons.length ? "compared" : "insufficient_samples",
    comparisons,
    alerts: comparisons.filter((comparison) => comparison.status === "regression"),
  };
}
