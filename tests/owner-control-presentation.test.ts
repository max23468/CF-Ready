import { describe, expect, test } from "vitest";

import {
  activityMessage,
  billingMessage,
  dashboardMessage,
  errorsMessage,
  funnelMessage,
  healthMessage,
  helpMessage,
  issuesMessage,
  noticeMessage,
  ownerControlPlainText,
  performanceMessage,
  shopMessage,
  shopsMessage,
  trialsMessage,
  versionMessage,
  withCopyButton,
} from "../app/owner-control/presentation";
import type { UninstallReport } from "../app/owner-control/uninstalls.server";

import { NOW, shopFixture } from "./support/owner-control";

describe("presentazione Telegram", () => {
  test("ricava dal pannello un testo copiabile completo e tronca oltre il limite", () => {
    const text = ownerControlPlainText(
      versionMessage({ appVersion: "2.3.0", environment: "Production" }),
    );
    expect(text.split("\n").slice(0, 5)).toEqual([
      "Versione",
      "",
      "CF Ready",
      "App: 2.3.0",
      "Ambiente: Production",
    ]);
    expect(text).toMatch(/\n\nAggiornato: /);
    expect(ownerControlPlainText(helpMessage())).toContain(
      "📋 Copia: Invia la vista come testo copiabile",
    );

    const long = ownerControlPlainText(noticeMessage("Store", "x".repeat(5000)));
    expect(long).toHaveLength(4096);
    expect(long.endsWith("\n… testo troncato")).toBe(true);
    // "Store" + "\n\nInformazione\nStato: " occupa 27 unità: l'emoji cade a cavallo del taglio.
    const emoji = ownerControlPlainText(
      noticeMessage("Store", `${"x".repeat(4096 - 17 - 27 - 1)}🎯${"x".repeat(100)}`),
    );
    expect(emoji).toHaveLength(4095);
    expect(emoji).not.toContain("\uD83C\n");
  });

  test("aggiunge Copia alle viste ripetibili senza refresh né scritture", () => {
    const copied = (message: ReturnType<typeof noticeMessage>) =>
      message.replyMarkup?.inline_keyboard.at(-1);
    expect(
      copied(withCopyButton(noticeMessage("Billing", "x"), { view: "billing", refresh: true })),
    ).toEqual([{ text: "📋 Copia", callback_data: "oc1:b:-:0:c" }]);
    expect(
      copied(
        withCopyButton(noticeMessage("Store", "x"), { view: "shops", filter: "paid", page: 2 }),
      ),
    ).toEqual([{ text: "📋 Copia", callback_data: "oc1:s:paid:2:c" }]);
    expect(
      copied(withCopyButton(noticeMessage("Store", "x"), { view: "conversion_close", shopId: 35 })),
    ).toEqual([{ text: "📋 Copia", callback_data: "oc1:o:z:0:c" }]);
    const byName = noticeMessage("Store", "x");
    expect(withCopyButton(byName, { view: "shop", argument: "nome" })).toBe(byName);
    expect(
      copied(
        withCopyButton(
          { ...byName, copyAction: { view: "shop", shopId: 1 } },
          { view: "shop", argument: "nome" },
        ),
      ),
    ).toEqual([{ text: "📋 Copia", callback_data: "oc1:o:1:0:c" }]);
    const bare = { richMessage: byName.richMessage };
    expect(withCopyButton(bare, { view: "help" }).replyMarkup?.inline_keyboard).toEqual([
      [{ text: "📋 Copia", callback_data: "oc1:x:-:0:c" }],
    ]);
  });

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
    const plans = JSON.stringify(
      shopsMessage({ shops: [shop], count: 20, page: 1 }, "all", [
        { shopId: shop.id, plan: "Basic" },
      ]),
    );
    expect(plans).toContain("Shopify Basic");
    expect(JSON.stringify(shopMessage(shop, [], null))).toContain("Non disponibile");
    expect(
      JSON.stringify(shopMessage(shopFixture({ installation_status: "uninstalled" }), [], null)),
    ).toContain("Non applicabile");
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
      JSON.stringify(
        shopMessage(
          shopFixture({
            entitlement_status: "active",
            plan_kind: "one_time",
            billing_is_test: 0,
            sale_observed_at: NOW.toISOString(),
            sale_charge_gid: "gid://shopify/AppPurchaseOneTime/1",
            shopify_charge_gid: "gid://shopify/AppPurchaseOneTime/1",
          }),
        ),
      ),
    ).toContain("Abbinata");
    expect(
      JSON.stringify(
        shopMessage(
          shopFixture({
            conversion_credit_amount_minor: -125,
            conversion_credit_currency: "INVALID",
            conversion_credit_transaction_type: "AppSaleCredit",
          }),
        ),
      ),
    ).toContain("1.25 INVALID");
    const uninstalled = JSON.stringify(
      shopMessage(
        shopFixture({
          installation_status: "uninstalled",
          onboarding_status: "not_started",
          plan_kind: "none",
          trial_status: "converted",
          entitlement_status: "active",
        }),
        [
          { event_name: "app_uninstalled", occurred_at: NOW.toISOString() },
          { event_name: "sync_failed", occurred_at: NOW.toISOString() },
        ],
      ).richMessage.blocks,
    );
    for (const text of [
      "Disinstallata",
      "Non iniziato",
      "Nessun piano",
      "Piano approvato",
      "Attivo",
      "App disinstallata",
      "Sync failed",
    ]) {
      expect(uninstalled).toContain(text);
    }
    expect(uninstalled).not.toMatch(/Uninstalled|None|App uninstalled/);
    const summaries = JSON.stringify(
      shopsMessage(
        {
          shops: [
            shopFixture({ plan_kind: "annual" }),
            shopFixture({ id: 2, plan_kind: "none", trial_status: "active" }),
          ],
          count: 2,
          page: 0,
        },
        "all",
      ).richMessage.blocks,
    );
    expect(summaries).toContain("Annuale · Validation attiva");
    expect(summaries).toContain("Trial attiva · Validation attiva");
    expect(summaries).not.toContain("atelier.myshopify.com");
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
      status: {
        total: 12,
        monthly: 0,
        annual: 0,
        one_time: 0,
        ending: 2,
        complimentary: 1,
        trial: 1,
        expired: 3,
        refunded: 4,
        trial_expired: 0,
        trial_never: 1,
        other: 0,
      },
      mrr: 10,
      arr: 120,
      netMrr: 9.41,
      netArr: 112.92,
      regulatoryUnknown: 2,
      reconciliation: {
        paid: 5,
        matched: 3,
        awaiting: 1,
        notDue: 1,
        needsReview: 1,
        checkedAt: NOW.toISOString(),
      },
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
    expect(billingText).toContain("💳 Stato · 12 installati");
    expect(billingText).toContain("2 · 2 in scadenza");
    expect(billingText).toContain("2 · 1 trial · 1 omaggio");
    expect(billingText).toContain("8 · 1 prova mai avviata · 3 piani scaduti · 4 rimborsati");
    expect(billingText).not.toContain("Da verificare");
    expect(
      JSON.stringify(
        billingMessage({ ...billingData, status: { ...billingData.status, other: 1 } }),
      ),
    ).toContain("⚠️ Da verificare");
    expect(billingText).toMatch(/10,00\s€ · netto 9,41\s€/);
    expect(billingText).toMatch(/120,00\s€ · netto 112,92\s€/);
    expect(billingText).toContain('"Esclusi"');
    expect(billingText).toContain("3/5");
    expect(billingText).toContain("⚠️ In attesa della transazione Shopify");
    expect(billingText).toContain("⚠️ Conversioni da verificare");
    expect(billingText).toContain("elaborazione 2,9%");
    expect(billingText).toContain("regolamentare IT 3%");
    expect(billingText).toContain("regolamentare non nota per 2 abbonamenti");
    expect(billingText).toContain("100,36");
    expect(billingText).toContain("6,17");
    expect(billingText).toContain("98,36");
    expect(billingText).toContain("1 acquisto");
    expect(billingText).toContain("non provano incasso della fattura merchant né payout");
    expect(billingText).toContain("oc1:b:-:0:r");
    expect(billingText).toContain("oc1:s:paid:0");
    expect(billingText).toContain("oc1:t:-:0");
    expect(billingText).toContain(
      '"Disinstallazioni"},"is_header":true},{"text":"Non disponibile"',
    );
    const calm = JSON.stringify(
      billingMessage({
        ...billingData,
        status: { ...billingData.status, ending: 0, one_time: 0, trial: 0, complimentary: 0 },
        reconciliation: { ...billingData.reconciliation, awaiting: 0, needsReview: 0 },
      }),
    );
    expect(calm).not.toContain("⚠️");
    expect(calm).not.toContain('"Esclusi"');
    expect(calm).toContain('"In prova o omaggio"},"is_header":true},{"text":"0"');
    const uninstalls = (partner: UninstallReport["partner"], local: UninstallReport["local"]) =>
      JSON.stringify(billingMessage(billingData, revenue, { partner, local }));
    const partner = {
      generatedAt: NOW.toISOString(),
      cachedAt: NOW.toISOString(),
      total: 4,
      stores: 3,
      days28: 1,
    };
    expect(uninstalls(partner, { total: 2, startedAt: NOW.toISOString() })).toContain(
      "4 · 3 store · 1 negli ultimi 28 gg",
    );
    expect(uninstalls(partner, { total: 6, startedAt: NOW.toISOString() })).toContain(
      "6 · 3 store · 1 negli ultimi 28 gg",
    );
    expect(uninstalls(partner, null)).toContain("4 · 3 store");
    expect(
      uninstalls(
        { unavailable: "partner_api_graphql_error" },
        {
          total: 2,
          startedAt: NOW.toISOString(),
        },
      ),
    ).toContain("2 dal 08/09/26, 14:00 · Partner non disponibile");
    expect(uninstalls({ unavailable: "partner_api_graphql_error" }, null)).toContain(
      "Non disponibile (partner_api_graphql_error)",
    );
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
          paid_plan_observed: 1,
          paid_plan_after_activation: 1,
          uninstalled_after_activation: 0,
          paid_plan_rate: 0.5,
          activation_to_paid_plan_rate: 1,
          uninstalled_after_activation_rate: 0,
          seconds_to_paid_plan: 120,
          evidence: "small_cohort",
        },
        {
          cohort: "2026-35",
          installed: 20,
          rules_observed: 10,
          trial_observed: 9,
          activation_observed: 8,
          paid_plan_observed: 0,
          paid_plan_after_activation: 0,
          uninstalled_after_activation: 0,
          paid_plan_rate: null,
          activation_to_paid_plan_rate: null,
          uninstalled_after_activation_rate: null,
          seconds_to_paid_plan: null,
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
