import type { PerformanceServerTimingName } from "./performance-contract";

export function createServerTiming() {
  const startedAt = performance.now();
  const entries: { name: PerformanceServerTimingName; durationMs: number }[] = [];

  const record = (name: PerformanceServerTimingName, durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    entries.push({ name, durationMs });
  };

  const measure = async <T>(name: PerformanceServerTimingName, operation: () => Promise<T>) => {
    const operationStartedAt = performance.now();
    try {
      return await operation();
    } finally {
      record(name, performance.now() - operationStartedAt);
    }
  };

  const header = () => {
    const completed = [
      ...entries,
      { name: "total" as const, durationMs: performance.now() - startedAt },
    ];
    return completed
      .map(({ name, durationMs }) => `${name};dur=${durationMs.toFixed(1)}`)
      .join(", ");
  };

  return { header, measure, record };
}
