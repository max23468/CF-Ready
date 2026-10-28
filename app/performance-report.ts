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
// D-199: un osservatore `layout-shift` tiene l'area (`data-layout-region`, anche oltre lo shadow
// DOM di Polaris) dello spostamento più ampio senza input recente; il server la tiene solo se è
// fra quelle ammesse e solo sui campioni CLS.
const REPORTER_SOURCE = `function (config) {
  var largestShift = { value: 0, source: null };
  function regionOf(node) {
    while (node) {
      if (node.nodeType === 1 && node.hasAttribute("data-layout-region")) {
        return node.getAttribute("data-layout-region");
      }
      node = node.parentNode || node.host;
    }
    return null;
  }
  function shiftSource(source) {
    var rect = source.currentRect && source.currentRect.width ? source.currentRect : source.previousRect;
    var point =
      rect && rect.width && rect.height
        ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        : null;
    return regionOf(source.node) || regionOf(point) || "page";
  }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.hadRecentInput || entry.value <= largestShift.value || !(entry.sources || []).length) return;
        largestShift = { value: entry.value, source: shiftSource(entry.sources[0]) };
      });
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {}
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
      layoutShiftSource: largestShift.source,
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
