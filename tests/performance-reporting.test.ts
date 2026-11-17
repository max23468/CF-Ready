import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";

import { createAppContext } from "../app/context.server";
import { APP_VERSION } from "../app/env.server";
import { normalizePerformanceRoute, performanceReporterScript } from "../app/performance-report";
import {
  createPerformanceToken,
  normalizePerformanceReport,
  PERFORMANCE_TOKEN_TTL_MS,
  verifyPerformanceToken,
} from "../app/performance.server";
import { createServerTiming } from "../app/server-timing.server";
import { insertShop } from "./support/lifecycle";

test("lo script inline porta route, firma ed endpoint senza poter chiudere il tag", () => {
  const script = performanceReporterScript({ route: "messages", token: "negozio~1~</script>" });

  expect(normalizePerformanceRoute("/app")).toBe("home");
  expect(normalizePerformanceRoute("/app/rules/")).toBe("rules");
  expect(normalizePerformanceRoute("/app/guide")).toBe("guide");
  expect(normalizePerformanceRoute("/app/onboarding")).toBe("onboarding");
  expect(normalizePerformanceRoute("////")).toBe("other");
  expect(normalizePerformanceRoute("/app/rules.data")).toBe("other");
  expect(script).not.toContain("</script>");
  expect(script).toContain(
    '({"route":"messages","token":"negozio~1~\\u003c/script>","endpoint":"/performance"});',
  );
});

test("la firma del report vale per un solo store e scade dopo un giorno", async () => {
  const now = Date.parse("2026-09-24T10:00:00.000Z");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(now);
    const token = await createPerformanceToken("firma-example.myshopify.com");
    const [shop, issuedAt, signature] = token.split("~");

    expect(issuedAt).toBe(String(now));
    expect(await verifyPerformanceToken(token)).toBe("firma-example.myshopify.com");
    vi.setSystemTime(now + PERFORMANCE_TOKEN_TTL_MS);
    expect(await verifyPerformanceToken(token)).toBe("firma-example.myshopify.com");
    vi.setSystemTime(now + PERFORMANCE_TOKEN_TTL_MS + 1);
    expect(await verifyPerformanceToken(token)).toBeNull();
    vi.setSystemTime(now - 120_000);
    expect(await verifyPerformanceToken(token)).toBeNull();
    vi.setSystemTime(now);
    expect(
      await verifyPerformanceToken(`altro-example.myshopify.com~${issuedAt}~${signature}`),
    ).toBeNull();
    expect(await verifyPerformanceToken(`${shop}~${issuedAt}~${"0".repeat(64)}`)).toBeNull();
    expect(await verifyPerformanceToken(`${token}~extra`)).toBeNull();
    expect(await verifyPerformanceToken(`${shop}~adesso~${signature}`)).toBeNull();
    expect(await verifyPerformanceToken(42)).toBeNull();
    expect(await verifyPerformanceToken("x".repeat(513))).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("il registratore server misura operazioni allowlistate e il totale", async () => {
  const clock = vi.spyOn(performance, "now");
  clock
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(110)
    .mockReturnValueOnce(135)
    .mockReturnValueOnce(150);
  const timing = createServerTiming();

  await expect(timing.measure("d1_support", async () => "ok")).resolves.toBe("ok");
  timing.record("shopify_context", Number.NaN);

  expect(timing.header()).toBe("d1_support;dur=25.0, total;dur=50.0");
  clock.mockRestore();
});

test("il server scarta metriche e campi non ammessi", () => {
  expect(
    normalizePerformanceReport({
      route: "/app/messages?testo=riservato",
      serverTimings: { total: 2200, riservato: 99 },
      layoutShiftSource: "s-section#piano",
      metrics: [
        { id: "v4-1", name: "INP", value: 942, country: "it", target: "riservato" },
        { id: "v4-2", name: "FID", value: 12, country: "IT" },
      ],
    }),
  ).toEqual({
    route: "other",
    serverTimings: { total: 2200 },
    layoutShiftSource: null,
    metrics: [{ id: "v4-1", name: "INP", value: 942, countryCode: null }],
  });
  expect(normalizePerformanceReport({ route: "home", metrics: [] })).toBeNull();
});

test("il server tiene l'attribuzione INP valida campo per campo e solo sui campioni INP", () => {
  const attribution = {
    inputDelay: 12,
    processingDuration: 180,
    presentationDelay: 30,
    scriptSource: "https://app.cfready.it/assets/root-abc.js",
  };
  expect(
    normalizePerformanceReport({
      route: "rules",
      metrics: [
        { id: "v4-inp", name: "INP", value: 222, country: "IT", ...attribution },
        { id: "v4-lcp", name: "LCP", value: 900, country: "IT", ...attribution },
        {
          id: "v4-inp-2",
          name: "INP",
          value: 300,
          inputDelay: -1,
          processingDuration: 12.5,
          presentationDelay: 600_001,
          scriptSource: "https://app.cfready.it/assets/root.js?shop=negozio",
        },
        {
          id: "v4-inp-3",
          name: "INP",
          value: 310,
          presentationDelay: 8,
          scriptSource: `https://cdn.shopify.com/${"a".repeat(200)}.js`,
        },
        { id: "v4-inp-4", name: "INP", value: 320, scriptSource: "chrome-extension://abc/x.js" },
      ],
    })?.metrics,
  ).toEqual([
    { id: "v4-inp", name: "INP", value: 222, countryCode: "IT", inpAttribution: attribution },
    { id: "v4-lcp", name: "LCP", value: 900, countryCode: "IT" },
    { id: "v4-inp-2", name: "INP", value: 300, countryCode: null },
    {
      id: "v4-inp-3",
      name: "INP",
      value: 310,
      countryCode: null,
      inpAttribution: { presentationDelay: 8 },
    },
    { id: "v4-inp-4", name: "INP", value: 320, countryCode: null },
  ]);
});

test("la route firmata registra versione e campioni idempotenti senza payload merchant", async () => {
  const shop = await insertShop("performance.example.myshopify.com");
  const { action } = await import("../app/routes/performance");
  const payload = {
    token: await createPerformanceToken(shop),
    route: "messages",
    serverTimings: { auth: 48, shopify_snapshot: 2090, total: 2150 },
    layoutShiftSource: "notice",
    metrics: [
      { id: "v4-lcp-1", name: "LCP", value: 3273, country: "IT", target: "riservato" },
      {
        id: "v4-inp-1",
        name: "INP",
        value: 942,
        country: "IT",
        inputDelay: 20,
        processingDuration: 870,
        presentationDelay: 52,
        scriptSource: "https://app.cfready.it/assets/rules-abc.js",
      },
      { id: "v4-cls-1", name: "CLS", value: 0.18, country: "IT", inputDelay: 5 },
    ],
  };
  const submit = () =>
    action({
      request: new Request("https://example.test/performance", {
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
            server_timing_json, layout_shift_source
       FROM performance_samples
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
      ORDER BY metric_name`,
  )
    .bind(shop)
    .all<Record<string, unknown>>();
  // D-199: l'area dello spostamento resta solo sul campione CLS.
  expect(results).toEqual([
    {
      metric_id: "v4-cls-1",
      metric_name: "CLS",
      metric_value: 0.18,
      country_code: "IT",
      app_version: APP_VERSION,
      app_route: "messages",
      server_timing_json: '{"auth":48,"shopify_snapshot":2090,"total":2150}',
      layout_shift_source: "notice",
    },
    {
      metric_id: "v4-inp-1",
      metric_name: "INP",
      metric_value: 942,
      country_code: "IT",
      app_version: APP_VERSION,
      app_route: "messages",
      server_timing_json: '{"auth":48,"shopify_snapshot":2090,"total":2150}',
      layout_shift_source: null,
    },
    {
      metric_id: "v4-lcp-1",
      metric_name: "LCP",
      metric_value: 3273,
      country_code: "IT",
      app_version: APP_VERSION,
      app_route: "messages",
      server_timing_json: '{"auth":48,"shopify_snapshot":2090,"total":2150}',
      layout_shift_source: null,
    },
  ]);
  // L'attribuzione INP arriva solo sul campione INP.
  const { results: attribution } = await env.DB.prepare(
    `SELECT metric_name, inp_input_delay_ms, inp_processing_ms, inp_presentation_delay_ms,
            inp_script_source
       FROM performance_samples
      WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
      ORDER BY metric_name`,
  )
    .bind(shop)
    .all<Record<string, unknown>>();
  const none = {
    inp_input_delay_ms: null,
    inp_processing_ms: null,
    inp_presentation_delay_ms: null,
    inp_script_source: null,
  };
  expect(attribution).toEqual([
    { metric_name: "CLS", ...none },
    {
      metric_name: "INP",
      inp_input_delay_ms: 20,
      inp_processing_ms: 870,
      inp_presentation_delay_ms: 52,
      inp_script_source: "https://app.cfready.it/assets/rules-abc.js",
    },
    { metric_name: "LCP", ...none },
  ]);

  // `report:performance` legge le stesse colonne sullo schema reale.
  const { PERFORMANCE_INP_ATTRIBUTION_QUERY, parsePerformanceInpAttribution } =
    await import("../app/reporting/performance");
  const { results: report } = await env.DB.prepare(PERFORMANCE_INP_ATTRIBUTION_QUERY).all();
  expect(parsePerformanceInpAttribution(report)).toContainEqual({
    app_route: "messages",
    inp_script_source: "https://app.cfready.it/assets/rules-abc.js",
    sample_count: 1,
    poor_count: 1,
    avg_input_delay_ms: 20,
    avg_processing_ms: 870,
    avg_presentation_delay_ms: 52,
  });
});

test("la route rifiuta body non JSON o sovradimensionati prima della firma", async () => {
  const { action } = await import("../app/routes/performance");
  const context = createAppContext(env.DB);
  const unsupported = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      body: "metriche",
    }),
    context,
    params: {},
  } as never);
  const oversized = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: [], padding: "x".repeat(17_000) }),
    }),
    context,
    params: {},
  } as never);

  expect(unsupported.status).toBe(415);
  expect(oversized.status).toBe(413);
});

test("la route rifiuta lunghezze dichiarate non valide e report JSON malformati", async () => {
  const { action } = await import("../app/routes/performance");
  const context = createAppContext(env.DB);
  const invalidLength = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "non-numerica" },
      body: "{}",
    }),
    context,
    params: {},
  } as never);
  const malformedJson = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    context,
    params: {},
  } as never);
  const missingBody = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
    context,
    params: {},
  } as never);
  const emptyReport = await action({
    request: new Request("https://example.test/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    context,
    params: {},
  } as never);

  expect(invalidLength.status).toBe(413);
  expect(malformedJson.status).toBe(400);
  expect(missingBody.status).toBe(400);
  expect(emptyReport.status).toBe(400);
});

test("la route interrompe un body JSON chunked appena supera il limite", async () => {
  const { action } = await import("../app/routes/performance");
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
    request: new Request("https://example.test/performance", {
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
});

test("la route rifiuta un report senza firma valida senza registrarlo", async () => {
  const shop = await insertShop("firma-assente.example.myshopify.com");
  const { action } = await import("../app/routes/performance");
  const submit = (token: unknown) =>
    action({
      request: new Request("https://example.test/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          route: "home",
          metrics: [{ id: "v4-firma", name: "LCP", value: 1200, country: "IT" }],
        }),
      }),
      context: createAppContext(env.DB),
      params: {},
    } as never);

  expect((await submit(undefined)).status).toBe(401);
  expect((await submit(`${shop}~${Date.now()}~${"a".repeat(64)}`)).status).toBe(401);
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS campioni FROM performance_samples
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
      .bind(shop)
      .first("campioni"),
  ).toBe(0);
});
