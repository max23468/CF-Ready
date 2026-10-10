import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderOwnerControlAction } from "../app/owner-control/commands.server";
import { fetchGrowthReport, readGrowthReport } from "../app/owner-control/growth.server";
import { classifyBFSPlan, readBFSReport, refreshBFSPlans } from "../app/owner-control/bfs.server";
import { pollBFSPerformance, pollBFSProgress } from "../app/owner-control/bfs-notifications.server";
import { writeOwnerControlState } from "../app/owner-control/repository.server";
import { unauthenticated } from "../app/shopify.server";

import { fetchRevenueReport, readRevenueReport } from "../app/owner-control/revenue.server";

import {
  NOW,
  PARTNER,
  growthEvent,
  growthResponse,
  revenueTransaction,
  revenueResponse,
} from "./support/owner-control";
import { controlConfig, insertStore, resetOwnerControl } from "./support/owner-control-db";

beforeEach(resetOwnerControl);

describe("Obiettivo BFS", () => {
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

  test("usa il piano Shopify, esclude sviluppo e mantiene ambigui i piani speciali", () => {
    for (const name of ["Basic", "Grow", "Advanced", "Plus", "Starter", "Lite"]) {
      expect(classifyBFSPlan({ name, partnerDevelopment: false })).toBe("eligible");
    }
    for (const name of ["Inactive", "Paused", "Trial", "Plus Trial"]) {
      expect(classifyBFSPlan({ name, partnerDevelopment: false })).toBe("excluded");
    }
    expect(classifyBFSPlan({ name: "Development", partnerDevelopment: false })).toBe("development");
    expect(classifyBFSPlan({ name: "Plus", partnerDevelopment: true })).toBe("development");
    expect(classifyBFSPlan({ name: "Other", partnerDevelopment: false })).toBe("unknown");
    expect(classifyBFSPlan({ name: "Basic", partnerDevelopment: null })).toBe("unknown");
    expect(classifyBFSPlan(null)).toBe("unknown");
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
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toEqual([]);
  });

  test("mostra la variazione a sette giorni solo con snapshot e letture complete", async () => {
    await observedStore(1);
    await pollBFSProgress(env.DB, now);
    const later = new Date(now.getTime() + 7 * 86_400_000);
    await refreshBFSPlans(env.DB, { now: later, adminForShop: adminForPlan() });
    expect(await readBFSReport(env.DB, later)).toMatchObject({ days7: 0 });
    await insertStore(2, "bfs-2.myshopify.com");
    expect(await readBFSReport(env.DB, later)).toMatchObject({ days7: null, unknown: 1 });
    await refreshBFSPlans(env.DB, { now: later, adminForShop: adminForPlan() });
    await pollBFSProgress(env.DB, later);
    expect(await readBFSReport(env.DB, later)).toMatchObject({ days7: 1 });
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

  test("un errore outbox non perde il traguardo e il retry crea una sola notifica", async () => {
    await observedStore(1);
    await pollBFSProgress(env.DB, now);
    for (let id = 2; id <= 6; id++) await observedStore(id);
    await env.DB.prepare(
      "CREATE TRIGGER fail_bfs_outbox BEFORE INSERT ON owner_notifications BEGIN SELECT RAISE(ABORT, 'test outbox failure'); END",
    ).run();
    try {
      await expect(pollBFSProgress(env.DB, now)).rejects.toThrow("test outbox failure");
      const state = await env.DB.prepare(
        "SELECT state_value FROM owner_control_state WHERE state_key = 'bfs_progress_v1'",
      ).first<{ state_value: string }>();
      expect(JSON.parse(state!.state_value).notified).toBe(1);
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_bfs_outbox").run();
    }
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toHaveLength(1);
  });

  test("avvisa ogni cinque dalla baseline, raggruppa salti e non ripete store persi e recuperati", async () => {
    await observedStore(1);
    await observedStore(2);
    await pollBFSProgress(env.DB, now);
    for (let id = 3; id <= 6; id++) await observedStore(id);
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toHaveLength(0);
    await observedStore(7);
    await Promise.all([pollBFSProgress(env.DB, now), pollBFSProgress(env.DB, now)]);
    expect(await notifications()).toHaveLength(1);
    expect((await notifications())[0].body_text).toContain("Store stimati: 7/50");
    for (let id = 8; id <= 19; id++) await observedStore(id);
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toHaveLength(2);
    await env.DB.prepare(
      "UPDATE shops SET installation_status = 'uninstalled' WHERE id > 10",
    ).run();
    await pollBFSProgress(env.DB, now);
    await env.DB.prepare("UPDATE shops SET installation_status = 'active' WHERE id > 10").run();
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toHaveLength(2);
    for (let id = 20; id <= 50; id++) await observedStore(id);
    await pollBFSProgress(env.DB, now);
    await pollBFSProgress(env.DB, now);
    expect(await notifications()).toHaveLength(3);
    expect((await notifications())[2].subject).toContain("50 store");
    await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE id = 1").run();
    expect(await readBFSReport(env.DB, now)).toMatchObject({ eligible: 49 });
  });

  test("mostra il monitor in dashboard e Performance, senza aggiungere comandi", async () => {
    await observedStore(1);
    const message = await renderOwnerControlAction(
      env.DB,
      { view: "performance" },
      controlConfig(),
      { now },
    );
    expect(JSON.stringify(message)).toContain("1/50");
    expect(JSON.stringify(message)).toContain("Lifetime");
    expect(
      message.replyMarkup?.inline_keyboard.flat().map(({ callback_data }) => callback_data),
    ).toContain("oc1:p:-:0:r");
    const dashboard = await renderOwnerControlAction(
      env.DB,
      { view: "dashboard" },
      controlConfig(),
      { now, fetcher: vi.fn(async () => growthResponse([], false)) as typeof fetch },
    );
    expect(JSON.stringify(dashboard)).toContain("Obiettivo BFS");
    await renderOwnerControlAction(
      env.DB,
      { view: "performance", refresh: true },
      controlConfig(),
      { now: new Date(now.getTime() + 300_000), adminForShop: adminForPlan("Development", true) },
    );
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
    const sale = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;
    const billing = await renderOwnerControlAction(
      env.DB,
      { view: "billing", refresh: true },
      controlConfig(),
      { now: NOW, fetcher: sale },
    );
    expect(JSON.stringify(billing)).toContain("98,36");
    expect(JSON.stringify(billing)).toContain("In attesa della transazione Shopify");
    expect(sale).toHaveBeenCalledTimes(2);

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

    const refreshWithoutAccess = await renderOwnerControlAction(
      env.DB,
      { view: "billing", refresh: true },
      controlConfig(),
      { now: NOW, fetcher: denied },
    );
    const refreshText = JSON.stringify(refreshWithoutAccess);
    expect(refreshText).toContain("Aggiornamento");
    expect(refreshText).toContain("Non riuscito (partner_api_graphql_error)");
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
