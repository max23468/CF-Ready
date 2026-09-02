import { PERFORMANCE_ENDPOINT, PERFORMANCE_SERVER_TIMING_NAMES } from "./performance-contract";

const SERVER_TIMING_NAMES = new Set<string>(PERFORMANCE_SERVER_TIMING_NAMES);

export function normalizePerformanceRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") return "home";
  if (path === "/app/rules") return "rules";
  if (path === "/app/messages") return "messages";
  if (path === "/app/guide") return "guide";
  if (path === "/app/onboarding") return "onboarding";
  return "other";
}

export function readNavigationServerTimings(
  entries: readonly Pick<PerformanceServerTiming, "name" | "duration">[] = (
    performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
  )?.serverTiming ?? [],
) {
  return Object.fromEntries(
    entries.flatMap(({ name, duration }) =>
      SERVER_TIMING_NAMES.has(name) && Number.isFinite(duration) && duration >= 0
        ? [[name, Number(duration.toFixed(1))] as const]
        : [],
    ),
  );
}

export async function sendPerformanceReport(
  report: ShopifyWebVitalsReport,
  pathname: string,
  fetcher: typeof fetch = fetch,
  serverTimings = readNavigationServerTimings(),
) {
  try {
    await fetcher(PERFORMANCE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: normalizePerformanceRoute(pathname),
        serverTimings,
        metrics: report.metrics.map(({ id, name, value, country }) => ({
          id,
          name,
          value,
          country,
        })),
      }),
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {
    // La telemetria è best effort: non deve alterare l'interazione o mostrare errori al merchant.
  }
}
