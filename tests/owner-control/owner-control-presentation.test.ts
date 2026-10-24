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
} from "../../app/owner-control/presentation";
import type { UninstallReport } from "../../app/owner-control/uninstalls.server";

import { NOW, shopFixture } from "../support/owner-control";

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

  test("mostra stati vuoti e conserva filtri e destinazioni della paginazione", () => {
    expect(ownerControlPlainText(dashboardMessage({}))).toContain("Attivi: —");
    const filters = {
      all: "Tutti",
      trial: "Trial",
      paid: "Piano attivo verificato",
      validation_off: "Validation non attiva",
      issues: "Con problemi",
    } as const;
    for (const filter of Object.keys(filters) as Array<keyof typeof filters>) {
      const empty = shopsMessage({ shops: [], count: 0, page: 0 }, filter);
      expect(ownerControlPlainText(empty)).toContain(`Store · ${filters[filter]}`);
      expect(ownerControlPlainText(empty)).toContain("Risultato: Nessuno store");
      expect(empty.replyMarkup?.inline_keyboard).toEqual([
        [{ text: "‹ Dashboard", callback_data: "oc1:d:-:0" }],
      ]);
      const paged = shopsMessage({ shops: [], count: 20, page: 1 }, filter);
      expect(paged.replyMarkup?.inline_keyboard[0]).toEqual([
        { text: "‹", callback_data: `oc1:s:${filter}:0` },
        { text: "›", callback_data: `oc1:s:${filter}:2` },
      ]);
    }
    const shop = shopFixture({ display_name: null, validation_enabled: 0 });
    const paged = shopsMessage({ shops: [shop], count: 20, page: 1 }, "all", [
      { shopId: shop.id, plan: "Basic" },
    ]);
    expect(ownerControlPlainText(paged)).toContain(
      "atelier.myshopify.com: — · Shopify Basic · Validation non attiva",
    );
    expect(paged.replyMarkup?.inline_keyboard[0]).toEqual([
      { text: "Apri · atelier.myshopify.com", callback_data: "oc1:o:1:0" },
    ]);
    expect(ownerControlPlainText(shopMessage(shop, [], null))).toContain(
      "Piano Shopify: Non disponibile",
    );
    expect(
      ownerControlPlainText(
        shopMessage(shopFixture({ installation_status: "uninstalled" }), [], null),
      ),
    ).toContain("Piano Shopify: Non applicabile");
    expect(
      ownerControlPlainText(trialsMessage({ trials: [], count: 0, endingSoon: 0, page: 0 })),
    ).toContain("Trial: Nessun trial attivo");
    const trials = trialsMessage({
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
    });
    expect(ownerControlPlainText(trials)).toContain("🧪 20 attivi · 1 in scadenza");
    expect(ownerControlPlainText(trials)).toMatch(
      /a\.myshopify\.com: \d+ gg · Validation non attiva/,
    );
    expect(trials.replyMarkup?.inline_keyboard[0]).toEqual([
      { text: "‹", callback_data: "oc1:t:-:0" },
      { text: "›", callback_data: "oc1:t:-:2" },
    ]);
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
    for (const [index, shop] of variants.entries()) {
      const expected = ["Omaggio", "Attivo", "Attivo", "In scadenza", "Trial", "Nessuno"][index];
      expect(ownerControlPlainText(shopMessage(shop))).toContain(`Diritto: ${expected}`);
    }
    expect(ownerControlPlainText(shopMessage(variants[5]))).toContain("Hash config: —");
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
      ownerControlPlainText(
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
        ),
      ),
    ).toContain("Atelier: — · Validation non attiva · sync_failed");
  });

  test("distingue dati assenti, anomalie e stato osservato dei componenti", () => {
    expect(ownerControlPlainText(errorsMessage([]))).toContain("Stato: Nessun errore");
    expect(
      ownerControlPlainText(
        errorsMessage([{ error_code: "sync_failed", count: 2, last_at: NOW.toISOString() }]),
      ),
    ).toContain("sync_failed: 2 · 08/09/26, 14:00");
    expect(ownerControlPlainText(activityMessage([]))).toContain("Stato: Nessuna attività");
    const activity = ownerControlPlainText(
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
      ]),
    );
    expect(activity).toContain("Regole salvate: Sistema · 08/09/26, 14:00");
    expect(activity).toContain("Prova avviata: a.myshopify.com · 08/09/26, 14:00");
    expect(ownerControlPlainText(issuesMessage({ partner: { stale: 0 } }))).toContain(
      "Partner sync: Regolare",
    );
    expect(ownerControlPlainText(issuesMessage({ partner: { stale: 1 } }))).toContain(
      "Partner sync: Stale",
    );
    expect(ownerControlPlainText(issuesMessage({}))).toContain("Store con errore: —");
    const absent = ownerControlPlainText(
      healthMessage({
        d1: false,
        partner: {},
        inbound: {},
        notifications: {},
        webhooks: {},
      }),
    );
    for (const row of [
      "D1: Errore",
      "Partner sync: Stale o assente",
      "Telegram inbound: Non verificato",
    ]) {
      expect(absent).toContain(row);
    }
    const observed = { d1: true, partner: { synced_at: NOW.toISOString(), stale: 0 } };
    const webhook = {
      configured: false,
      matchesExpectedUrl: false,
      pendingUpdateCount: 1,
      lastErrorAt: null,
      checkedAt: NOW.toISOString(),
    };
    const mismatch = ownerControlPlainText(healthMessage(observed, webhook));
    expect(mismatch).toContain("D1: OK");
    expect(mismatch).toContain("Partner sync: 08/09/26, 14:00");
    expect(mismatch).toContain("Telegram inbound: Configurazione non corrispondente");
    const active = ownerControlPlainText(
      healthMessage(observed, {
        ...webhook,
        configured: true,
        matchesExpectedUrl: true,
        pendingUpdateCount: 0,
        lastErrorAt: NOW.toISOString(),
      }),
    );
    expect(active).toContain("Telegram inbound: Attivo · nessun arretrato");
    expect(active).toContain("Errore webhook Telegram: 08/09/26, 14:00");
    expect(
      ownerControlPlainText(
        healthMessage(observed, {
          ...webhook,
          configured: true,
          matchesExpectedUrl: true,
        }),
      ),
    ).toContain("Telegram inbound: Attivo · 1 in coda");
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
    const exchangeRate = { date: "2026-09-08", usdPerEuro: 1.25 };
    const billing = billingMessage(billingData, revenue, undefined, exchangeRate);
    const billingText = JSON.stringify(billing);
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
    expect(billingText).toMatch(/10,00\s€ · netto 9,36\s€/);
    expect(billingText).toMatch(/120,00\s€ · netto 112,36\s€/);
    expect(billingText).toContain('"Esclusi"');
    expect(billingText).toContain("3/5");
    expect(billingText).toContain("⚠️ In attesa della transazione Shopify");
    expect(billingText).toContain("⚠️ Conversioni da verificare");
    expect(billingText).toContain("elaborazione 2,9%");
    expect(billingText).toContain("regolamentare IT 3%");
    expect(billingText).toContain("regolamentare non nota per 2 abbonamenti");
    expect(billingText).toContain("Hyperwallet 0,5% sul netto Shopify");
    expect(billingText).toMatch(/79,89\s€/);
    expect(billingText).toMatch(/2,60\s€ netti/);
    expect(billingText).toMatch(/78,29\s€ netti/);
    expect(billingText).toMatch(/-1,01\s€/);
    expect(billingText).toContain("106,53");
    expect(billingText).toContain("6,17");
    expect(billingText).not.toContain("BCE");
    expect(billingText).toContain("Netti stimati dopo la commissione Hyperwallet");
    expect(billingText).not.toContain("USD netti");
    for (const [currency, netMinor, expected] of [
      ["EUR", 10036, "100,36"],
      ["USD", 0, "0,00"],
      ["USD", -10036, "-79,89"],
    ] as const) {
      const text = JSON.stringify(
        billingMessage(
          billingData,
          {
            ...revenue,
            currency,
            totals: { ...revenue.totals, netMinor },
          },
          undefined,
          exchangeRate,
        ),
      );
      expect(text).toContain(expected);
      expect(text).not.toContain("Dopo fee cambio");
    }
    const withoutRate = JSON.stringify(billingMessage(billingData, revenue));
    expect(withoutRate).toContain("Non disponibile");
    expect(withoutRate).not.toContain("BCE");
    expect(withoutRate).not.toContain("Non disponibile netti");
    expect(
      JSON.stringify(
        billingMessage(billingData, {
          ...revenue,
          adjustments: { count: 0, grossMinor: 0, netMinor: 0 },
        }),
      ),
    ).toMatch(/0,00\s€ · 0 movimenti/);
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
      merchant: { total: 4, stores: 3, days28: 1 },
      review: 9,
    };
    const local = (total: number, review: number) => ({
      total,
      review,
      startedAt: NOW.toISOString(),
    });
    const lowLocal = uninstalls(partner, local(5, 2));
    expect(lowLocal).toContain("4 · 3 store · 1 negli ultimi 28 gg");
    expect(lowLocal).toContain('"Disinstallazioni review"},"is_header":true},{"text":"9"');
    const highLocal = uninstalls(partner, local(18, 10));
    expect(highLocal).toContain("8 · 3 store · 1 negli ultimi 28 gg");
    expect(highLocal).toContain('"Disinstallazioni review"},"is_header":true},{"text":"10"');
    expect(uninstalls(partner, null)).toContain("4 · 3 store");
    const offline = uninstalls({ unavailable: "partner_api_graphql_error" }, local(5, 2));
    expect(offline).toContain("3 dal 08/09/26, 14:00 · Partner non disponibile");
    expect(offline).toContain('"Disinstallazioni review"},"is_header":true},{"text":"2"');
    expect(uninstalls({ unavailable: "partner_api_graphql_error" }, null)).toContain(
      "Non disponibile (partner_api_graphql_error)",
    );
    expect(billingText).toContain("oc1:u:-:0");
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
    const funnel = ownerControlPlainText(
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
      ]),
    );
    for (const row of [
      "2026-36: 2 installati · 1 regole · 1 trial · 1 attivazioni · 1 piani paganti",
      "Installati → piano: 50% · Attivati → piano: 100% · Attivati → disinstallati: 0%",
      "Tempo medio al piano: 2 min",
      "Campione: Piccolo, dato indicativo",
      "2026-35: 20 installati",
      "Installati → piano: — · Attivati → piano: — · Attivati → disinstallati: —",
      "Tempo medio al piano: —",
    ])
      expect(funnel).toContain(row);
    const emptyPerformance = ownerControlPlainText(
      performanceMessage({ groups: [], comparison: null }),
    );
    for (const metric of ["LCP", "INP", "CLS"]) {
      expect(emptyPerformance).toContain(`${metric}: 0/100 campioni · Nessun dato`);
    }
    const performance = ownerControlPlainText(
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
      }),
    );
    for (const row of [
      "CLS: 0.123 su 0.100 · 100/100 campioni · Sopra soglia",
      "LCP: 1000 ms su 2500 ms · 50/100 campioni · Entro soglia · campioni insufficienti",
      "INP: 100 ms su 200 ms · 100/100 campioni · Entro soglia",
      "home · CLS: +0.030",
      "rules · LCP: —",
      "Confronto 1.0.0 → 1.1.0",
    ])
      expect(performance).toContain(row);
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
    const version = ownerControlPlainText(versionMessage({ appVersion: "1", environment: "Test" }));
    expect(version).toContain("App: 1");
    expect(version).toContain("Ambiente: Test");
  });
});
