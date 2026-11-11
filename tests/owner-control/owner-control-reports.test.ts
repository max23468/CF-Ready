import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderOwnerControlAction } from "../../app/owner-control/commands.server";
import { readGrowthReport } from "../../app/owner-control/growth.server";
import { readBFSReport, refreshBFSPlans } from "../../app/owner-control/bfs.server";
import { pollBFSPerformance } from "../../app/owner-control/bfs-notifications.server";
import { writeOwnerControlState } from "../../app/owner-control/repository.server";
import { unauthenticated } from "../../app/shopify.server";

import { readRevenueReport, readEuroExchangeRate } from "../../app/owner-control/revenue.server";
import {
  fetchPartnerUninstallEvents,
  readUninstallReport,
} from "../../app/owner-control/uninstalls.server";
import { reviewStoreSql, storeKind } from "../../app/owner-control/review-stores";

import {
  NOW,
  PARTNER,
  growthEvent,
  growthResponse,
  revenueTransaction,
  revenueResponse,
} from "../support/owner-control";
import { controlConfig, insertStore, resetOwnerControl } from "../support/owner-control-db";

beforeEach(resetOwnerControl);
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Piani Shopify e prestazioni BFS", () => {
  const now = new Date("2026-10-10T10:00:00.000Z");
  const adminForPlan = (name = "Basic", partnerDevelopment = false) =>
    vi.fn(async () => ({
      graphql: vi.fn(async (_query: string) =>
        Response.json({
          data: { shop: { plan: { publicDisplayName: name, partnerDevelopment } } },
        }),
      ),
    }));
  const notifications = async () =>
    (
      await env.DB.prepare(
        "SELECT subject, body_text FROM owner_notifications WHERE notification_kind = 'operational' ORDER BY id",
      ).all<{ subject: string; body_text: string }>()
    ).results;
  async function observedStore(id: number) {
    await insertStore(id, `bfs-${id}.myshopify.com`);
    await writeOwnerControlState(
      env.DB,
      `bfs_plan_v1:${id}`,
      {
        classification: "eligible",
        installedAt: "2026-09-01T10:00:00.000Z",
      },
      now,
    );
  }

  test("usa il piano Shopify, esclude sviluppo e mantiene ambigui i piani speciali", async () => {
    await insertStore(1, "bfs-1.myshopify.com");
    const classified = async (plan: unknown) => {
      const report = await refreshBFSPlans(env.DB, {
        now,
        force: true,
        adminForShop: vi.fn(async () => ({
          graphql: vi.fn(async (_query: string) => Response.json({ data: { shop: { plan } } })),
        })),
      });
      await env.DB.prepare("DELETE FROM owner_control_state").run();
      return Object.entries(report).find(
        ([key, count]) =>
          ["eligible", "excluded", "development", "unknown"].includes(key) && count === 1,
      )?.[0];
    };
    const named = (publicDisplayName: string, partnerDevelopment: boolean | null = false) => ({
      publicDisplayName,
      partnerDevelopment,
    });

    for (const name of ["Basic", "Grow", "Advanced", "Plus", "Starter", "Lite"]) {
      expect(await classified(named(name)), name).toBe("eligible");
    }
    for (const name of ["Inactive", "Paused", "Trial", "Plus Trial"]) {
      expect(await classified(named(name)), name).toBe("excluded");
    }
    expect(await classified(named("Development"))).toBe("development");
    expect(await classified(named("Plus", true))).toBe("development");
    expect(await classified(named("Other"))).toBe("unknown");
    expect(await classified(named("Basic", null))).toBe("unknown");
    expect(await classified(null)).toBe("unknown");
  });

  test("include Lifetime, prova e omaggio, aggiorna al massimo tre piani e rispetta cooldown e reinstallazione", async () => {
    await insertStore(1, "bfs-1.myshopify.com", { plan: ["active", "one_time", "balanced"] });
    await insertStore(2, "bfs-2.myshopify.com", { trial: true });
    await insertStore(3, "bfs-3.myshopify.com", { complimentary: true });
    await insertStore(4, "bfs-4.myshopify.com");
    const adminForShop = adminForPlan();
    expect(await refreshBFSPlans(env.DB, { now, adminForShop })).toMatchObject({
      eligible: 3,
      unknown: 1,
    });
    expect(adminForShop).toHaveBeenCalledTimes(3);
    expect(await refreshBFSPlans(env.DB, { now, adminForShop })).toMatchObject({
      eligible: 4,
      unknown: 0,
    });
    await refreshBFSPlans(env.DB, { now, force: true, adminForShop });
    expect(adminForShop).toHaveBeenCalledTimes(4);
    await refreshBFSPlans(env.DB, {
      now: new Date(now.getTime() + 300_000),
      force: true,
      adminForShop,
    });
    expect(adminForShop).toHaveBeenCalledTimes(7);
    await env.DB.prepare("UPDATE shops SET installed_at = ? WHERE id = 1")
      .bind(now.toISOString())
      .run();
    expect(await readBFSReport(env.DB, now)).toMatchObject({ eligible: 1, unknown: 3 });
    await refreshBFSPlans(env.DB, { now: new Date(now.getTime() + 300_000), adminForShop });
    expect(await readBFSReport(env.DB, new Date(now.getTime() + 300_000))).toMatchObject({
      eligible: 4,
    });
    expect(await readBFSReport(env.DB, new Date(now.getTime() + 86_700_000))).toMatchObject({
      unknown: 4,
    });
    await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = 1").run();
    await refreshBFSPlans(env.DB, { now: new Date(now.getTime() + 86_700_000), adminForShop });
    expect(
      await env.DB.prepare(
        "SELECT state_key FROM owner_control_state WHERE state_key = 'bfs_plan_v1:1'",
      ).first(),
    ).toBeNull();
  });

  test("gli errori non contano come zero e si ritentano dopo un'ora", async () => {
    await insertStore(1, "bfs-1.myshopify.com");
    const adminForShop = vi.fn(async () => {
      throw new Error("sessione scaduta");
    });
    expect(await refreshBFSPlans(env.DB, { now, adminForShop })).toMatchObject({ unknown: 1 });
    await refreshBFSPlans(env.DB, { now, force: true, adminForShop });
    expect(adminForShop).toHaveBeenCalledOnce();
    await refreshBFSPlans(env.DB, { now: new Date(now.getTime() + 3_600_000), adminForShop });
    expect(adminForShop).toHaveBeenCalledTimes(2);
  });

  test("cache malformata, timestamp futuri e piani speciali restano da verificare", async () => {
    await observedStore(1);
    await writeOwnerControlState(env.DB, "bfs_plan_v1:1", null, now);
    expect(await readBFSReport(env.DB, now)).toMatchObject({ unknown: 1 });
    await refreshBFSPlans(env.DB, { now, adminForShop: adminForPlan("Other") });
    expect(await readBFSReport(env.DB, now)).toMatchObject({ unknown: 1 });
    const before = new Date(now.getTime() - 1000);
    await refreshBFSPlans(env.DB, { now: before, adminForShop: adminForPlan("Paused") });
    expect(await readBFSReport(env.DB, before)).toMatchObject({ excluded: 1 });
    await env.DB.prepare(
      "UPDATE owner_control_state SET updated_at = 'invalid' WHERE state_key = 'bfs_plan_v1:1'",
    ).run();
    await refreshBFSPlans(env.DB, { now, adminForShop: adminForPlan() });
    expect(await readBFSReport(env.DB, now)).toMatchObject({ eligible: 1 });
  });

  test("il cron usa la sessione offline e legge solo dati di piano", async () => {
    await insertStore(1, "bfs-1.myshopify.com");
    const admin = (await adminForPlan()()).graphql;
    const offline = vi
      .spyOn(unauthenticated, "admin")
      .mockResolvedValue({ admin: { graphql: admin } } as never);
    try {
      expect(await refreshBFSPlans(env.DB)).toMatchObject({ eligible: 1 });
      expect(offline).toHaveBeenCalledWith("bfs-1.myshopify.com");
      expect(admin.mock.calls[0][0]).toContain("partnerDevelopment");
      expect(await readBFSReport(env.DB)).toMatchObject({ unknown: 0 });
    } finally {
      offline.mockRestore();
    }
  });

  test("mostra i piani in dashboard e Performance, senza obiettivo né comandi aggiunti", async () => {
    await observedStore(1);
    await observedStore(2);
    await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = 2").run();
    expect(await readBFSReport(env.DB, now)).toMatchObject({ eligible: 1, unknown: 0 });
    const message = await renderOwnerControlAction(
      env.DB,
      { view: "performance" },
      controlConfig(),
      { now },
    );
    expect(JSON.stringify(message)).toContain("Piani Shopify degli store");
    expect(JSON.stringify(message)).toContain("Lifetime");
    expect(JSON.stringify(message)).not.toMatch(/Obiettivo|\/50|Mancano|Variazione/);
    expect(
      message.replyMarkup?.inline_keyboard.flat().map(({ callback_data }) => callback_data),
    ).toContain("oc1:p:-:0:r");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => growthResponse([], false)),
    );
    const dashboard = await renderOwnerControlAction(
      env.DB,
      { view: "dashboard" },
      controlConfig(),
      { now },
    );
    expect(JSON.stringify(dashboard)).toContain("Piani Shopify");
    expect(JSON.stringify(dashboard)).toContain("1 · Da verificare 0");
    expect(JSON.stringify(dashboard)).not.toMatch(/Obiettivo|\/50|Mancano/);
    const offline = vi.spyOn(unauthenticated, "admin").mockImplementation((async () => ({
      admin: await adminForPlan("Development", true)(),
    })) as never);
    try {
      await renderOwnerControlAction(
        env.DB,
        { view: "performance", refresh: true },
        controlConfig(),
        { now: new Date(now.getTime() + 300_000) },
      );
    } finally {
      offline.mockRestore();
    }
    expect(await readBFSReport(env.DB, new Date(now.getTime() + 300_000))).toMatchObject({
      development: 1,
      eligible: 0,
    });
  });

  async function samples(count: number, values: { LCP: number; CLS: number; INP: number }) {
    await env.DB.prepare("DELETE FROM performance_samples").run();
    const statements = Object.entries(values).flatMap(([metric, value]) =>
      Array.from({ length: count }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO performance_samples (shop_id, metric_id, metric_name, metric_value, app_version, app_route, observed_at)
       VALUES (1, ?, ?, ?, '2.1.4', 'home', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        ).bind(String(index), metric, value),
      ),
    );
    if (statements.length) await env.DB.batch(statements);
  }

  test("notifica p75 fuori soglia, campioni preliminari, conferma e rientro senza duplicare", async () => {
    await observedStore(1);
    await samples(99, { LCP: 2501, CLS: 0.11, INP: 201 });
    await Promise.all([pollBFSPerformance(env.DB, now), pollBFSPerformance(env.DB, now)]);
    expect(await notifications()).toHaveLength(1);
    expect((await notifications())[0].body_text).toContain("Avviso preliminare");
    for (const metric of ["LCP", "CLS", "INP"])
      expect((await notifications())[0].body_text).toContain(metric);
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(1);
    await samples(100, { LCP: 2501, CLS: 0.11, INP: 201 });
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(2);
    expect((await notifications())[1].body_text).toContain("Fuori soglia");
    await samples(99, { LCP: 2501, CLS: 0.11, INP: 201 });
    await pollBFSPerformance(env.DB, now);
    await samples(100, { LCP: 2501, CLS: 0.11, INP: 201 });
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(2);
    await samples(0, { LCP: 0, CLS: 0, INP: 0 });
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(2);
    await samples(100, { LCP: 2500, CLS: 0.1, INP: 200 });
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(3);
    expect((await notifications())[2].body_text).toContain("rientrato");
    await samples(100, { LCP: 2600, CLS: 0.1, INP: 200 });
    await pollBFSPerformance(env.DB, now);
    expect(await notifications()).toHaveLength(4);
    expect((await notifications())[3].body_text).toContain("LCP:");
    expect((await notifications())[3].body_text).not.toContain("CLS:");
  });
});

describe("Ricavi Partner", () => {
  test("legge il cambio JSON senza credenziali, usa la cache e recupera un cambio recente in caso di errore", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ date: "2026-09-08", base: "EUR", quote: "USD", rate: 1.25 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const rate = await readEuroExchangeRate(env.DB, { now: NOW });
    expect(rate).toEqual({ date: "2026-09-08", usdPerEuro: 1.25 });
    expect(fetcher.mock.calls[0]).toEqual([
      "https://api.frankfurter.dev/v2/rate/eur/usd",
      { signal: expect.any(AbortSignal), redirect: "manual" },
    ]);
    await expect(readEuroExchangeRate(env.DB, { now: NOW })).resolves.toEqual(rate);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", unavailable);
    await expect(
      readEuroExchangeRate(env.DB, { now: new Date(NOW.getTime() + 60 * 60 * 1000) }),
    ).resolves.toEqual(rate);
    expect(unavailable).toHaveBeenCalledTimes(1);
    await expect(
      readEuroExchangeRate(env.DB, { now: new Date("2026-09-15T12:00:00Z") }),
    ).rejects.toThrow("exchange_rate_unavailable");
  });

  test("rifiuta cambi mancanti, nulli, scaduti, futuri, date e coppie non valide", async () => {
    for (const payload of [
      null,
      {},
      { date: "2026-09-08", base: "EUR", quote: "USD", rate: 0 },
      { date: "2026-09-01", base: "EUR", quote: "USD", rate: 1.25 },
      { date: "2026-09-09", base: "EUR", quote: "USD", rate: 1.25 },
      { date: "2026-02-31", base: "EUR", quote: "USD", rate: 1.25 },
      { date: "2026-09-08", base: "USD", quote: "EUR", rate: 1.25 },
      { date: "2026-09-08", base: "EUR", quote: "USD", rate: "1.25" },
    ]) {
      vi.stubGlobal("fetch", async () => Response.json(payload));
      await expect(readEuroExchangeRate(env.DB, { now: NOW })).rejects.toThrow(
        "exchange_rate_unavailable",
      );
    }
    vi.stubGlobal("fetch", async () => {
      throw new Error("network_failure");
    });
    await expect(readEuroExchangeRate(env.DB, { now: NOW })).rejects.toThrow(
      "exchange_rate_unavailable",
    );
  });

  test("rifiuta i redirect anche se il body contiene un cambio valido", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ date: "2026-09-08", base: "EUR", quote: "USD", rate: 1.25 }),
          {
            status: 302,
            headers: { Location: "https://example.invalid/redirect" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(readEuroExchangeRate(env.DB, { now: NOW })).rejects.toThrow(
      "exchange_rate_unavailable",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  test("usa i default runtime con una risposta Partner vuota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => revenueResponse([], false)),
    );
    await expect(readRevenueReport(env.DB, PARTNER)).resolves.toMatchObject({
      currency: null,
      totals: { count: 0, grossMinor: 0, netMinor: 0 },
    });
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
    vi.stubGlobal("fetch", fetcher);
    const report = await readRevenueReport(env.DB, PARTNER, { now: NOW });
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

    const notCalled = vi.fn(() => Promise.reject(new Error("non chiamare")));
    vi.stubGlobal("fetch", notCalled);
    const cached = await readRevenueReport(env.DB, PARTNER, {
      now: new Date(NOW.getTime() + 60_000),
      force: true,
    });
    expect(cached.totals).toEqual(report.totals);
    expect(notCalled).not.toHaveBeenCalled();

    const refreshed = vi.fn(async () => revenueResponse([], false));
    vi.stubGlobal("fetch", refreshed);
    await expect(
      readRevenueReport(env.DB, PARTNER, {
        now: new Date(NOW.getTime() + 6 * 60_000),
        force: true,
      }),
    ).resolves.toMatchObject({ currency: null, totals: { count: 0 } });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  test("rifiuta transazioni, valute, cursori e paginazione non validi", async () => {
    const reportFrom = (...pages: Response[]) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => pages.shift()!),
      );
      return readRevenueReport(env.DB, PARTNER, { now: NOW });
    };
    const invalid = { amount: "1.00", currencyCode: "usd" };
    await expect(reportFrom(Response.json({ data: {} }))).rejects.toThrow(
      "partner_api_invalid_payload",
    );
    for (const node of [
      revenueTransaction("ThemeSale", "1.00", "1.00"),
      revenueTransaction("AppOneTimeSale", "1.00", "uno"),
      { ...revenueTransaction("AppOneTimeSale", "1.00", "1.00"), grossAmount: invalid },
    ]) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await expect(reportFrom(revenueResponse([{ cursor: "t1", node }], false))).rejects.toThrow(
        "partner_api_invalid_transaction",
      );
    }
    await expect(
      reportFrom(
        revenueResponse(
          [
            { cursor: "t1", node: revenueTransaction("AppOneTimeSale", "1.00", "0.94") },
            { cursor: "t2", node: revenueTransaction("AppOneTimeSale", "1.00", "0.94", "EUR") },
          ],
          false,
        ),
      ),
    ).rejects.toThrow("partner_api_mixed_currency");
    await expect(reportFrom(revenueResponse([], true))).rejects.toThrow(
      "partner_api_invalid_cursor",
    );
    const sale = revenueTransaction("AppSubscriptionSale", "3.47", "3.27");
    await expect(
      reportFrom(
        revenueResponse([{ cursor: "t1", node: sale }], true),
        revenueResponse([{ cursor: "t1", node: sale }], true),
      ),
    ).rejects.toThrow("partner_api_invalid_cursor");
    let page = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => revenueResponse([{ cursor: `t${(page += 1)}`, node: sale }], true)),
    );
    await expect(readRevenueReport(env.DB, PARTNER, { now: NOW })).rejects.toThrow(
      "partner_api_page_limit",
    );
  });

  test("mostra i ricavi nella vista billing e degrada senza permesso", async () => {
    await insertStore(1, "pagamento.myshopify.com", {
      plan: ["active", "one_time", "balanced"],
    });
    await env.DB.prepare(
      `UPDATE billing_accounts
          SET shopify_charge_gid = 'gid://shopify/AppPurchaseOneTime/1'
        WHERE shop_id = 1`,
    ).run();
    const responses = [
      Response.json({
        data: { transactions: { edges: [], pageInfo: { hasNextPage: false } } },
      }),
      revenueResponse(
        [{ cursor: "t1", node: revenueTransaction("AppOneTimeSale", "104.53", "98.36") }],
        false,
      ),
    ];
    const uninstalls = vi.fn(async () =>
      Response.json({
        data: {
          app: {
            events: {
              edges: [
                uninstallEdge("u1", "2026-08-01T12:00:00.000Z", "gid://shopify/Shop/1"),
                uninstallEdge("u2", "2026-09-07T12:00:00.000Z", "gid://shopify/Shop/1"),
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      }),
    );
    const sale = vi.fn(async () => responses.shift()!);
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://api.frankfurter.dev/")
        ? Response.json({ date: "2026-09-08", base: "EUR", quote: "USD", rate: 1.25 })
        : String(init?.body).includes("OwnerControlUninstalls")
          ? uninstalls()
          : sale()) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);
    const billing = await renderOwnerControlAction(
      env.DB,
      { view: "billing", refresh: true },
      controlConfig(),
      { now: NOW },
    );
    expect(JSON.stringify(billing)).toMatch(/78,29\s€/);
    expect(JSON.stringify(billing)).toContain("In attesa della transazione Shopify");
    expect(JSON.stringify(billing)).toContain("2 · 1 store · 1 negli ultimi 28 gg");
    expect(sale).toHaveBeenCalledTimes(2);
    expect(uninstalls).toHaveBeenCalledTimes(1);

    await env.DB.prepare("DELETE FROM owner_control_state").run();
    const denied = vi.fn(async () => Response.json({ errors: [{ message: "Access denied" }] }));
    vi.stubGlobal("fetch", denied);
    const withoutAccess = await renderOwnerControlAction(
      env.DB,
      { view: "billing" },
      controlConfig(),
      { now: NOW },
    );
    expect(JSON.stringify(withoutAccess)).toContain("serve il permesso View financials");
    expect(JSON.stringify(withoutAccess)).toContain("MRR");
    expect(JSON.stringify(withoutAccess)).toContain("Partner non disponibile");

    const refreshWithoutAccess = await renderOwnerControlAction(
      env.DB,
      { view: "billing", refresh: true },
      controlConfig(),
      { now: NOW },
    );
    const refreshText = JSON.stringify(refreshWithoutAccess);
    expect(refreshText).toContain("Aggiornamento");
    expect(refreshText).toContain("Non riuscito (partner_api_graphql_error)");
  });
});

function uninstallEdge(
  cursor: string,
  occurredAt: string,
  shopId: string,
  shop: { name?: string; myshopifyDomain?: string } = {},
  feedback: { reason?: string; description?: string } = {},
) {
  return {
    cursor,
    node: {
      type: "RELATIONSHIP_UNINSTALLED",
      occurredAt,
      shop: { id: shopId, ...shop },
      ...feedback,
    },
  };
}

describe("Growth Partner", () => {
  test("usa i default runtime con una risposta Partner vuota", async () => {
    const fetcher = vi.fn(async () => growthResponse([], false));
    vi.stubGlobal("fetch", fetcher);
    await expect(readGrowthReport(env.DB, PARTNER)).resolves.toMatchObject({
      days7: { RELATIONSHIP_INSTALLED: 0 },
      days28: { RELATIONSHIP_UNINSTALLED: 0 },
    });
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
    vi.stubGlobal("fetch", fetcher);
    const report = await readGrowthReport(env.DB, PARTNER, { now: NOW });
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

    const notCalled = vi.fn(() => Promise.reject(new Error("non chiamare")));
    vi.stubGlobal("fetch", notCalled);
    const cached = await readGrowthReport(env.DB, PARTNER, {
      now: new Date(NOW.getTime() + 60_000),
      force: true,
    });
    expect(cached.days28).toEqual(report.days28);
    expect(notCalled).not.toHaveBeenCalled();
  });

  test("rifiuta payload ed eventi invalidi e accetta una pagina vuota", async () => {
    const reportFrom = (response: () => Response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      return readGrowthReport(env.DB, PARTNER, { now: NOW });
    };
    await expect(reportFrom(() => Response.json({ data: { app: {} } }))).rejects.toThrow(
      "partner_api_invalid_payload",
    );
    await expect(
      reportFrom(() =>
        growthResponse(
          [{ cursor: "c1", node: growthEvent("UNKNOWN", "2026-09-07T12:00:00.000Z") }],
          false,
        ),
      ),
    ).rejects.toThrow("partner_api_invalid_growth_event");
    await expect(reportFrom(() => growthResponse([], false))).resolves.toMatchObject({
      days7: { RELATIONSHIP_INSTALLED: 0, RELATIONSHIP_UNINSTALLED: 0 },
      days28: { RELATIONSHIP_INSTALLED: 0, RELATIONSHIP_UNINSTALLED: 0 },
    });
  });
});

describe("Disinstallazioni Partner", () => {
  const page = (edges: unknown[], hasNextPage: boolean) =>
    Response.json({ data: { app: { events: { edges, pageInfo: { hasNextPage } } } } });

  test("separa merchant e review dal lancio, conta 28 giorni e riusa la cache", async () => {
    const responses = [
      page(
        [
          uninstallEdge("u1", "2026-08-01T12:00:00.000Z", "gid://shopify/Shop/1", {
            name: "Atelier",
          }),
          uninstallEdge("r1", "2026-09-02T12:00:00.000Z", "gid://shopify/Shop/9", {
            name: "app-review-c0d01c8a-r84307-a0-victim",
          }),
        ],
        true,
      ),
      page(
        [
          uninstallEdge("u2", "2026-09-01T12:00:00.000Z", "gid://shopify/Shop/2"),
          uninstallEdge("u3", "2026-09-07T12:00:00.000Z", "gid://shopify/Shop/1"),
          uninstallEdge("r2", "2026-09-06T12:00:00.000Z", "gid://shopify/Shop/8", {
            name: "CF Ready Dev",
            myshopifyDomain: "cf-ready-dev.myshopify.com",
          }),
        ],
        false,
      ),
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetcher);
    const report = await readUninstallReport(env.DB, PARTNER, { now: NOW });
    expect(report.partner).toMatchObject({
      merchant: { total: 3, stores: 2, days28: 2 },
      review: 2,
    });
    expect(report.local).toMatchObject({ total: expect.any(Number), review: expect.any(Number) });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const variables = JSON.parse(
      String((fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1].body),
    ).variables;
    expect(variables.occurredAtMin).toBe("2026-07-28T00:00:00.000Z");
    const cache = JSON.stringify(
      await env.DB.prepare("SELECT state_value FROM owner_control_state").all(),
    );
    expect(cache).not.toContain("gid://");
    expect(cache).not.toContain("Atelier");

    const notCalled = vi.fn(() => Promise.reject(new Error("non chiamare")));
    vi.stubGlobal("fetch", notCalled);
    const cached = await readUninstallReport(env.DB, PARTNER, {
      now: new Date(NOW.getTime() + 60_000),
      force: true,
    });
    expect(cached.partner).toMatchObject({ review: 2 });
    expect(notCalled).not.toHaveBeenCalled();
  });

  test("degrada a contatore locale e rifiuta payload, eventi e cursori invalidi", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ data: { app: {} } }));
    const failed = await readUninstallReport(env.DB, PARTNER, { now: NOW });
    expect(failed.partner).toEqual({ unavailable: "partner_api_invalid_payload" });

    const fetchWith = (response: () => Response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      return fetchPartnerUninstallEvents(PARTNER, NOW);
    };
    await expect(
      fetchWith(() => page([uninstallEdge("u1", "data", "gid://shopify/Shop/1")], false)),
    ).rejects.toThrow("partner_api_invalid_uninstall_event");
    await expect(
      fetchWith(() =>
        page(
          [
            {
              cursor: "u1",
              node: { type: "RELATIONSHIP_UNINSTALLED", occurredAt: "2026-09-01T00:00:00.000Z" },
            },
          ],
          false,
        ),
      ),
    ).rejects.toThrow("partner_api_invalid_uninstall_event");
    await expect(
      fetchWith(() =>
        page([uninstallEdge("", "2026-09-01T00:00:00.000Z", "gid://shopify/Shop/1")], true),
      ),
    ).rejects.toThrow("partner_api_invalid_cursor");
    let cursor = 0;
    await expect(
      fetchWith(() => {
        cursor += 1;
        return page(
          [uninstallEdge(`u${cursor}`, "2026-09-01T00:00:00.000Z", "gid://shopify/Shop/1")],
          true,
        );
      }),
    ).rejects.toThrow("partner_api_page_limit");
    await expect(fetchWith(() => page([], false))).resolves.toEqual([]);
    await expect(
      fetchWith(() =>
        page(
          [
            uninstallEdge(
              "u1",
              "2026-09-01T00:00:00.000Z",
              "gid://shopify/Shop/1",
              { name: "  ", myshopifyDomain: "atelier.myshopify.com" },
              { reason: "Altro", description: "  " },
            ),
          ],
          false,
        ),
      ),
    ).resolves.toEqual([
      {
        occurredAt: "2026-09-01T00:00:00.000Z",
        shopId: "gid://shopify/Shop/1",
        name: null,
        domain: "atelier.myshopify.com",
        reason: "Altro",
        description: null,
        kind: "merchant",
      },
    ]);
  });

  test("usa i default runtime", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([], false)),
    );
    await expect(readUninstallReport(env.DB, PARTNER)).resolves.toMatchObject({
      partner: { merchant: { total: 0 }, review: 0 },
    });
    await expect(fetchPartnerUninstallEvents(PARTNER)).resolves.toEqual([]);
  });

  test("la vista elenca dal vivo merchant e review con lo storico anonimo", async () => {
    await env.DB.prepare(
      `INSERT INTO uninstall_history (
         uninstalled_on, installed_days, store_kind, billing_category,
         validation_enabled, onboarding_completed
       ) VALUES ('2026-09-01', 4, 'merchant', 'monthly', 1, 1),
                ('2026-09-02', 10, 'merchant', 'trial_expired', 0, 1),
                ('2026-09-03', 0, 'review', 'trial_never', 0, 0)`,
    ).run();
    const fetcher = vi.fn(async () =>
      page(
        [
          uninstallEdge(
            "u1",
            "2026-09-07T12:00:00.000Z",
            "gid://shopify/Shop/1",
            { name: "Atelier", myshopifyDomain: "atelier.myshopify.com" },
            { reason: "Non sto usando l'app al momento", description: "x".repeat(120) },
          ),
          uninstallEdge("r1", "2026-09-03T12:00:00.000Z", "gid://shopify/Shop/9", {
            name: "REDACTED",
          }),
        ],
        false,
      ),
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);
    const message = await renderOwnerControlAction(
      env.DB,
      { view: "uninstalls" },
      controlConfig(),
      { now: NOW },
    );
    const text = JSON.stringify(message);
    expect(text).toContain("🏪 Merchant · 1");
    expect(text).toContain("atelier.myshopify.com · Non sto usando l'app al momento: xxx");
    expect(text).toContain("…");
    expect(text).toContain("🧪 Review e interni · 1");
    expect(text).toContain("dominio non disponibile");
    expect(text).toContain('"Merchant"},"is_header":true},{"text":"2"');
    expect(text).toContain("1 · 1 mensile");
    expect(text).toContain("7 giorni");
    expect(text).toContain('"Review e interni"},"is_header":true},{"text":"1"');
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM owner_control_state WHERE state_value LIKE '%Atelier%'",
      ).first("n"),
    ).toBe(0);

    await env.DB.prepare("DELETE FROM uninstall_history").run();
    vi.stubGlobal("fetch", async () => Response.json({ data: { app: {} } }));
    const offline = JSON.stringify(
      await renderOwnerControlAction(env.DB, { view: "uninstalls" }, controlConfig(), {
        now: NOW,
      }),
    );
    expect(offline).toContain("Partner API non disponibile (partner_api_invalid_payload)");
    expect(offline).toContain('"Durata media"},"is_header":true},{"text":"—"');
    vi.stubGlobal("fetch", async () => page([], false));
    const empty = JSON.stringify(
      await renderOwnerControlAction(env.DB, { view: "uninstalls" }, controlConfig(), {
        now: NOW,
      }),
    );
    expect(empty).toContain("Nessuna disinstallazione");
  });
});

describe("Store di review", () => {
  test("JS e SQL applicano lo stesso criterio dedotto dalle review osservate", async () => {
    const cases: Array<[string | null, string | null, number, "merchant" | "review"]> = [
      ["app-review-c0d01c8a-r130169-a0-primary", null, 0, "review"],
      ["APP-REVIEW-c0d01c8a-r84307-a0-victim", null, 0, "review"],
      ["REDACTED", null, 0, "review"],
      ["appstoretest9", "uvszh1-m5.myshopify.com", 0, "review"],
      ["apdevplusstaging1", "apdevplusstaging1.myshopify.com", 0, "review"],
      ["Alpha", "asa5ve-kz.myshopify.com", 0, "review"],
      ["CF Ready Dev", "cf-ready-dev.myshopify.com", 0, "review"],
      [null, "app-review-x.myshopify.com", 0, "review"],
      ["Negozio qualsiasi", "negozio.myshopify.com", 1, "review"],
      ["Mirtilla Bio", "mirtilla-bio.myshopify.com", 0, "merchant"],
      ["Happy Reviews", "happy-reviews.myshopify.com", 0, "merchant"],
      ["Redacted Studio", null, 0, "merchant"],
      [null, null, 0, "merchant"],
    ];
    for (const [name, domain, development, kind] of cases) {
      expect(storeKind({ name, domain, development: development === 1 })).toBe(kind);
      const row = await env.DB.prepare(
        `SELECT CASE WHEN ${reviewStoreSql("?1", "?2", "?3")} THEN 'review' ELSE 'merchant' END AS kind`,
      )
        .bind(name, domain, development)
        .first<{ kind: string }>();
      expect(row?.kind, `${name} ${domain}`).toBe(kind);
    }
  });
});
