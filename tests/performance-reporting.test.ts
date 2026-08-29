import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { createAppContext } from "../app/context.server";
import {
  normalizePerformanceRoute,
  readNavigationServerTimings,
  sendPerformanceReport,
} from "../app/performance-report";
import { normalizePerformanceReport } from "../app/performance.server";
import { insertShop } from "./support/lifecycle";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

beforeEach(() => mocks.authenticate.mockReset());

test("il client invia soltanto campi tecnici allowlistati e normalizza la route", async () => {
  let captured: { url: RequestInfo | URL; init?: RequestInit } | undefined;
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured = { url, init };
    return new Response(null, { status: 204 });
  });
  await sendPerformanceReport(
    {
      metrics: [
        {
          id: "v4-1",
          name: "INP",
          value: 942,
          country: "IT",
          attribution: { target: "testo-riservato" },
        } as ShopifyWebVitalsMetric,
      ],
    },
    "/app/messages/",
    fetcher as typeof fetch,
    readNavigationServerTimings([
      { name: "auth", duration: 42.26 },
      { name: "merchant-secret", duration: 999 },
    ]),
  );

  expect(normalizePerformanceRoute("/app")).toBe("home");
  expect(normalizePerformanceRoute("/app/rules/")).toBe("rules");
  expect(normalizePerformanceRoute("/app/non-prevista")).toBe("other");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(captured?.url).toBe("/app/performance");
  expect(captured?.init).toMatchObject({ method: "POST", keepalive: true, cache: "no-store" });
  expect(JSON.parse(String(captured?.init?.body))).toEqual({
    route: "messages",
    serverTimings: { auth: 42.3 },
    metrics: [{ id: "v4-1", name: "INP", value: 942, country: "IT" }],
  });
});

test("il server scarta metriche e campi non ammessi", () => {
  expect(
    normalizePerformanceReport({
      route: "/app/messages?testo=riservato",
      serverTimings: { total: 2200, riservato: 99 },
      metrics: [
        { id: "v4-1", name: "INP", value: 942, country: "it", target: "riservato" },
        { id: "v4-2", name: "FID", value: 12, country: "IT" },
      ],
    }),
  ).toEqual({
    route: "other",
    serverTimings: { total: 2200 },
    metrics: [{ id: "v4-1", name: "INP", value: 942, countryCode: null }],
  });
  expect(normalizePerformanceReport({ route: "home", metrics: [] })).toBeNull();
});

test("la route autenticata registra versione e campioni idempotenti senza payload merchant", async () => {
  const shop = await insertShop("performance.example.myshopify.com");
  mocks.authenticate.mockResolvedValue({ admin: {}, session: { shop } });
  const { action } = await import("../app/routes/app.performance");
  const payload = {
    route: "messages",
    serverTimings: { auth: 48, shopify_snapshot: 2090, total: 2150 },
    metrics: [
      { id: "v4-lcp-1", name: "LCP", value: 3273, country: "IT", target: "riservato" },
      { id: "v4-inp-1", name: "INP", value: 942, country: "IT" },
    ],
  };
  const submit = () =>
    action({
      request: new Request("https://example.test/app/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      context: createAppContext(env.DB),
      params: {},
    } as never);

  expect((await submit()).status).toBe(204);
  expect((await submit()).status).toBe(204);

  const { results } = await env.DB.prepare(
    `SELECT metric_id, metric_name, metric_value, country_code, app_version, app_route,
            server_timing_json
       FROM performance_samples
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
      ORDER BY metric_name`,
  )
    .bind(shop)
    .all<Record<string, unknown>>();
  expect(results).toEqual([
    {
      metric_id: "v4-inp-1",
      metric_name: "INP",
      metric_value: 942,
      country_code: "IT",
      app_version: "1.0.8",
      app_route: "messages",
      server_timing_json: '{"auth":48,"shopify_snapshot":2090,"total":2150}',
    },
    {
      metric_id: "v4-lcp-1",
      metric_name: "LCP",
      metric_value: 3273,
      country_code: "IT",
      app_version: "1.0.8",
      app_route: "messages",
      server_timing_json: '{"auth":48,"shopify_snapshot":2090,"total":2150}',
    },
  ]);
  expect(mocks.authenticate).toHaveBeenCalledTimes(2);
});

test("la route rifiuta body non JSON o sovradimensionati prima dell'autenticazione", async () => {
  const { action } = await import("../app/routes/app.performance");
  const context = createAppContext(env.DB);
  const unsupported = await action({
    request: new Request("https://example.test/app/performance", {
      method: "POST",
      body: "metriche",
    }),
    context,
    params: {},
  } as never);
  const oversized = await action({
    request: new Request("https://example.test/app/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: [], padding: "x".repeat(17_000) }),
    }),
    context,
    params: {},
  } as never);

  expect(unsupported.status).toBe(415);
  expect(oversized.status).toBe(413);
  expect(mocks.authenticate).not.toHaveBeenCalled();
});

test("la route interrompe un body JSON chunked appena supera il limite", async () => {
  const { action } = await import("../app/routes/app.performance");
  let chunksRead = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksRead += 1;
      controller.enqueue(new Uint8Array(8_192));
      if (chunksRead === 10) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await action({
    request: new Request("https://example.test/app/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
    }),
    context: createAppContext(env.DB),
    params: {},
  } as never);

  expect(response.status).toBe(413);
  expect(chunksRead).toBe(3);
  expect(cancelled).toBe(true);
  expect(mocks.authenticate).not.toHaveBeenCalled();
});
