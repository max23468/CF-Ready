import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { renderOwnerControlAction } from "../app/owner-control/commands.server";
import { fetchGrowthReport, readGrowthReport } from "../app/owner-control/growth.server";

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
