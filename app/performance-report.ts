import { APP_ROUTES } from "./app-routes";
import { PERFORMANCE_ENDPOINT, type PerformanceRoute } from "./performance-contract";

export function normalizePerformanceRoute(pathname: string): PerformanceRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  const names = Object.keys(APP_ROUTES) as (keyof typeof APP_ROUTES)[];
  return names.find((name) => APP_ROUTES[name] === path) ?? "other";
}

// Sorgente letterale, non una funzione serializzata: il bundler non può inserirvi helper esterni.
// Gira durante il parsing del documento, prima dell'idratazione: App Bridge consegna i report
// soltanto ai callback già registrati, e l'Admin può chiudere l'iframe prima che React sia pronto.
// `fetchLater` e `sendBeacon` sopravvivono alla chiusura; l'allowlist di nomi e valori resta al
// server.
// Nessun ripiego successivo: dentro `s-app-window` App Bridge non prepara `webVitals` e poi adotta
// lo `shopify` della finestra principale, il cui callback verrebbe sostituito da quello del modale.
// D-199: un osservatore `layout-shift` tiene l'area (`data-layout-region`, anche oltre lo shadow
// DOM di Polaris) dello spostamento più ampio senza input recente; il server la tiene solo se è
// fra quelle ammesse e solo sui campioni CLS.
// Allo stesso modo, osservatori `event` e `long-animation-frame` tengono i sottotempi
// dell'interazione peggiore e il file (origine e percorso, senza query) dello script più lungo
// del frame che la contiene: partono solo con il campione INP.
// La rotta è quella mostrata quando arriva il report: CLS e INP arrivano anche dopo navigazioni
// client. Le durate `Server-Timing` descrivono il documento iniziale e partono solo con la sua rotta.
// Dove esiste `fetchLater`, i report della stessa rotta arrivati entro `BATCH_WINDOW_MS` partono in
// una sola richiesta, anche se l'iframe si chiude prima; il server ignora un id già registrato.
// Altrove, o se `fetchLater` rifiuta la richiesta, ogni report parte subito come prima.
const REPORTER_SOURCE = `function (config) {
  var BATCH_WINDOW_MS = 10000;
  var MAX_BATCH_METRICS = 10;
  var batch = null;
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
  var entryTypes = (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes) || [];
  var worstInteraction = null;
  var recentFrames = [];
  function scriptSource(url) {
    try {
      var parsed = new URL(url);
      var source = parsed.origin + parsed.pathname;
      return /^https?:$/.test(parsed.protocol) && source.length <= 200 ? source : null;
    } catch (error) {
      return null;
    }
  }
  function frameSource(frame, interaction) {
    if (frame.startTime > interaction.processingStart || frame.startTime + frame.duration < interaction.processingStart) return undefined;
    var longest = null;
    (frame.scripts || []).forEach(function (script) {
      if (!longest || script.duration > longest.duration) longest = script;
    });
    return longest ? scriptSource(longest.sourceURL) : null;
  }
  function attachFrame(interaction) {
    for (var index = 0; index < recentFrames.length && interaction.source === undefined; index += 1) {
      interaction.source = frameSource(recentFrames[index], interaction);
    }
  }
  // Interazione peggiore della visita e script più lungo del long animation frame che la contiene.
  try {
    if (entryTypes.indexOf("event") >= 0) {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.interactionId || (worstInteraction && entry.duration <= worstInteraction.duration)) return;
          worstInteraction = {
            duration: entry.duration,
            processingStart: entry.processingStart,
            inputDelay: Math.max(0, Math.round(entry.processingStart - entry.startTime)),
            processingDuration: Math.max(0, Math.round(entry.processingEnd - entry.processingStart)),
            presentationDelay: Math.max(0, Math.round(entry.startTime + entry.duration - entry.processingEnd)),
            source: undefined,
          };
          attachFrame(worstInteraction);
        });
      }).observe({ type: "event", durationThreshold: 40, buffered: true });
    }
    if (entryTypes.indexOf("long-animation-frame") >= 0) {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (frame) {
          recentFrames.push(frame);
          if (recentFrames.length > 50) recentFrames.shift();
          if (worstInteraction && worstInteraction.source === undefined) attachFrame(worstInteraction);
        });
      }).observe({ type: "long-animation-frame", buffered: true });
    }
  } catch (error) {}
  function sample(metric) {
    var result = { id: metric.id, name: metric.name, value: metric.value, country: metric.country };
    if (metric.name === "INP" && worstInteraction) {
      result.inputDelay = worstInteraction.inputDelay;
      result.processingDuration = worstInteraction.processingDuration;
      result.presentationDelay = worstInteraction.presentationDelay;
      if (worstInteraction.source) result.scriptSource = worstInteraction.source;
    }
    return result;
  }
  function currentRoute() {
    var path = location.pathname.replace(/\\/+$/, "") || "/";
    return Object.prototype.hasOwnProperty.call(config.routes, path) ? config.routes[path] : "other";
  }
  function serverTimings(route) {
    var timings = {};
    if (route !== config.route) return timings;
    var navigation = performance.getEntriesByType("navigation")[0];
    ((navigation && navigation.serverTiming) || []).forEach(function (entry) {
      if (isFinite(entry.duration) && entry.duration >= 0) {
        timings[entry.name] = Number(((timings[entry.name] || 0) + entry.duration).toFixed(1));
      }
    });
    return timings;
  }
  function payload(route, metrics) {
    return JSON.stringify({
      route: route,
      token: config.token,
      serverTimings: serverTimings(route),
      layoutShiftSource: largestShift.source,
      metrics: metrics,
    });
  }
  function sendNow(body) {
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
      priority: "low",
    }).catch(function () {});
  }
  function sendLater(route, metrics) {
    if (typeof fetchLater !== "function" || typeof AbortController !== "function") return false;
    // Un lotto già partito, di un'altra rotta o pieno resta com'è; i nuovi report ne aprono un altro.
    if (
      !batch ||
      batch.route !== route ||
      (batch.result && batch.result.activated) ||
      batch.metrics.length + metrics.length > MAX_BATCH_METRICS
    ) {
      batch = { route: route, metrics: [], controller: null, result: null };
    }
    metrics.forEach(function (metric) {
      batch.metrics = batch.metrics.filter(function (queued) {
        return queued.id !== metric.id || queued.name !== metric.name;
      });
      batch.metrics.push(metric);
    });
    if (batch.controller) batch.controller.abort();
    var controller = new AbortController();
    try {
      batch.result = fetchLater(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(route, batch.metrics),
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        activateAfter: BATCH_WINDOW_MS,
      });
      batch.controller = controller;
      return true;
    } catch (error) {
      // La richiesta precedente del lotto è già annullata: parte tutto subito.
      sendNow(payload(route, batch.metrics));
      batch = null;
      return true;
    }
  }
  function send(report) {
    var route = currentRoute();
    var metrics = ((report && report.metrics) || []).map(sample);
    if (sendLater(route, metrics)) return;
    sendNow(payload(route, metrics));
  }
  if (typeof shopify !== "undefined" && shopify.webVitals) shopify.webVitals.onReport(send);
}`;

// Stessa corrispondenza di `normalizePerformanceRoute`, letta dallo script inline.
const ROUTES_BY_PATH = Object.fromEntries(
  Object.entries(APP_ROUTES).map(([name, path]) => [path, name]),
) as Record<string, PerformanceRoute>;

export function performanceReporterScript(config: { route: PerformanceRoute; token: string }) {
  const json = JSON.stringify({
    ...config,
    endpoint: PERFORMANCE_ENDPOINT,
    routes: ROUTES_BY_PATH,
  }).replace(/</g, "\\u003c");
  return `(${REPORTER_SOURCE})(${json});`;
}
