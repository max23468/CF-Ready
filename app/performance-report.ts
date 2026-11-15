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
// Gli osservatori `event` e `long-animation-frame` conservano le dieci interazioni più lente.
// App Bridge non espone timestamp o interactionId: i dettagli partono solo se la durata INP
// corrisponde a una sola interazione locale. Un pareggio o una durata non osservata li omette.
// Le metriche descrivono la visita al documento, anche dopo navigazioni client: la rotta resta
// quella iniziale, insieme ai suoi `Server-Timing` (D-229), senza inventare misure per pagina.
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
  var interactions = [];
  var droppedDuration = -1;
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
  function frameSource(interaction) {
    var longest = null;
    var longestDuration = 0;
    recentFrames.forEach(function (frame) {
      if (frame.startTime > interaction.nextPaint || frame.startTime + frame.duration < interaction.startTime) return;
      (frame.scripts || []).forEach(function (script) {
        var duration = Math.min(script.executionStart + script.duration, interaction.nextPaint) -
          Math.max(script.executionStart, interaction.startTime);
        if (duration > longestDuration) {
          longest = script;
          longestDuration = duration;
        }
      });
    });
    return longest ? scriptSource(longest.sourceURL) : null;
  }
  function observeEvents(entries) {
    entries.forEach(function (entry) {
      if (!entry.interactionId) return;
      var interaction = interactions.find(function (item) { return item.id === entry.interactionId; });
      var nextPaint = entry.startTime + entry.duration;
      if (!interaction) {
        interaction = { id: entry.interactionId, duration: -1 };
        interactions.push(interaction);
      }
      // Più eventi dello stesso gesto possono arrivare allo stesso paint. Le fasi comprendono
      // tutti i loro handler, non soltanto quello dell'evento con la durata maggiore.
      var samePaint = Math.abs(interaction.nextPaint - nextPaint) <= 8;
      var processingStart = samePaint ? Math.min(interaction.processingStart, entry.processingStart) : entry.processingStart;
      var processingEnd = samePaint ? Math.max(interaction.processingEnd, entry.processingEnd) : entry.processingEnd;
      if (entry.duration > interaction.duration) {
        interaction.duration = entry.duration;
        interaction.startTime = entry.startTime;
        interaction.nextPaint = nextPaint;
        interaction.processingStart = processingStart;
        interaction.processingEnd = processingEnd;
      } else if (samePaint) {
        interaction.processingStart = processingStart;
        interaction.processingEnd = processingEnd;
      }
      interactions.sort(function (a, b) { return b.duration - a.duration; });
      if (interactions.length > 10) {
        droppedDuration = Math.max(droppedDuration, interactions.pop().duration);
      }
    });
  }
  var eventObserver;
  var frameObserver;
  try {
    if (entryTypes.indexOf("event") >= 0) {
      eventObserver = new PerformanceObserver(function (list) { observeEvents(list.getEntries()); });
      eventObserver.observe({ type: "event", durationThreshold: 40, buffered: true });
    }
    if (entryTypes.indexOf("long-animation-frame") >= 0) {
      frameObserver = new PerformanceObserver(function (list) { observeFrames(list.getEntries()); });
      frameObserver.observe({ type: "long-animation-frame", buffered: true });
    }
  } catch (error) {}
  function observeFrames(entries) {
    entries.forEach(function (frame) {
      recentFrames.push(frame);
      if (recentFrames.length > 50) recentFrames.shift();
    });
  }
  function sample(metric) {
    var result = { id: metric.id, name: metric.name, value: metric.value, country: metric.country };
    if (metric.name === "INP") {
      if (eventObserver && eventObserver.takeRecords) observeEvents(eventObserver.takeRecords());
      if (frameObserver && frameObserver.takeRecords) observeFrames(frameObserver.takeRecords());
      var matching = interactions.filter(function (item) { return item.duration === metric.value; });
      // Anche un pareggio espulso dal buffer rende ambigua la corrispondenza.
      if (matching.length !== 1 || metric.value <= droppedDuration) return result;
      var interaction = matching[0];
      var start = Math.min(interaction.nextPaint, Math.max(interaction.startTime, interaction.processingStart));
      var end = Math.min(Math.max(start, interaction.processingEnd), interaction.nextPaint);
      result.inputDelay = Math.round(start - interaction.startTime);
      result.processingDuration = Math.round(end - start);
      result.presentationDelay = Math.max(0, Math.round(interaction.nextPaint - end));
      var source = frameSource(interaction);
      if (source) result.scriptSource = source;
    }
    return result;
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
    var route = config.route;
    var metrics = ((report && report.metrics) || []).map(sample);
    if (sendLater(route, metrics)) return;
    sendNow(payload(route, metrics));
  }
  if (typeof shopify !== "undefined" && shopify.webVitals) shopify.webVitals.onReport(send);
}`;

export function performanceReporterScript(config: { route: PerformanceRoute; token: string }) {
  const json = JSON.stringify({
    ...config,
    endpoint: PERFORMANCE_ENDPOINT,
  }).replace(/</g, "\\u003c");
  return `(${REPORTER_SOURCE})(${json});`;
}
