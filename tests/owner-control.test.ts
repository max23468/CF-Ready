import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  renderOwnerControlAction,
  type OwnerControlRuntimeConfig,
} from "../app/owner-control/commands.server";
import { fetchGrowthReport, readGrowthReport } from "../app/owner-control/growth.server";
import {
  handleOwnerControlWebhook,
  MAX_OWNER_CONTROL_BODY_BYTES,
  type OwnerControlBindings,
} from "../app/owner-control/handler.server";
import {
  callbackData,
  parseCallback,
  parseCommand,
  type OwnerControlAction,
} from "../app/owner-control/model";
import {
  activityMessage,
  billingMessage,
  dashboardMessage,
  errorsMessage,
  funnelMessage,
  healthMessage,
  issuesMessage,
  performanceMessage,
  shopMessage,
  shopsMessage,
  trialsMessage,
  versionMessage,
} from "../app/owner-control/presentation";
import {
  CHECKOUT_LABEL_OBSERVATION_MINUTES,
  reconcileOwnerIncidents,
} from "../app/owner-control/incidents.server";
import {
  findShops,
  readBilling,
  readDashboard,
  readErrors,
  readHealth,
  readIssues,
  readNotificationStatus,
  readPerformance,
  readShops,
  readTrials,
  type ShopRow,
} from "../app/owner-control/queries.server";
import {
  claimOwnerControlUpdate,
  finishOwnerControlUpdate,
  ownerControlErrorCode,
  readOwnerControlState,
  renewOwnerControlClaim,
  writeOwnerControlState,
} from "../app/owner-control/repository.server";
import { fetchRevenueReport, readRevenueReport } from "../app/owner-control/revenue.server";
import { parseOwnerControlUpdate } from "../app/owner-control/update.server";
import { parseFunnel } from "../app/reporting/funnel";
import {
  comparePerformanceVersions,
  parsePerformanceRows,
  parsePerformanceTimings,
} from "../app/reporting/performance";
import { createTelegramClient } from "../app/telegram/client.server";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_ABCD";
const CHAT_ID = "10001";
const OWNER_ID = "10001";
const SECRET = "owner-control-secret-with-32-chars";
const PARTNER = { organizationId: "org", appId: "app", accessToken: "partner-token" };

const controlConfig = (): OwnerControlRuntimeConfig => ({
  botToken: BOT_TOKEN,
  chatId: CHAT_ID,
  organizationId: PARTNER.organizationId,
  partnerAppId: PARTNER.appId,
  partnerAccessToken: PARTNER.accessToken,
  environment: "production",
  webhookUrl: "https://cf-ready-prod.test/internal/telegram/webhook",
  versionMetadata: {
    id: "worker-v1",
    tag: "release",
    timestamp: "2026-09-08T10:00:00.000Z",
  },
});

const controlEnv = (): OwnerControlBindings => ({
  DB: env.DB,
  OWNER_TELEGRAM_CONTROL_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  TELEGRAM_CHAT_ID: CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  TELEGRAM_OWNER_USER_ID: OWNER_ID,
  SHOPIFY_PARTNER_ORGANIZATION_ID: PARTNER.organizationId,
  SHOPIFY_PARTNER_APP_ID: PARTNER.appId,
  SHOPIFY_PARTNER_ACCESS_TOKEN: PARTNER.accessToken,
  SHOPIFY_APP_URL: "https://cf-ready-prod.test",
  APP_ENVIRONMENT: "production",
  CF_VERSION_METADATA: {
    id: "worker-v1",
    tag: "release",
    timestamp: "2026-09-08T10:00:00.000Z",
  },
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owner_control_updates"),
    env.DB.prepare("DELETE FROM owner_control_state"),
    env.DB.prepare("DELETE FROM owner_operational_incidents"),
    env.DB.prepare("DELETE FROM owner_notifications"),
    env.DB.prepare("DELETE FROM owner_notification_state"),
    env.DB.prepare("DELETE FROM app_events"),
    env.DB.prepare("DELETE FROM webhook_events"),
    env.DB.prepare("DELETE FROM shops"),
  ]);
});

describe("parser Control Center", () => {
  test("accetta comandi, argomenti e filtri in allowlist", () => {
    expect(parseCommand("/dashboard")).toEqual({ view: "dashboard" });
    expect(parseCommand("/shop atelier.myshopify.com")).toEqual({
      view: "shop",
      argument: "atelier.myshopify.com",
    });
    expect(parseCommand("/shops trial")).toEqual({ view: "shops", filter: "trial", page: 0 });
    expect(parseCommand("/shops sconosciuto")).toBeNull();
    expect(parseCommand("/dashboard extra")).toBeNull();
    expect(parseCommand(`/shop ${"x".repeat(161)}`)).toBeNull();
    expect(parseCommand("testo libero")).toBeNull();
  });

  test("versiona e limita callback, target, pagina e refresh", () => {
    const encoded = callbackData({ view: "shop", shopId: 42, page: 3, refresh: true });
    expect(encoded).toBe("oc1:o:16:3:r");
    expect(parseCallback(encoded)).toEqual({ view: "shop", shopId: 42, page: 3, refresh: true });
    expect(parseCallback("oc2:o:16:3")).toBeNull();
    expect(parseCallback("oc1:o:!:3")).toBeNull();
    expect(parseCallback("oc1:x:-:-1")).toBeNull();
    expect(parseCallback("x".repeat(65))).toBeNull();
    expect(callbackData({ view: "shops", filter: "issues" })).toBe("oc1:s:issues:0");
    expect(callbackData({ view: "help" })).toBe("oc1:x:-:0");
    expect(parseCallback("oc1:s:issues:0")).toEqual({
      view: "shops",
      filter: "issues",
      page: 0,
      refresh: false,
    });
    for (const invalid of [
      "oc1:z:-:0",
      "oc1:x:-:x",
      "oc1:x:-:10001",
      "oc1:x:-:0:no",
      "oc1:x:-:0:r:extra",
      "oc1:o:0:0",
      "oc1:s:no:0",
      "oc1:x:target:0",
    ]) {
      expect(parseCallback(invalid)).toBeNull();
    }
    expect(parseCommand("/shops")).toEqual({ view: "shops", filter: "all", page: 0 });
    expect(parseCommand("/shop")).toEqual({ view: "shop" });
  });

  test("autorizza solo messaggi e callback della chat privata owner", () => {
    expect(
      parseOwnerControlUpdate(messageUpdate("/help"), { chatId: CHAT_ID, userId: OWNER_ID }),
    ).toMatchObject({ result: "accepted", update: { kind: "message", action: { view: "help" } } });
    expect(
      parseOwnerControlUpdate(callbackUpdate(callbackData({ view: "help" })), {
        chatId: CHAT_ID,
        userId: OWNER_ID,
      }),
    ).toMatchObject({
      result: "accepted",
      update: { kind: "callback_query", messageId: 77, action: { view: "help" } },
    });
    expect(
      parseOwnerControlUpdate(messageUpdate("/help", { chatType: "group" }), {
        chatId: CHAT_ID,
        userId: OWNER_ID,
      }),
    ).toEqual({ result: "unauthorized" });
    expect(
      parseOwnerControlUpdate(
        { update_id: 9, edited_message: {} },
        { chatId: CHAT_ID, userId: OWNER_ID },
      ),
    ).toEqual({ result: "ignored" });
  });

  test("rifiuta strutture Telegram incomplete o ambigue", () => {
    const owner = { chatId: CHAT_ID, userId: OWNER_ID };
    const invalid = [
      null,
      {},
      { update_id: -1 },
      { update_id: 1, message: {}, callback_query: {} },
      { update_id: 1, message: null },
      { update_id: 1, callback_query: null },
      { update_id: 1, callback_query: { id: 1 } },
      { update_id: 1, callback_query: { id: "x", from: null, message: {} } },
      { update_id: 1, callback_query: { id: "x", from: {}, message: {} } },
      {
        update_id: 1,
        callback_query: {
          id: "x",
          from: { id: Number(OWNER_ID) },
          message: { message_id: -1, chat: { id: Number(CHAT_ID), type: "private" } },
        },
      },
    ];
    for (const payload of invalid)
      expect(parseOwnerControlUpdate(payload, owner).result).toBeDefined();

    const noText = messageUpdate("/help") as Record<string, unknown>;
    delete (noText.message as Record<string, unknown>).text;
    expect(parseOwnerControlUpdate(noText, owner)).toEqual({ result: "ignored" });

    const noData = callbackUpdate("x") as Record<string, unknown>;
    delete (noData.callback_query as Record<string, unknown>).data;
    expect(parseOwnerControlUpdate(noData, owner)).toMatchObject({ result: "ignored" });

    const noCallbackMessage = callbackUpdate("x") as Record<string, unknown>;
    delete (noCallbackMessage.callback_query as Record<string, unknown>).message;
    expect(parseOwnerControlUpdate(noCallbackMessage, owner)).toEqual({ result: "invalid" });
    expect(parseOwnerControlUpdate(callbackUpdate("x", { chatId: 999 }), owner)).toEqual({
      result: "unauthorized",
    });
  });
});

describe("reporting condiviso", () => {
  test("classifica righe performance e confronti stabili, insufficienti e regressivi", () => {
    expect(() => parsePerformanceRows(null)).toThrow("mancanti");
    for (const row of [
      {},
      { metric_name: "TTFB", app_version: "1", app_route: "home", sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: 1, app_route: "home", sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: 1, sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: "home", sample_count: 0, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: "home", sample_count: 100, p75: -1 },
    ]) {
      expect(() => parsePerformanceRows([row])).toThrow("non valida");
    }

    const groups = parsePerformanceRows([
      { metric_name: "LCP", app_version: "1.0.0", app_route: "home", sample_count: 100, p75: 1000 },
      { metric_name: "LCP", app_version: "1.1.0", app_route: "home", sample_count: 100, p75: 1300 },
      { metric_name: "INP", app_version: "1.0.0", app_route: "rules", sample_count: 50, p75: 100 },
      { metric_name: "INP", app_version: "1.1.0", app_route: "rules", sample_count: 50, p75: 140 },
      { metric_name: "CLS", app_version: "1.1.0", app_route: "all", sample_count: 100, p75: 0.2 },
    ]);
    expect(groups.map(({ status }) => status)).toEqual([
      "pass",
      "pass",
      "insufficient_samples",
      "insufficient_samples",
      "fail",
    ]);

    expect(() => comparePerformanceVersions(groups, [], "", "1.1.0")).toThrow("distinte");
    expect(() => comparePerformanceVersions(groups, [], "1.0.0", "1.0.0")).toThrow("distinte");
    const compared = comparePerformanceVersions(
      groups,
      [
        {
          app_version: "1.0.0",
          app_route: "home",
          timing_name: "auth",
          sample_count: 100,
          p75: 10,
        },
        {
          app_version: "1.1.0",
          app_route: "home",
          timing_name: "auth",
          sample_count: 100,
          p75: 15,
        },
      ],
      "1.0.0",
      "1.1.0",
    );
    expect(compared.status).toBe("compared");
    expect(compared.alerts).toHaveLength(1);
    expect(compared.comparisons.map(({ status }) => status)).toContain("insufficient_samples");
    expect(comparePerformanceVersions([], [], "1.0.0", "1.1.0").status).toBe(
      "insufficient_samples",
    );
  });

  test("valida durate server e coorti ai confini", () => {
    expect(() => parsePerformanceTimings(null)).toThrow("mancanti");
    for (const row of [
      {},
      { timing_name: "unknown", app_version: "1", app_route: "home", sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: 1, app_route: "home", sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: 1, sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 0, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 1, p75: Infinity },
    ]) {
      expect(() => parsePerformanceTimings([row])).toThrow("non valida");
    }
    expect(
      parsePerformanceTimings([
        { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 1, p75: 2 },
      ]),
    ).toHaveLength(1);

    expect(() => parseFunnel(null)).toThrow("mancanti");
    const base = {
      cohort: "2026-36",
      installed: 10,
      rules_observed: 8,
      trial_observed: 7,
      activation_observed: 6,
      rules_not_observed: 2,
      configured_without_activation: 2,
      trial_without_activation: 1,
      uninstalled_before_observed_activation: 1,
      activation_without_observed_trial: 0,
      seconds_to_rules: null,
      seconds_to_trial: 2,
      seconds_to_activation: 3,
    };
    expect(parseFunnel([base])[0]).toMatchObject({ activation_rate: 0.6, evidence: "descriptive" });
    expect(
      parseFunnel([
        {
          ...base,
          installed: 0,
          rules_observed: 0,
          trial_observed: 0,
          activation_observed: 0,
          rules_not_observed: 0,
          configured_without_activation: 0,
          trial_without_activation: 0,
          uninstalled_before_observed_activation: 0,
        },
      ])[0],
    ).toMatchObject({ activation_rate: null, evidence: "small_cohort" });
    expect(() => parseFunnel([{ ...base, cohort: "x" }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, rules_observed: 11 }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, seconds_to_rules: -1 }])).toThrow("Durata");
  });
});

describe("presentazione Telegram", () => {
  test("copre stati vuoti, fallback e paginazione", () => {
    expect(dashboardMessage({}).richMessage.blocks).toBeTruthy();
    expect(shopsMessage({ shops: [], count: 0, page: 0 }, "all").replyMarkup).toBeTruthy();
    for (const filter of ["trial", "paid", "validation_off", "issues"] as const) {
      expect(
        shopsMessage({ shops: [], count: 0, page: 0 }, filter).richMessage.blocks,
      ).toBeTruthy();
    }
    const shop = shopFixture({ display_name: null, validation_enabled: 0 });
    const paged = shopsMessage({ shops: [shop], count: 20, page: 1 }, "all");
    expect(paged.replyMarkup?.inline_keyboard.flat().map(({ text }) => text)).toEqual(
      expect.arrayContaining(["‹", "›"]),
    );
    expect(
      trialsMessage({ trials: [], count: 0, endingSoon: 0, page: 0 }).richMessage.blocks,
    ).toBeTruthy();
    expect(
      trialsMessage({
        trials: [
          {
            id: 1,
            shop_domain: "a.myshopify.com",
            display_name: null,
            ends_at: "2026-09-01",
            validation_enabled: 0,
          },
        ],
        count: 20,
        endingSoon: 1,
        page: 1,
      }).replyMarkup,
    ).toBeTruthy();
  });

  test("copre dettaglio store e stati commerciali", () => {
    const variants = [
      shopFixture({ complimentary_status: "active", entitlement_status: "expired" }),
      shopFixture({ complimentary_status: "active", entitlement_status: "active" }),
      shopFixture({ entitlement_status: "active" }),
      shopFixture({ entitlement_status: "ending" }),
      shopFixture({ entitlement_status: null, trial_status: "active" }),
      shopFixture({ entitlement_status: null, trial_status: null, config_hash: null }),
    ];
    for (const shop of variants) expect(shopMessage(shop).richMessage.blocks).toBeTruthy();
    expect(
      shopMessage(variants[0], [{ event_name: "rules_saved", occurred_at: NOW.toISOString() }])
        .richMessage.blocks,
    ).toBeTruthy();
    expect(
      shopsMessage(
        {
          shops: [
            shopFixture({
              plan_kind: null,
              trial_status: null,
              validation_enabled: 0,
              last_error_code: "sync_failed",
            }),
          ],
          count: 1,
          page: 0,
        },
        "all",
      ).richMessage.blocks,
    ).toBeTruthy();
  });

  test("copre pannelli diagnostici con dati presenti e assenti", () => {
    expect(errorsMessage([]).richMessage.blocks).toBeTruthy();
    expect(
      errorsMessage([{ error_code: "sync_failed", count: 2, last_at: NOW.toISOString() }])
        .richMessage.blocks,
    ).toBeTruthy();
    expect(activityMessage([]).richMessage.blocks).toBeTruthy();
    expect(
      activityMessage([
        {
          event_name: "rules_saved",
          occurred_at: NOW.toISOString(),
          display_name: null,
          shop_domain: null,
        },
        {
          event_name: "trial_started",
          occurred_at: NOW.toISOString(),
          display_name: null,
          shop_domain: "a.myshopify.com",
        },
      ]).richMessage.blocks,
    ).toBeTruthy();
    expect(
      issuesMessage({ partner: { synced_at: new Date().toISOString() } }).richMessage.blocks,
    ).toBeTruthy();
    expect(issuesMessage({}).richMessage.blocks).toBeTruthy();
    expect(
      healthMessage({ d1: false, partner: {}, inbound: {}, notifications: {}, webhooks: {} })
        .richMessage.blocks,
    ).toBeTruthy();
    expect(
      healthMessage(
        { d1: true, partner: { synced_at: new Date().toISOString() } },
        {
          configured: false,
          matchesExpectedUrl: false,
          pendingUpdateCount: 1,
          lastErrorAt: null,
          checkedAt: NOW.toISOString(),
        },
      ).richMessage.blocks,
    ).toBeTruthy();
    expect(
      healthMessage(
        { d1: true, partner: { synced_at: new Date().toISOString() } },
        {
          configured: true,
          matchesExpectedUrl: true,
          pendingUpdateCount: 0,
          lastErrorAt: NOW.toISOString(),
          checkedAt: NOW.toISOString(),
        },
      ).richMessage.blocks,
    ).toBeTruthy();
  });

  test("copre funnel, performance e versione con alternative di formato", () => {
    const billingData = {
      rows: [
        { entitlement_status: "ending", plan_kind: "monthly", count: 2 },
        { entitlement_status: "expired", plan_kind: "annual", count: 3 },
        { entitlement_status: "refunded", plan_kind: "one_time", count: 4 },
      ],
      complimentary: 1,
      trials: 1,
      mrr: 10,
      arr: 120,
      netMrr: 9.41,
      netArr: 112.92,
      regulatoryUnknown: 2,
      shopifyFees: { revenueShare: 0, processing: 0.029, regulatoryOperating: { IT: 0.03 } },
    };
    const revenue = {
      generatedAt: NOW.toISOString(),
      cachedAt: NOW.toISOString(),
      currency: "USD",
      totals: { count: 3, grossMinor: 10653, netMinor: 10036 },
      subscriptions: { count: 1, grossMinor: 347, netMinor: 327 },
      lifetime: { count: 1, grossMinor: 10453, netMinor: 9836 },
      adjustments: { count: 1, grossMinor: -147, netMinor: -127 },
    };
    const billing = billingMessage(billingData, revenue);
    const billingText = JSON.stringify(billing);
    expect(billing.richMessage.blocks).toBeTruthy();
    expect(billingText).toContain("Valore mensile (MRR)");
    expect(billingText).toContain("Mensile dopo fee");
    expect(billingText).toContain("elaborazione 2,9%");
    expect(billingText).toContain("regolamentare IT 3%");
    expect(billingText).toContain("regolamentare non nota per 2 abbonamenti");
    expect(billingText).toContain("100,36");
    expect(billingText).toContain("6,17");
    expect(billingText).toContain("98,36");
    expect(billingText).toContain("1 acquisti");
    expect(billingText).toContain("oc1:b:-:0:r");
    expect(JSON.stringify(billingMessage(billingData))).toContain("Partner API non disponibile");
    expect(
      JSON.stringify(billingMessage(billingData, { unavailable: "partner_api_graphql_error" })),
    ).toContain("serve il permesso View financials");
    expect(
      JSON.stringify(billingMessage(billingData, { unavailable: "partner_api_request_failed" })),
    ).toContain("(partner_api_request_failed)");
    const emptyRevenue = JSON.stringify(
      billingMessage({ ...billingData, regulatoryUnknown: 0 }, { ...revenue, currency: null }),
    );
    expect(emptyRevenue).toContain("Nessuna vendita registrata");
    expect(emptyRevenue).not.toContain("regolamentare non nota");
    expect(
      funnelMessage([
        {
          cohort: "2026-36",
          installed: 2,
          rules_observed: 1,
          trial_observed: 1,
          activation_observed: 1,
          evidence: "small_cohort",
        },
        {
          cohort: "2026-35",
          installed: 20,
          rules_observed: 10,
          trial_observed: 9,
          activation_observed: 8,
          evidence: "descriptive",
        },
      ]).richMessage.blocks,
    ).toBeTruthy();
    expect(performanceMessage({ groups: [], comparison: null }).richMessage.blocks).toBeTruthy();
    expect(
      performanceMessage({
        groups: [
          {
            metric: "CLS",
            app_version: "all",
            app_route: "all",
            sample_count: 100,
            p75: 0.1234,
            status: "fail",
          },
          {
            metric: "LCP",
            app_version: "all",
            app_route: "all",
            sample_count: 50,
            p75: 1000,
            status: "insufficient_samples",
          },
          {
            metric: "INP",
            app_version: "all",
            app_route: "all",
            sample_count: 100,
            p75: 100,
            status: "custom",
          },
        ],
        comparison: {
          previous_version: "1.0.0",
          current_version: "1.1.0",
          alerts: [
            { route: "home", metric: "CLS", delta: 0.03 },
            { route: "rules", metric: "LCP", delta: null },
          ],
        },
      }).richMessage.blocks,
    ).toBeTruthy();
    const bfs = (sampleCount: number, p75: Record<"LCP" | "INP" | "CLS", number>) =>
      JSON.stringify(
        performanceMessage({
          groups: (["LCP", "INP", "CLS"] as const).map((metric) => ({
            metric,
            app_version: "all",
            app_route: "all",
            sample_count: sampleCount,
            p75: p75[metric],
            status: "pass",
          })),
          comparison: null,
        }),
      );
    const pending = bfs(33, { LCP: 2460, INP: 48, CLS: 0.006 });
    expect(pending).toContain(
      "2460 ms su 2500 ms · 33/100 campioni · Entro soglia, vicino al limite · campioni insufficienti",
    );
    expect(pending).toContain("In attesa di campioni sufficienti");
    expect(pending).toContain("Partner Dashboard");
    expect(bfs(120, { LCP: 1800, INP: 48, CLS: 0.006 })).toContain("Requisito soddisfatto");
    const failing = bfs(120, { LCP: 2600, INP: 48, CLS: 0.006 });
    expect(failing).toContain("2600 ms su 2500 ms · 120/100 campioni · Sopra soglia");
    expect(failing).toContain("Requisito non soddisfatto");
    expect(JSON.stringify(performanceMessage({ groups: [], comparison: null }))).toContain(
      "0/100 campioni · Nessun dato",
    );
    expect(
      versionMessage({ appVersion: "1", environment: "Test" }).richMessage.blocks,
    ).toBeTruthy();
  });
});

describe("Ricavi Partner", () => {
  test("usa i default runtime con una risposta Partner vuota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => revenueResponse([], false)),
    );
    try {
      await expect(readRevenueReport(env.DB, PARTNER)).resolves.toMatchObject({
        currency: null,
        totals: { count: 0, grossMinor: 0, netMinor: 0 },
      });
      await expect(fetchRevenueReport(PARTNER)).resolves.toMatchObject({ currency: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("somma vendite, lifetime, rimborsi e crediti su più pagine con cache e cooldown", async () => {
    const responses = [
      revenueResponse(
        [
          { cursor: "t1", node: revenueTransaction("AppSubscriptionSale", "3.47", "3.27") },
          { cursor: "t2", node: revenueTransaction("AppOneTimeSale", "104.53", "98.36") },
        ],
        true,
      ),
      revenueResponse(
        [
          { cursor: "t3", node: revenueTransaction("AppSaleAdjustment", "-3.47", "-3.27") },
          { cursor: "t4", node: revenueTransaction("AppSaleCredit", null, "-1.00") },
        ],
        false,
      ),
    ];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      responses.shift()!,
    );
    const report = await readRevenueReport(env.DB, PARTNER, {
      now: NOW,
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(report).toMatchObject({
      currency: "USD",
      totals: { count: 4, grossMinor: 10353, netMinor: 9736 },
      subscriptions: { count: 1, grossMinor: 347, netMinor: 327 },
      lifetime: { count: 1, grossMinor: 10453, netMinor: 9836 },
      adjustments: { count: 2, grossMinor: -447, netMinor: -427 },
      cachedAt: NOW.toISOString(),
    });
    const secondRequest = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(secondRequest.variables).toEqual({ appId: PARTNER.appId, after: "t2", first: 100 });
    expect(secondRequest.query).toContain("APP_ONE_TIME_SALE");

    const cached = await readRevenueReport(env.DB, PARTNER, {
      now: new Date(NOW.getTime() + 60_000),
      force: true,
      fetcher: vi.fn(() => Promise.reject(new Error("non chiamare"))),
    });
    expect(cached.totals).toEqual(report.totals);

    const refreshed = vi.fn(async () => revenueResponse([], false));
    await expect(
      readRevenueReport(env.DB, PARTNER, {
        now: new Date(NOW.getTime() + 6 * 60_000),
        force: true,
        fetcher: refreshed,
      }),
    ).resolves.toMatchObject({ currency: null, totals: { count: 0 } });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  test("rifiuta transazioni, valute, cursori e paginazione non validi", async () => {
    const fetchWith = (...pages: Response[]) =>
      vi.fn(async () => pages.shift()!) as unknown as typeof fetch;
    const invalid = { amount: "1.00", currencyCode: "usd" };
    await expect(
      fetchRevenueReport(PARTNER, NOW, fetchWith(Response.json({ data: {} }))),
    ).rejects.toThrow("partner_api_invalid_payload");
    for (const node of [
      revenueTransaction("ThemeSale", "1.00", "1.00"),
      revenueTransaction("AppOneTimeSale", "1.00", "uno"),
      { ...revenueTransaction("AppOneTimeSale", "1.00", "1.00"), grossAmount: invalid },
    ]) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await expect(
        fetchRevenueReport(
          PARTNER,
          NOW,
          fetchWith(revenueResponse([{ cursor: "t1", node }], false)),
        ),
      ).rejects.toThrow("partner_api_invalid_transaction");
    }
    await expect(
      fetchRevenueReport(
        PARTNER,
        NOW,
        fetchWith(
          revenueResponse(
            [
              { cursor: "t1", node: revenueTransaction("AppOneTimeSale", "1.00", "0.94") },
              { cursor: "t2", node: revenueTransaction("AppOneTimeSale", "1.00", "0.94", "EUR") },
            ],
            false,
          ),
        ),
      ),
    ).rejects.toThrow("partner_api_mixed_currency");
    await expect(
      fetchRevenueReport(PARTNER, NOW, fetchWith(revenueResponse([], true))),
    ).rejects.toThrow("partner_api_invalid_cursor");
    const sale = revenueTransaction("AppSubscriptionSale", "3.47", "3.27");
    await expect(
      fetchRevenueReport(
        PARTNER,
        NOW,
        fetchWith(
          revenueResponse([{ cursor: "t1", node: sale }], true),
          revenueResponse([{ cursor: "t1", node: sale }], true),
        ),
      ),
    ).rejects.toThrow("partner_api_invalid_cursor");
    let page = 0;
    const endless = vi.fn(async () =>
      revenueResponse([{ cursor: `t${(page += 1)}`, node: sale }], true),
    ) as unknown as typeof fetch;
    await expect(fetchRevenueReport(PARTNER, NOW, endless)).rejects.toThrow(
      "partner_api_page_limit",
    );
  });

  test("mostra i ricavi nella vista billing e degrada senza permesso", async () => {
    const sale = vi.fn(async () =>
      revenueResponse(
        [{ cursor: "t1", node: revenueTransaction("AppOneTimeSale", "104.53", "98.36") }],
        false,
      ),
    ) as unknown as typeof fetch;
    const billing = await renderOwnerControlAction(
      env.DB,
      { view: "billing", refresh: true },
      controlConfig(),
      { now: NOW, fetcher: sale },
    );
    expect(JSON.stringify(billing)).toContain("98,36");

    await env.DB.prepare("DELETE FROM owner_control_state").run();
    const denied = vi.fn(async () =>
      Response.json({ errors: [{ message: "Access denied" }] }),
    ) as unknown as typeof fetch;
    const withoutAccess = await renderOwnerControlAction(
      env.DB,
      { view: "billing" },
      controlConfig(),
      {
        now: NOW,
        fetcher: denied,
      },
    );
    expect(JSON.stringify(withoutAccess)).toContain("serve il permesso View financials");
    expect(JSON.stringify(withoutAccess)).toContain("Valore mensile (MRR)");
  });
});

describe("boundary webhook", () => {
  test("applica flag, metodo, media type, limite, secret e configurazione", async () => {
    const disabled = controlEnv();
    disabled.OWNER_TELEGRAM_CONTROL_ENABLED = "false";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), disabled)).status,
    ).toBe(404);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { method: "GET", body: undefined }),
          controlEnv(),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { contentType: "text/plain" }),
          controlEnv(),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await handleOwnerControlWebhook(
          new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
            method: "POST",
            headers: { "x-telegram-bot-api-secret-token": SECRET },
            body: JSON.stringify(messageUpdate("/help")),
          }),
          controlEnv(),
        )
      ).status,
    ).toBe(415);

    const incomplete = controlEnv();
    delete incomplete.TELEGRAM_WEBHOOK_SECRET;
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), incomplete)).status,
    ).toBe(503);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { secret: "wrong" }),
          controlEnv(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { body: "x".repeat(MAX_OWNER_CONTROL_BODY_BYTES + 1) }),
          controlEnv(),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handleOwnerControlWebhook(
          request(messageUpdate("/help"), { body: "{" }),
          controlEnv(),
        )
      ).status,
    ).toBe(400);
  });

  test("consuma chat, owner e tipo chat non autorizzati senza chiamare Telegram", async () => {
    const fetcher = vi.fn();
    for (const payload of [
      messageUpdate("/help", { chatId: 999 }),
      messageUpdate("/help", { userId: 999 }),
      messageUpdate("/help", { chatType: "group" }),
      callbackUpdate(callbackData({ view: "help" }), { userId: 999 }),
    ]) {
      expect(
        (await handleOwnerControlWebhook(request(payload), controlEnv(), { fetcher })).status,
      ).toBe(200);
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_control_updates").first(),
    ).toEqual({
      count: 0,
    });
  });

  test("ignora update e comandi non supportati e chiude callback non valida", async () => {
    const fetcher = telegramSuccess();
    expect(
      (
        await handleOwnerControlWebhook(
          request({ update_id: 1, edited_message: {} }),
          controlEnv(),
          { fetcher },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/unknown")), controlEnv(), {
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(
          request(callbackUpdate("callback-sconosciuta", { updateId: 3 })),
          controlEnv(),
          { fetcher },
        )
      ).status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery"]);
    expect(
      (
        await handleOwnerControlWebhook(
          request(callbackUpdate("callback-sconosciuta", { updateId: 4 })),
          controlEnv(),
          {
            fetcher: vi.fn(async () => {
              throw new Error("rete");
            }) as unknown as typeof fetch,
          },
        )
      ).status,
    ).toBe(200);
  });

  test("rifiuta ogni configurazione owner incompleta e Content-Length non valido", async () => {
    for (const key of [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "TELEGRAM_OWNER_USER_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "SHOPIFY_APP_URL",
      "APP_ENVIRONMENT",
    ] as const) {
      const current = controlEnv();
      delete current[key];
      expect(
        (await handleOwnerControlWebhook(request(messageUpdate("/help")), current)).status,
      ).toBe(503);
    }
    const mismatchedOwner = controlEnv();
    mismatchedOwner.TELEGRAM_OWNER_USER_ID = "10002";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), mismatchedOwner)).status,
    ).toBe(503);
    const weakSecret = controlEnv();
    weakSecret.TELEGRAM_WEBHOOK_SECRET = "too-short";
    expect(
      (await handleOwnerControlWebhook(request(messageUpdate("/help")), weakSecret)).status,
    ).toBe(503);
    const invalidLength = request(messageUpdate("/help"));
    invalidLength.headers.set("content-length", "non-numero");
    expect((await handleOwnerControlWebhook(invalidLength, controlEnv())).status).toBe(413);
    const excessiveLength = request(messageUpdate("/help"));
    excessiveLength.headers.set("content-length", String(MAX_OWNER_CONTROL_BODY_BYTES + 1));
    expect((await handleOwnerControlWebhook(excessiveLength, controlEnv())).status).toBe(413);

    const missingSecret = request(messageUpdate("/help"));
    missingSecret.headers.delete("x-telegram-bot-api-secret-token");
    expect((await handleOwnerControlWebhook(missingSecret, controlEnv())).status).toBe(403);
    expect(
      (
        await handleOwnerControlWebhook(
          new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-telegram-bot-api-secret-token": SECRET,
            },
          }),
          controlEnv(),
        )
      ).status,
    ).toBe(400);
  });

  test("lascia ritentabile una vista temporaneamente non disponibile", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/sendRichMessage")
        ? Response.json({ ok: true, result: { message_id: 1 } })
        : Response.json({ data: { app: {} } }),
    ) as unknown as typeof fetch;
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/growth", { updateId: 81 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(500);
    expect(methods(fetcher)).toEqual(["graphql.json"]);
    expect(
      await env.DB.prepare("SELECT status FROM owner_control_updates WHERE update_id = 81").first(),
    ).toEqual({ status: "failed" });
    expect(
      await env.DB.prepare(
        "SELECT event_name FROM app_events WHERE event_name = 'owner_control_command_failed'",
      ).first(),
    ).toEqual({ event_name: "owner_control_command_failed" });
  });
});

describe("idempotenza e delivery interattiva", () => {
  test("una ricevuta processata impedisce una seconda risposta", async () => {
    const fetcher = telegramSuccess();
    const incoming = request(messageUpdate("/help"));
    expect(
      (await handleOwnerControlWebhook(incoming, controlEnv(), { now: NOW, fetcher })).status,
    ).toBe(200);
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: NOW,
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["sendRichMessage"]);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "processed",
      attempts: 1,
    });
  });

  test("una ricevuta ancora in lavorazione chiede a Telegram di ritentare", async () => {
    await claimOwnerControlUpdate(env.DB, 72, "message", NOW, "token");
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 72 })),
      controlEnv(),
      { now: NOW, fetcher: telegramSuccess() },
    );
    expect(result.status).toBe(503);
  });

  test("usa i binding opzionali per un comando che non richiede Partner", async () => {
    const current = controlEnv();
    delete current.SHOPIFY_PARTNER_ORGANIZATION_ID;
    delete current.SHOPIFY_PARTNER_APP_ID;
    delete current.SHOPIFY_PARTNER_ACCESS_TOKEN;
    delete current.CF_VERSION_METADATA;
    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 73 })),
      current,
      { fetcher: telegramSuccess() },
    );
    expect(result.status).toBe(200);
  });

  test("un fallimento di delivery resta ritentabile", async () => {
    const failed = vi.fn(async () => {
      throw new Error("rete");
    }) as unknown as typeof fetch;
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: NOW,
          fetcher: failed,
        })
      ).status,
    ).toBe(500);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "failed",
      attempts: 1,
    });

    const recovered = telegramSuccess();
    expect(
      (
        await handleOwnerControlWebhook(request(messageUpdate("/help")), controlEnv(), {
          now: new Date(NOW.getTime() + 1000),
          fetcher: recovered,
        })
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT status, attempts FROM owner_control_updates").first(),
    ).toEqual({
      status: "processed",
      attempts: 2,
    });
  });

  test("un invio riuscito non viene richiesto di nuovo se perde la finalizzazione", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => {
      await env.DB.prepare(
        `UPDATE owner_control_updates
         SET claim_token = 'nuovo-token', updated_at = ?
         WHERE update_id = 75`,
      )
        .bind(NOW.toISOString())
        .run();
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;

    const result = await handleOwnerControlWebhook(
      request(messageUpdate("/help", { updateId: 75 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(200);
    expect(methods(fetcher)).toEqual(["sendRichMessage"]);
    expect(
      await env.DB.prepare(
        "SELECT event_name FROM app_events WHERE event_name = 'owner_control_delivery_untracked'",
      ).first(),
    ).toEqual({ event_name: "owner_control_delivery_untracked" });
  });

  test("la callback viene chiusa, modifica lo stesso messaggio e resta idempotente", async () => {
    const fetcher = telegramSuccess();
    const payload = callbackUpdate(callbackData({ view: "help" }));
    expect(
      (await handleOwnerControlWebhook(request(payload), controlEnv(), { now: NOW, fetcher }))
        .status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText"]);
    const editBody = bodyAt(fetcher, 1);
    expect(editBody).toMatchObject({ chat_id: CHAT_ID, message_id: 77, rich_message: {} });

    expect(
      (
        await handleOwnerControlWebhook(request(payload), controlEnv(), {
          now: NOW,
          fetcher,
        })
      ).status,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("un ack callback già consumato non blocca il retry della risposta", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "answerCallbackQuery") {
        return Response.json({ ok: false, error_code: 400, description: "QUERY_ID_INVALID" });
      }
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;
    const result = await handleOwnerControlWebhook(
      request(callbackUpdate(callbackData({ view: "help" }), { updateId: 74 })),
      controlEnv(),
      { now: NOW, fetcher },
    );
    expect(result.status).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText"]);
  });

  test("un messaggio non modificabile degrada a un nuovo Rich Message", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "editMessageText") {
        return Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message to edit not found",
        });
      }
      return Response.json({ ok: true, result: { message_id: 88 } });
    }) as unknown as typeof fetch;
    const payload = callbackUpdate(callbackData({ view: "help" }));
    expect(
      (await handleOwnerControlWebhook(request(payload), controlEnv(), { now: NOW, fetcher }))
        .status,
    ).toBe(200);
    expect(methods(fetcher)).toEqual(["answerCallbackQuery", "editMessageText", "sendRichMessage"]);
  });

  test("claim, lease e stato aggregato mantengono i confini D1", async () => {
    const first = await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-1");
    expect(first).toEqual({ acquired: true, token: "token-1" });
    expect(await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-2")).toEqual({
      acquired: false,
      retry: true,
    });
    expect(await finishOwnerControlUpdate(env.DB, 91, "wrong", "processed")).toBe(false);
    expect(await renewOwnerControlClaim(env.DB, 91, "wrong")).toBe(false);
    expect(await renewOwnerControlClaim(env.DB, 91, "token-1", NOW.toISOString())).toBe(true);
    expect(await finishOwnerControlUpdate(env.DB, 91, "token-1", "processed")).toBe(true);
    expect(await claimOwnerControlUpdate(env.DB, 91, "message", NOW, "token-3")).toEqual({
      acquired: false,
      retry: false,
    });

    const defaultClaim = await claimOwnerControlUpdate(env.DB, 92, "message");
    expect(defaultClaim.acquired).toBe(true);

    await writeOwnerControlState(env.DB, "test", { count: 1 }, NOW);
    await writeOwnerControlState(env.DB, "default-time", { count: 2 });
    expect(await readOwnerControlState<{ count: number }>(env.DB, "test")).toMatchObject({
      value: { count: 1 },
    });
    expect(await readOwnerControlState(env.DB, "missing")).toBeNull();
    expect(ownerControlErrorCode(new Error("known_error"))).toBe("known_error");
    expect(ownerControlErrorCode(new Error("Messaggio libero"))).toBe("owner_control_failed");
    expect(ownerControlErrorCode("errore")).toBe("owner_control_failed");
  });
});

describe("query D1 e run-rate", () => {
  test("normalizza timestamp ISO nelle soglie e nelle finestre statistiche", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO owner_notifications
           (dedupe_key, notification_kind, shop_domain, subject, body_text,
            source_occurred_at, status, available_at, sent_at, created_at, updated_at)
         VALUES
           ('stale-same-day', 'operational', NULL, 'A', 'A',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('stale-boundary', 'operational', NULL, 'B', 'B',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('stale-midnight', 'operational', NULL, 'C', 'C',
            strftime('%Y-%m-%dT00:00:00.000Z', 'now', '-1 day'), 'pending',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
            strftime('%Y-%m-%dT00:00:00.000Z', 'now', '-1 day'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           ('sent-window', 'operational', NULL, 'D', 'D',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'), 'sent',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days', '+1 second'),
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      ),
      env.DB.prepare(
        `INSERT INTO app_events (event_name, event_class, occurred_at)
         VALUES ('iso_same_day_error', 'error', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
         VALUES ('iso-boundary-webhook', 'APP_UNINSTALLED', 'processing',
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'))`,
      ),
    ]);

    expect(await readIssues(env.DB)).toMatchObject({
      notifications: { stale: 3 },
      webhooks: { stale: 1 },
    });
    expect(await readNotificationStatus(env.DB)).toMatchObject({ sent_7d: 1 });
    expect(await readErrors(env.DB)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: "iso_same_day_error", count: 1 }),
      ]),
    );
  });

  test("calcola dashboard, filtri e run-rate dal catalogo canonico", async () => {
    await insertStore(1, "mensile.myshopify.com", {
      onboarding: "completed",
      validation: 1,
      plan: ["active", "monthly", "balanced"],
      country: "IT",
    });
    await insertStore(2, "annuale.myshopify.com", {
      validation: 1,
      plan: ["active", "annual", "launch"],
    });
    await insertStore(3, "unico.myshopify.com", {
      plan: ["active", "one_time", "balanced"],
      country: "IT",
    });
    await insertStore(4, "ending.myshopify.com", {
      error: "sync_failed",
      plan: ["ending", "monthly", "balanced"],
    });
    await insertStore(5, "omaggio.myshopify.com", { complimentary: true });
    await insertStore(6, "trial.myshopify.com", { trial: true });

    const dashboard = await readDashboard(env.DB);
    expect(dashboard).toMatchObject({
      active_shops: 6,
      onboarding_completed: 1,
      validation_active: 2,
      shops_with_error: 1,
      trials_active: 1,
      monthly: 1,
      annual: 1,
      one_time: 1,
      complimentary: 1,
      ending: 1,
    });

    const billing = await readBilling(env.DB);
    expect(billing.complimentary).toBe(1);
    expect(billing.trials).toBe(1);
    expect(billing.mrr).toBeCloseTo(3.99 + 29.9 / 12, 8);
    expect(billing.arr).toBeCloseTo(3.99 * 12 + 29.9, 8);
    // Mensile italiano: 2,9% di elaborazione e 3% regolamentare; annuale senza Paese: solo 2,9%.
    expect(billing.netMrr).toBeCloseTo(3.99 * 0.941 + (29.9 / 12) * 0.971, 8);
    expect(billing.netArr).toBeCloseTo(3.99 * 12 * 0.941 + 29.9 * 0.971, 8);
    expect(billing.regulatoryUnknown).toBe(1);
    expect(billing.shopifyFees).toEqual({
      revenueShare: 0,
      processing: 0.029,
      regulatoryOperating: { IT: 0.03 },
    });
    expect((await readShops(env.DB, "paid", 0)).count).toBe(4);
    expect((await readShops(env.DB, "issues", 0)).shops.map((shop) => shop.id)).toEqual([4]);
    expect((await readTrials(env.DB, 0)).count).toBe(1);
    expect((await findShops(env.DB, "mensile")).map((shop) => shop.id)).toEqual([1]);
  });

  test("mostra soltanto webhook ancora da verificare", async () => {
    await insertStore(1, "recuperato.myshopify.com");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
         VALUES ('partner_events_polled_at', datetime('now'), datetime('now'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
         VALUES ('failed-recovered', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'failed',
                 datetime('now', '-20 minutes'), datetime('now', '-19 minutes'),
                 'queue_retries_exhausted')`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at)
         VALUES ('recovery', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'processed',
                 datetime('now', '-10 minutes'), datetime('now', '-9 minutes'))`,
      ),
      env.DB.prepare(
        `INSERT INTO webhook_events
           (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
         VALUES ('failed-redacted', NULL, 'SHOP_UPDATE', 'failed',
                 datetime('now', '-20 minutes'), datetime('now', '-19 minutes'),
                 'queue_retries_exhausted')`,
      ),
    ]);

    expect(await readDashboard(env.DB)).toMatchObject({
      open_issues: 0,
      unresolved_webhooks: 0,
    });
    expect(await readIssues(env.DB)).toMatchObject({ webhooks: { unresolved: 0, stale: 0 } });
    expect(await readHealth(env.DB)).toMatchObject({ webhooks: { unresolved: 0, stale: 0 } });

    await env.DB.prepare(
      `INSERT INTO webhook_events
         (webhook_id, shop_domain, topic, status, received_at, processed_at, error_code)
       VALUES ('failed-open', 'recuperato.myshopify.com', 'SHOP_UPDATE', 'failed',
               datetime('now', '-5 minutes'), datetime('now', '-4 minutes'),
               'queue_retries_exhausted')`,
    ).run();

    expect(await readDashboard(env.DB)).toMatchObject({
      open_issues: 1,
      unresolved_webhooks: 1,
    });
  });

  test("apre, deduplica e risolve gli incidenti webhook e Partner", async () => {
    const stale = new Date(NOW.getTime() - 20 * 60_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO webhook_events (webhook_id, topic, status, received_at)
         VALUES ('blocked-webhook', 'APP_UNINSTALLED', 'processing', ?)`,
      ).bind(stale),
      env.DB.prepare(
        `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
         VALUES ('partner_events_polled_at', ?, ?)`,
      ).bind(stale, stale),
    ]);

    await reconcileOwnerIncidents(env.DB, NOW);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 60_000));

    expect(
      await env.DB.prepare(
        `SELECT subject FROM owner_notifications
            WHERE notification_kind = 'operational' ORDER BY id`,
      ).all(),
    ).toMatchObject({
      results: [
        { subject: "🔴 CF Ready · Webhook bloccati" },
        { subject: "🔴 CF Ready · Acquisizione Partner ferma" },
      ],
    });

    await env.DB.batch([
      env.DB.prepare("DELETE FROM webhook_events WHERE webhook_id = 'blocked-webhook'"),
      env.DB.prepare(
        `UPDATE owner_notification_state SET state_value = 'valore-incompleto'
          WHERE state_key = 'partner_events_polled_at'`,
      ),
    ]);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 2 * 60_000));

    expect(
      await env.DB.prepare(
        "SELECT incident_key, status FROM owner_operational_incidents ORDER BY incident_key",
      ).all(),
    ).toMatchObject({
      results: [
        { incident_key: "partner", status: "active" },
        { incident_key: "webhooks", status: "resolved" },
      ],
    });
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toMatchObject({ subject: "🟢 CF Ready · Webhook ripristinati" });

    await env.DB.prepare(
      `UPDATE owner_notification_state SET state_value = ?
        WHERE state_key = 'partner_events_polled_at'`,
    )
      .bind(new Date(NOW.getTime() + 3 * 60_000).toISOString())
      .run();
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 3 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT status FROM owner_operational_incidents WHERE incident_key = 'partner'",
      ).first(),
    ).toEqual({ status: "resolved" });
  });

  test("segnala solo errori etichette ripetuti e ne notifica la risoluzione", async () => {
    await insertStore(1, "labels-alert.myshopify.com");
    await env.DB.prepare(
      `UPDATE app_state
          SET checkout_labels_mode = 'automatic',
              checkout_labels_last_error_code = 'checkout_labels_partial_sync'
        WHERE shop_id = 1`,
    ).run();

    await reconcileOwnerIncidents(env.DB, NOW);
    await reconcileOwnerIncidents(env.DB, new Date(NOW.getTime() + 5 * 60_000));
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM owner_notifications").first("count"),
    ).toBe(0);

    const persistentAt = new Date(NOW.getTime() + CHECKOUT_LABEL_OBSERVATION_MINUTES * 60_000);
    await reconcileOwnerIncidents(env.DB, persistentAt);
    await reconcileOwnerIncidents(env.DB, new Date(persistentAt.getTime() + 5 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT subject, shop_domain FROM owner_notifications ORDER BY id",
      ).all(),
    ).toMatchObject({
      results: [
        {
          subject: "🔴 CF Ready · Sincronizzazione etichette in errore",
          shop_domain: "labels-alert.myshopify.com",
        },
      ],
    });

    await env.DB.prepare(
      "UPDATE app_state SET checkout_labels_last_error_code = NULL WHERE shop_id = 1",
    ).run();
    await reconcileOwnerIncidents(env.DB, new Date(persistentAt.getTime() + 10 * 60_000));
    expect(
      await env.DB.prepare(
        "SELECT subject FROM owner_notifications ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toMatchObject({ subject: "🟢 CF Ready · Sincronizzazione etichette ripristinata" });
  });

  test("renderizza tutte le viste, apre gli store e confronta le versioni osservate", async () => {
    await insertStore(1, "dashboard.myshopify.com", {
      onboarding: "completed",
      validation: 1,
      plan: ["active", "monthly", "balanced"],
      trial: true,
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         VALUES (1, 'rules_saved', 'validation', '2026-09-08T10:00:00.000Z')`,
      ),
      env.DB.prepare(
        `INSERT INTO performance_samples
           (shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at)
         VALUES (1, 'old-lcp', 'LCP', 1000, '1.5.3', 'home', '2026-09-07T10:00:00.000Z')`,
      ),
      env.DB.prepare(
        `INSERT INTO performance_samples
           (shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at)
         VALUES (1, 'new-lcp', 'LCP', 1300, '1.5.4', 'home', '2026-09-08T10:00:00.000Z')`,
      ),
    ]);

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target.endsWith("/getWebhookInfo")) {
        return Response.json({
          ok: true,
          result: {
            url: "https://cf-ready-prod.test/internal/telegram/webhook",
            pending_update_count: 1,
          },
        });
      }
      return growthResponse([], false);
    }) as unknown as typeof fetch;
    const actions: OwnerControlAction[] = [
      { view: "dashboard" },
      { view: "shops", filter: "all" },
      { view: "shops" },
      { view: "shop", shopId: 1 },
      { view: "shop", argument: "dashboard" },
      { view: "shop" },
      { view: "growth" },
      { view: "billing" },
      { view: "trials" },
      { view: "funnel" },
      { view: "issues" },
      { view: "errors" },
      { view: "notifications" },
      { view: "activity" },
      { view: "health" },
      { view: "performance" },
      { view: "version" },
      { view: "help" },
    ];
    let health = "";
    for (const action of actions) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const message = await renderOwnerControlAction(env.DB, action, controlConfig(), {
        now: NOW,
        fetcher,
      });
      if (action.view === "health") health = JSON.stringify(message);
      expect(message.richMessage.blocks.length).toBeGreaterThan(1);
      for (const row of message.replyMarkup?.inline_keyboard ?? []) {
        for (const button of row)
          expect(new TextEncoder().encode(button.callback_data).byteLength).toBeLessThanOrEqual(64);
      }
    }
    expect(health).toContain("Attivo · nessun arretrato");

    const shops = await renderOwnerControlAction(
      env.DB,
      { view: "shops", filter: "all" },
      controlConfig(),
      { now: NOW, fetcher },
    );
    expect(
      shops.replyMarkup?.inline_keyboard.flat().some(({ text }) => text.includes("Dashboard")),
    ).toBe(true);
    expect(
      shops.replyMarkup?.inline_keyboard
        .flat()
        .some(({ callback_data }) => callback_data.startsWith("oc1:o:")),
    ).toBe(true);

    await expect(
      renderOwnerControlAction(env.DB, { view: "shop", shopId: 999 }, controlConfig()),
    ).resolves.toBeTruthy();
    await expect(
      renderOwnerControlAction(env.DB, { view: "shop", argument: "assente" }, controlConfig()),
    ).resolves.toBeTruthy();
    await insertStore(2, "dashboard-due.myshopify.com");
    const matches = await renderOwnerControlAction(
      env.DB,
      { view: "shop", argument: "dashboard" },
      controlConfig(),
    );
    expect(matches.replyMarkup?.inline_keyboard).toHaveLength(2);

    const development = controlConfig();
    development.environment = "development";
    delete development.versionMetadata;
    await expect(
      renderOwnerControlAction(env.DB, { view: "version" }, development),
    ).resolves.toBeTruthy();
    const custom = controlConfig();
    custom.environment = "preview";
    await expect(
      renderOwnerControlAction(env.DB, { view: "version" }, custom),
    ).resolves.toBeTruthy();

    const cachedHealth = vi.fn(() =>
      Promise.reject(new Error("non chiamare")),
    ) as unknown as typeof fetch;
    await expect(
      renderOwnerControlAction(env.DB, { view: "health", refresh: true }, controlConfig(), {
        now: new Date(NOW.getTime() + 60_000),
        fetcher: cachedHealth,
      }),
    ).resolves.toBeTruthy();
    expect(cachedHealth).not.toHaveBeenCalled();

    await env.DB.prepare("DELETE FROM owner_control_state").run();
    const unavailable = vi.fn(() =>
      Promise.reject(new Error("provider non disponibile")),
    ) as unknown as typeof fetch;
    await expect(
      renderOwnerControlAction(env.DB, { view: "dashboard" }, controlConfig(), {
        now: new Date(NOW.getTime() + 20 * 60_000),
        fetcher: unavailable,
      }),
    ).resolves.toBeTruthy();
    await expect(
      renderOwnerControlAction(env.DB, { view: "health" }, controlConfig(), {
        now: new Date(NOW.getTime() + 20 * 60_000),
        fetcher: unavailable,
      }),
    ).resolves.toBeTruthy();

    const performance = await readPerformance(env.DB);
    expect(performance.comparison).toMatchObject({
      previous_version: "1.5.3",
      current_version: "1.5.4",
      alerts: [],
    });
  });
});

describe("Growth Partner", () => {
  test("usa i default runtime con una risposta Partner vuota", async () => {
    const fetcher = vi.fn(async () => growthResponse([], false));
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(readGrowthReport(env.DB, PARTNER)).resolves.toMatchObject({
        days7: { RELATIONSHIP_INSTALLED: 0 },
      });
      await expect(fetchGrowthReport(PARTNER)).resolves.toMatchObject({
        days28: { RELATIONSHIP_UNINSTALLED: 0 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("pagina eventi, separa 7/28 giorni e riusa cache e cooldown", async () => {
    const responses = [
      growthResponse(
        [{ cursor: "c1", node: growthEvent("RELATIONSHIP_INSTALLED", "2026-08-20T12:00:00.000Z") }],
        true,
      ),
      growthResponse(
        [
          {
            cursor: "c2",
            node: growthEvent("RELATIONSHIP_UNINSTALLED", "2026-09-07T12:00:00.000Z"),
          },
          {
            cursor: "c3",
            node: growthEvent("RELATIONSHIP_REACTIVATED", "2026-09-06T12:00:00.000Z"),
          },
        ],
        false,
      ),
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    const report = await readGrowthReport(env.DB, PARTNER, { now: NOW, fetcher });
    expect(report.days28).toMatchObject({
      RELATIONSHIP_INSTALLED: 1,
      RELATIONSHIP_REACTIVATED: 1,
      RELATIONSHIP_UNINSTALLED: 1,
    });
    expect(report.days7).toMatchObject({
      RELATIONSHIP_INSTALLED: 0,
      RELATIONSHIP_REACTIVATED: 1,
      RELATIONSHIP_UNINSTALLED: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    const cached = await readGrowthReport(env.DB, PARTNER, {
      now: new Date(NOW.getTime() + 60_000),
      force: true,
      fetcher: vi.fn(() => Promise.reject(new Error("non chiamare"))),
    });
    expect(cached.days28).toEqual(report.days28);
  });

  test("rifiuta payload ed eventi invalidi e accetta una pagina vuota", async () => {
    await expect(
      fetchGrowthReport(
        PARTNER,
        NOW,
        vi.fn(async () => Response.json({ data: { app: {} } })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow("partner_api_invalid_payload");
    await expect(
      fetchGrowthReport(
        PARTNER,
        NOW,
        vi.fn(async () =>
          growthResponse(
            [{ cursor: "c1", node: growthEvent("UNKNOWN", "2026-09-07T12:00:00.000Z") }],
            false,
          ),
        ) as unknown as typeof fetch,
      ),
    ).rejects.toThrow("partner_api_invalid_growth_event");
    await expect(
      fetchGrowthReport(
        PARTNER,
        NOW,
        vi.fn(async () => growthResponse([], false)) as unknown as typeof fetch,
      ),
    ).resolves.toMatchObject({
      days7: { RELATIONSHIP_INSTALLED: 0, RELATIONSHIP_UNINSTALLED: 0 },
      days28: { RELATIONSHIP_INSTALLED: 0, RELATIONSHIP_UNINSTALLED: 0 },
    });
  });
});

describe("client Telegram condiviso", () => {
  test("invia, modifica, chiude callback e legge il webhook", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const method = String(input).split("/").at(-1);
      if (method === "getWebhookInfo") {
        return Response.json({
          ok: true,
          result: {
            url: "https://cf-ready-prod.test/internal/telegram/webhook",
            pending_update_count: 2,
            last_error_date: 1_788_885_000,
          },
        });
      }
      return Response.json({ ok: true, result: { message_id: 44 } });
    }) as unknown as typeof fetch;
    const client = createTelegramClient({ botToken: BOT_TOKEN, chatId: CHAT_ID }, fetcher);
    expect(await client.sendRichMessage({ blocks: [] })).toBe(44);
    expect(await client.editRichMessage(44, { blocks: [] })).toBe("edited");
    await expect(client.answerCallbackQuery("callback-1")).resolves.toBeUndefined();
    await expect(client.getWebhookInfo()).resolves.toMatchObject({
      configured: true,
      pendingUpdateCount: 2,
    });
    expect(methods(fetcher)).toEqual([
      "sendRichMessage",
      "editMessageText",
      "answerCallbackQuery",
      "getWebhookInfo",
    ]);
  });

  test("tratta not-modified come successo e distingue edit non possibile", async () => {
    const notModified = createTelegramClient(
      { botToken: BOT_TOKEN, chatId: CHAT_ID },
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message is not modified",
        }),
      ) as unknown as typeof fetch,
    );
    await expect(notModified.editRichMessage(1, { blocks: [] })).resolves.toBe("not_modified");

    const notEditable = createTelegramClient(
      { botToken: BOT_TOKEN, chatId: CHAT_ID },
      vi.fn(async () =>
        Response.json({
          ok: false,
          error_code: 400,
          description: "Bad Request: message can't be edited",
        }),
      ) as unknown as typeof fetch,
    );
    await expect(notEditable.editRichMessage(1, { blocks: [] })).rejects.toThrow(
      "telegram_message_not_editable",
    );
  });

  test("stabilizza errori di rete, HTTP, JSON e payload webhook invalidi", async () => {
    const client = (fetcher: typeof fetch) =>
      createTelegramClient({ botToken: BOT_TOKEN, chatId: CHAT_ID }, fetcher);
    await expect(
      client(
        vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      ).sendRichMessage({
        blocks: [],
      }),
    ).rejects.toThrow("telegram_request_failed");
    await expect(
      client(
        vi.fn(async () => Response.json({ ok: false }, { status: 500 })) as unknown as typeof fetch,
      ).sendRichMessage({ blocks: [] }),
    ).rejects.toThrow("telegram_api_failed");
    await expect(
      client(
        vi.fn(async () => new Response("non-json")) as unknown as typeof fetch,
      ).sendRichMessage({
        blocks: [],
      }),
    ).rejects.toThrow("telegram_invalid_response");
    await expect(
      client(
        vi.fn(async () =>
          Response.json({ ok: true, result: { url: 1 } }),
        ) as unknown as typeof fetch,
      ).getWebhookInfo(),
    ).rejects.toThrow("telegram_invalid_response");
  });
});

function messageUpdate(
  text: string,
  options: { updateId?: number; chatId?: number; userId?: number; chatType?: string } = {},
) {
  return {
    update_id: options.updateId ?? 1,
    message: {
      message_id: 10,
      chat: { id: options.chatId ?? Number(CHAT_ID), type: options.chatType ?? "private" },
      from: { id: options.userId ?? Number(OWNER_ID) },
      text,
    },
  };
}

function callbackUpdate(
  data: string,
  options: { updateId?: number; chatId?: number; userId?: number; chatType?: string } = {},
) {
  return {
    update_id: options.updateId ?? 2,
    callback_query: {
      id: `callback-${options.updateId ?? 2}`,
      from: { id: options.userId ?? Number(OWNER_ID) },
      data,
      message: {
        message_id: 77,
        chat: { id: options.chatId ?? Number(CHAT_ID), type: options.chatType ?? "private" },
        from: { id: 999_999 },
      },
    },
  };
}

function request(
  payload: unknown,
  options: {
    method?: string;
    contentType?: string;
    secret?: string;
    body?: BodyInit | null;
  } = {},
) {
  const method = options.method ?? "POST";
  return new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
    method,
    headers: {
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      "x-telegram-bot-api-secret-token": options.secret ?? SECRET,
    },
    ...(options.body === undefined
      ? method === "GET" || method === "HEAD"
        ? {}
        : { body: JSON.stringify(payload) }
      : { body: options.body }),
  });
}

function telegramSuccess() {
  return vi.fn(async () =>
    Response.json({ ok: true, result: { message_id: 88 } }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function methods(fetcher: unknown) {
  const mock = fetcher as ReturnType<typeof vi.fn>;
  return mock.mock.calls.map(([input]) => String(input).split("/").at(-1));
}

function bodyAt(fetcher: unknown, index: number) {
  const mock = fetcher as ReturnType<typeof vi.fn>;
  return JSON.parse(String((mock.mock.calls[index][1] as RequestInit).body));
}

function shopFixture(overrides: Partial<ShopRow> = {}): ShopRow {
  return {
    id: 1,
    shop_domain: "atelier.myshopify.com",
    display_name: "Atelier",
    installation_status: "active",
    installed_at: NOW.toISOString(),
    country_code: "IT",
    onboarding_status: "completed",
    validation_enabled: 1,
    config_schema_version: 1,
    config_hash: "1234567890abcdef",
    validation_state_revision: 2,
    last_sync_at: NOW.toISOString(),
    last_error_code: null,
    trial_status: null,
    trial_ends_at: null,
    entitlement_status: null,
    plan_kind: null,
    pricing_generation: null,
    current_period_end: null,
    complimentary_status: null,
    ...overrides,
  };
}

async function insertStore(
  id: number,
  domain: string,
  options: {
    onboarding?: string;
    validation?: number;
    error?: string;
    plan?: [string, string, string];
    trial?: boolean;
    complimentary?: boolean;
    country?: string;
  } = {},
) {
  const timestamp = "2026-09-01T10:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops
       (id, shop_domain, display_name, installation_status, installed_at, country_code,
        created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  )
    .bind(id, domain, `Store ${id}`, timestamp, options.country ?? null, timestamp, timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO app_state
       (shop_id, validation_enabled, last_error_code, onboarding_status, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      options.validation ?? 0,
      options.error ?? null,
      options.onboarding ?? "not_started",
      timestamp,
    )
    .run();
  if (options.plan) {
    await env.DB.prepare(
      `INSERT INTO billing_accounts
         (shop_id, entitlement_status, plan_kind, pricing_generation, current_period_end,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, '2027-01-01', ?, ?)`,
    )
      .bind(id, ...options.plan, timestamp, timestamp)
      .run();
  }
  if (options.trial) {
    await env.DB.prepare(
      `INSERT INTO trials
         (shop_id, status, eligible_at, started_at, ends_at, pricing_generation, created_at, updated_at)
       VALUES (?, 'active', '2026-09-01', '2026-09-01', '2099-09-20', 'balanced', ?, ?)`,
    )
      .bind(id, timestamp, timestamp)
      .run();
  }
  if (options.complimentary) {
    await env.DB.prepare(
      `INSERT INTO complimentary_entitlements
         (shop_id, status, granted_at, created_at, updated_at)
       VALUES (?, 'active', ?, ?, ?)`,
    )
      .bind(id, timestamp, timestamp, timestamp)
      .run();
  }
}

function growthEvent(type: string, occurredAt: string) {
  return { type, occurredAt };
}

function growthResponse(
  edges: Array<{ cursor: string; node: { type: string; occurredAt: string } }>,
  hasNextPage: boolean,
) {
  return Response.json({ data: { app: { events: { edges, pageInfo: { hasNextPage } } } } });
}

function revenueTransaction(
  typename: string,
  gross: string | null,
  net: string,
  currencyCode = "USD",
) {
  return {
    __typename: typename,
    grossAmount: gross === null ? null : { amount: gross, currencyCode },
    netAmount: { amount: net, currencyCode },
  };
}

function revenueResponse(
  edges: Array<{ cursor: string; node: ReturnType<typeof revenueTransaction> }>,
  hasNextPage: boolean,
) {
  return Response.json({ data: { transactions: { edges, pageInfo: { hasNextPage } } } });
}
