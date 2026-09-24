import { PERFORMANCE_ENDPOINT, type PerformanceRoute } from "./performance-contract";

export function normalizePerformanceRoute(pathname: string): PerformanceRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") return "home";
  if (path === "/app/rules") return "rules";
  if (path === "/app/messages") return "messages";
  if (path === "/app/guide") return "guide";
  if (path === "/app/onboarding") return "onboarding";
  return "other";
}

// Sorgente letterale, non una funzione serializzata: il bundler non può inserirvi helper esterni.
// Gira durante il parsing del documento, prima dell'idratazione: App Bridge consegna i report
// soltanto ai callback già registrati, e l'Admin può chiudere l'iframe prima che React sia pronto.
// `sendBeacon` sopravvive alla chiusura; l'allowlist di nomi e valori resta al server.
// Nessun ripiego successivo: dentro `s-app-window` App Bridge non prepara `webVitals` e poi adotta
// lo `shopify` della finestra principale, il cui callback verrebbe sostituito da quello del modale.
const REPORTER_SOURCE = `function (config) {
  function send(report) {
    var serverTimings = {};
    var navigation = performance.getEntriesByType("navigation")[0];
    ((navigation && navigation.serverTiming) || []).forEach(function (entry) {
      if (isFinite(entry.duration) && entry.duration >= 0) {
        serverTimings[entry.name] = Number(((serverTimings[entry.name] || 0) + entry.duration).toFixed(1));
      }
    });
    var body = JSON.stringify({
      route: config.route,
      token: config.token,
      serverTimings: serverTimings,
      metrics: ((report && report.metrics) || []).map(function (metric) {
        return { id: metric.id, name: metric.name, value: metric.value, country: metric.country };
      }),
    });
    try {
      if (navigator.sendBeacon(config.endpoint, new Blob([body], { type: "application/json" }))) return;
    } catch (error) {}
    fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
    }).catch(function () {});
  }
  if (typeof shopify !== "undefined" && shopify.webVitals) shopify.webVitals.onReport(send);
}`;

export function performanceReporterScript(config: { route: PerformanceRoute; token: string }) {
  const json = JSON.stringify({ ...config, endpoint: PERFORMANCE_ENDPOINT }).replace(
    /</g,
    "\\u003c",
  );
  return `(${REPORTER_SOURCE})(${json});`;
}
