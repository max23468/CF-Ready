import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  addDays,
  cancelSubscription,
  createCharge,
  currentPricingGeneration,
  entitlementFor,
  localDate,
  markTrialConverted,
  pricingGeneration,
  proratedCredit,
  readBilling,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  syncBillingAccount,
  syncTrial,
  trialEnd,
} from "../app/billing.server";
import { sha256Hex } from "../app/hash.server";
import { redactShop } from "../app/shop.server";
import {
  configWithEntitlement,
  entitlementDiffers,
  withValidationLock,
} from "../app/validation.server";

async function insertShop(shopDomain: string) {
  const timestamp = "2026-07-30T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shopDomain, timestamp, timestamp, timestamp)
    .run();
  return shopDomain;
}

test("la generazione tariffaria segue la finestra di lancio", () => {
  expect(pricingGeneration("2026-07-30")).toBe("launch");
  expect(pricingGeneration("2026-11-29")).toBe("launch");
  expect(pricingGeneration("2026-11-30")).toBe("balanced");
});

test("la prova dura quattordici giorni contando il primo", () => {
  expect(trialEnd("2026-07-30")).toBe("2026-08-12");
  // Il cambio di mese e l'ora legale non spostano il conteggio.
  expect(trialEnd("2026-10-25")).toBe("2026-11-07");
});

test("la data locale usa il fuso dello store e ripiega su UTC", () => {
  const istante = new Date("2026-07-30T22:30:00Z");

  expect(localDate("Europe/Rome", istante)).toBe("2026-07-31");
  expect(localDate("Pacific/Honolulu", istante)).toBe("2026-07-30");
  expect(localDate("Fuso/Inesistente", istante)).toBe("2026-07-30");
});

test("uno store non idoneo non consuma la prova", async () => {
  const shop = await insertShop("estero.example.myshopify.com");

  expect(await syncTrial(env.DB, shop, { eligible: false, today: "2026-07-30" })).toBeNull();
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS totale FROM trials").first<{ totale: number }>(),
  ).toMatchObject({ totale: 0 });
});

test("la prova parte una volta sola e scade da sé", async () => {
  const shop = await insertShop("prova.example.myshopify.com");

  const avviata = await syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" });
  expect(avviata).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
    pricing_generation: "launch",
  });
  expect(entitlementFor(avviata, "2026-08-12")).toEqual({
    kind: "trial",
    validThrough: "2026-08-12",
  });

  // Riapertura durante la prova: nessuna seconda prova, scadenza invariata.
  expect(await syncTrial(env.DB, shop, { eligible: true, today: "2026-08-01" })).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
  });

  const scaduta = await syncTrial(env.DB, shop, { eligible: true, today: "2026-08-13" });
  expect(scaduta?.status).toBe("expired");
  expect(entitlementFor(scaduta, "2026-08-13")).toEqual({ kind: "none", validThrough: null });

  // Avvio e scadenza sono registrati una volta sola, anche riaprendo l'app dopo la scadenza.
  await syncTrial(env.DB, shop, { eligible: true, today: "2026-08-14" });
  const { results } = await env.DB.prepare(
    `SELECT event_name, metadata_json FROM app_events
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
     ORDER BY occurred_at`,
  )
    .bind(shop)
    .all<{ event_name: string; metadata_json: string }>();

  expect(results.map((evento) => evento.event_name)).toEqual(["trial_started", "trial_expired"]);
  expect(results[0].metadata_json).toBe('{"pricing_generation":"launch"}');
});

test("due primi accessi concorrenti registrano un solo avvio prova", async () => {
  const shop = await insertShop("prova-concorrente.example.myshopify.com");

  await Promise.all([
    syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" }),
    syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" }),
  ]);

  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS totale FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
         AND event_name = 'trial_started'`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ totale: 1 });
});

test("una prova già fruita non si rigenera dopo la cancellazione dei dati", async () => {
  const shop = await insertShop("ritorno.example.myshopify.com");

  expect(await syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" })).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
  });

  // Disinstallazione, `shop/redact` e reinstallazione dello stesso store.
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  expect(await redactShop(env.DB, shop, "wh-ledger-consumato")).toBe(true);
  await insertShop(shop);

  expect(await syncTrial(env.DB, shop, { eligible: true, today: "2026-09-01" })).toMatchObject({
    status: "expired",
    ends_at: "2026-08-12",
    pricing_generation: "launch",
  });
});

test("il registro della prova non conserva il dominio in chiaro", async () => {
  const shop = await insertShop("registro.example.myshopify.com");
  await syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" });
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  await redactShop(env.DB, shop, "wh-ledger-attivo");

  const registro = await env.DB.prepare(
    "SELECT shop_hash, trial_ends_at FROM trial_ledger WHERE shop_hash = ?",
  )
    .bind(await sha256Hex(shop))
    .first<{ shop_hash: string; trial_ends_at: string }>();

  expect(registro).toMatchObject({ trial_ends_at: "2026-08-12" });
  expect(registro?.shop_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(registro)).not.toContain("registro.example");
});

const NESSUN_ADDEBITO = { subscription: null, oneTime: null, pendingOneTime: false };
const opzioni = {
  today: "2026-08-01",
  timeZone: "Europe/Rome",
  pricingGeneration: "launch" as const,
};

// Un identificatore Shopify è unico nel mondo reale: i test non devono riusarlo, altrimenti
// l'indice di idempotenza scarta l'evento del test successivo.
function abbonamento(
  id: string,
  currentPeriodEnd: string,
  interval: "EVERY_30_DAYS" | "ANNUAL" = "EVERY_30_DAYS",
) {
  return {
    subscription: {
      id,
      name: "launch-monthly",
      currentPeriodEnd,
      interval,
      amount: "2.99",
      currency: "EUR",
    },
    oneTime: null,
    pendingOneTime: false,
  };
}

test("una sottoscrizione attiva diventa diritto fino a fine periodo", async () => {
  const shop = await insertShop("abbonato.example.myshopify.com");

  const account = await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/1", "2026-08-31T21:59:59Z"),
    opzioni,
  );

  expect(account).toMatchObject({
    entitlement_status: "active",
    plan_kind: "monthly",
    current_period_end: "2026-08-31",
  });
  expect(entitlementFor(null, "2026-08-01", account)).toEqual({
    kind: "subscription",
    validThrough: "2026-08-31",
  });
});

test("la cancellazione lascia l'accesso fino a fine periodo e poi scade", async () => {
  const shop = await insertShop("cancellato.example.myshopify.com");
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/2", "2026-08-31T21:59:59Z"),
    opzioni,
  );

  // Shopify non elenca più la sottoscrizione cancellata: il periodo pagato resta nostro.
  const inScadenza = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);
  expect(inScadenza).toMatchObject({
    entitlement_status: "ending",
    current_period_end: "2026-08-31",
  });
  expect(entitlementFor(null, "2026-08-31", inScadenza)).toEqual({
    kind: "subscription",
    validThrough: "2026-08-31",
  });

  const scaduto = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, {
    ...opzioni,
    today: "2026-09-01",
  });
  expect(scaduto.entitlement_status).toBe("expired");
  expect(entitlementFor(null, "2026-09-01", scaduto)).toEqual({ kind: "none", validThrough: null });
});

test("gli eventi billing sono append-only e idempotenti", async () => {
  const shop = await insertShop("eventi.example.myshopify.com");
  const stato = abbonamento("gid://shopify/AppSubscription/3", "2026-08-31T21:59:59Z");

  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await syncBillingAccount(env.DB, shop, stato, opzioni);
  await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);

  const { results } = await env.DB.prepare(
    `SELECT event_type, status, amount_minor, currency, period_end FROM billing_events
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
     ORDER BY id`,
  )
    .bind(shop)
    .all<Record<string, unknown>>();

  expect(results).toEqual([
    {
      event_type: "active",
      status: "monthly",
      amount_minor: 299,
      currency: "EUR",
      period_end: "2026-08-31",
    },
    {
      event_type: "ending",
      status: "monthly",
      amount_minor: null,
      currency: null,
      period_end: "2026-08-31",
    },
  ]);
});

test("conto ed evento billing falliscono atomicamente", async () => {
  const shop = await insertShop("evento-atomico.example.myshopify.com");
  await env.DB.prepare(
    `CREATE TRIGGER rifiuta_evento BEFORE INSERT ON billing_events
     BEGIN SELECT RAISE(FAIL, 'evento rifiutato'); END`,
  ).run();

  await expect(
    syncBillingAccount(
      env.DB,
      shop,
      abbonamento("gid://shopify/AppSubscription/atomico", "2026-08-31T21:59:59Z"),
      opzioni,
    ),
  ).rejects.toThrow();
  await env.DB.prepare("DROP TRIGGER rifiuta_evento").run();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS totale FROM billing_accounts WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ totale: 0 });
});

test("un cambio di piano produce un evento anche se lo stato resta attivo", async () => {
  const shop = await insertShop("cambio.example.myshopify.com");

  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/10", "2026-08-31T21:59:59Z"),
    opzioni,
  );
  await syncBillingAccount(
    env.DB,
    shop,
    abbonamento("gid://shopify/AppSubscription/11", "2027-07-31T21:59:59Z", "ANNUAL"),
    opzioni,
  );

  const { results } = await env.DB.prepare(
    `SELECT shopify_resource_gid, status FROM billing_events
     WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
     ORDER BY id`,
  )
    .bind(shop)
    .all<{ shopify_resource_gid: string; status: string }>();

  expect(results).toEqual([
    { shopify_resource_gid: "gid://shopify/AppSubscription/10", status: "monthly" },
    { shopify_resource_gid: "gid://shopify/AppSubscription/11", status: "annual" },
  ]);
});

test("la conversione a una tantum registra il prezzo dell'acquisto", async () => {
  const shop = await insertShop("conversione.example.myshopify.com");
  const billing = {
    ...abbonamento("gid://shopify/AppSubscription/conversione", "2026-08-31T21:59:59Z"),
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/conversione",
      createdAt: "2026-08-01T10:00:00Z",
      amount: "89.90",
      currency: "EUR",
    },
  };

  await syncBillingAccount(env.DB, shop, billing, opzioni);

  expect(
    await env.DB.prepare(
      `SELECT shopify_resource_gid, amount_minor, currency FROM billing_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    shopify_resource_gid: "gid://shopify/AppPurchaseOneTime/conversione",
    amount_minor: 8990,
    currency: "EUR",
  });
});

test("gli addebiti della modalità sbagliata vengono ignorati", async () => {
  const risposta = (test: boolean) => ({
    json: async () => ({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/99",
              name: "launch-monthly",
              status: "ACTIVE",
              test,
              currentPeriodEnd: "2026-08-31T21:59:59Z",
              lineItems: [
                {
                  plan: {
                    pricingDetails: {
                      interval: "EVERY_30_DAYS",
                      price: { amount: "2.99", currencyCode: "EUR" },
                    },
                  },
                },
              ],
            },
          ],
          oneTimePurchases: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  const admin = (test: boolean) => ({ graphql: async () => risposta(test) as unknown as Response });

  // Un addebito di prova non concede il diritto quando l'app addebita davvero.
  expect((await readBilling(admin(true), false)).subscription).toBeNull();
  expect((await readBilling(admin(true), true)).subscription).toMatchObject({
    id: "gid://shopify/AppSubscription/99",
  });
});

test("la lettura pagina tutti gli acquisti e riconosce quelli pendenti", async () => {
  const after: unknown[] = [];
  const pages = [
    {
      nodes: [
        {
          id: "gid://shopify/AppPurchaseOneTime/pending",
          status: "PENDING",
          test: true,
          createdAt: "2026-08-01T12:00:00Z",
          price: { amount: "89.90", currencyCode: "EUR" },
        },
      ],
      pageInfo: { hasNextPage: true, endCursor: "pagina-2" },
    },
    {
      nodes: [
        {
          id: "gid://shopify/AppPurchaseOneTime/active",
          status: "ACTIVE",
          test: true,
          createdAt: "2026-07-01T12:00:00Z",
          price: { amount: "89.90", currencyCode: "EUR" },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  ];
  const admin = {
    graphql: async (_query: string, options?: { variables?: Record<string, unknown> }) => {
      after.push(options?.variables?.after);
      return Response.json({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [],
            oneTimePurchases: pages.shift(),
          },
        },
      });
    },
  };

  expect(await readBilling(admin, true)).toMatchObject({
    oneTime: { id: "gid://shopify/AppPurchaseOneTime/active" },
    pendingOneTime: true,
  });
  expect(after).toEqual([null, "pagina-2"]);
});

test("la generazione cambia solo dopo una cessazione commerciale completa", async () => {
  const trial = {
    status: "expired" as const,
    started_at: "2026-07-30T00:00:00Z",
    ends_at: "2026-08-12",
    pricing_generation: "launch" as const,
  };
  const active = {
    entitlement_status: "active" as const,
    plan_kind: "monthly" as const,
    pricing_generation: "launch" as const,
    shopify_charge_gid: "gid://shopify/AppSubscription/generation",
    current_period_end: "2026-12-31",
  };

  expect(currentPricingGeneration(trial, active, "2026-12-01")).toBe("launch");
  expect(
    currentPricingGeneration(trial, { ...active, entitlement_status: "expired" }, "2026-12-01"),
  ).toBe("balanced");

  const shop = await insertShop("nuova-generazione.example.myshopify.com");
  await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, {
    today: "2026-12-01",
    timeZone: "Europe/Rome",
    pricingGeneration: "launch",
  });
  const renewedBilling = abbonamento(
    "gid://shopify/AppSubscription/generation-new",
    "2026-12-31T22:59:59Z",
  );
  renewedBilling.subscription.amount = "3.99";
  const renewed = await syncBillingAccount(env.DB, shop, renewedBilling, {
    today: "2026-12-01",
    timeZone: "Europe/Rome",
    pricingGeneration: "balanced",
  });
  expect(renewed.pricing_generation).toBe("balanced");
});

test("un addebito Shopify attivo ricostruisce la generazione tariffaria", async () => {
  const launchShop = await insertShop("addebito-launch.example.myshopify.com");
  const launch = await syncBillingAccount(
    env.DB,
    launchShop,
    abbonamento("gid://shopify/AppSubscription/launch-source", "2026-12-31T22:59:59Z"),
    { today: "2026-12-01", timeZone: "Europe/Rome", pricingGeneration: "balanced" },
  );
  expect(launch.pricing_generation).toBe("launch");

  const balancedShop = await insertShop("addebito-balanced.example.myshopify.com");
  const balancedBilling = abbonamento(
    "gid://shopify/AppSubscription/balanced-source",
    "2026-12-31T22:59:59Z",
  );
  balancedBilling.subscription.amount = "3.99";
  const balanced = await syncBillingAccount(env.DB, balancedShop, balancedBilling, opzioni);
  expect(balanced.pricing_generation).toBe("balanced");
});

test("il credito stimato copre solo il ciclo corrente", () => {
  const mensile = {
    amount: "2.99",
    interval: "EVERY_30_DAYS" as const,
    periodEnd: "2026-08-31",
  };

  // Metà ciclo residuo su trenta giorni.
  expect(proratedCredit({ ...mensile, today: "2026-08-16" })).toBeCloseTo(1.495, 3);
  // Ciclo concluso: nessun credito, e nessun cumulo dai cicli precedenti.
  expect(proratedCredit({ ...mensile, today: "2026-08-31" })).toBe(0);
  expect(proratedCredit({ ...mensile, today: "2026-09-10" })).toBe(0);
  expect(
    proratedCredit({
      amount: "29.90",
      interval: "ANNUAL",
      periodEnd: "2027-07-31",
      today: "2027-06-01",
    }),
  ).toBeCloseTo(4.915, 3);
  expect(
    proratedCredit({ amount: null, interval: null, periodEnd: null, today: "2026-08-16" }),
  ).toBeNull();
});

test("un acquisto una tantum rimborsato revoca il diritto", async () => {
  const shop = await insertShop("rimborso.example.myshopify.com");
  const acquisto = {
    subscription: null,
    oneTime: {
      id: "gid://shopify/AppPurchaseOneTime/1",
      createdAt: "2026-08-01T10:00:00Z",
      amount: "89.90",
      currency: "EUR",
    },
    pendingOneTime: false,
  };

  const attivo = await syncBillingAccount(env.DB, shop, acquisto, opzioni);
  expect(attivo).toMatchObject({ entitlement_status: "active", plan_kind: "one_time" });
  expect(entitlementFor(null, "2026-08-01", attivo)).toEqual({
    kind: "one_time",
    validThrough: null,
  });

  // Un rimborso totale toglie l'acquisto dagli attivi: gli acquisti una tantum non scadono.
  const rimborsato = await syncBillingAccount(env.DB, shop, NESSUN_ADDEBITO, opzioni);
  expect(rimborsato.entitlement_status).toBe("refunded");
  expect(entitlementFor(null, "2026-08-01", rimborsato)).toEqual({
    kind: "none",
    validThrough: null,
  });
});

test("l'addebito restituisce l'URL di conferma e distingue i due tipi", async () => {
  const chiamate: { query: string; variables: unknown }[] = [];
  const admin = (payload: unknown) => ({
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      chiamate.push({ query, variables: options?.variables });
      return { json: async () => payload } as unknown as Response;
    },
  });

  const abbonamento = await createCharge(
    admin({
      data: {
        appSubscriptionCreate: { confirmationUrl: "https://shopify/conferma", userErrors: [] },
      },
    }),
    {
      name: "CF Ready — abbonamento mensile",
      amount: 2.99,
      currency: "EUR",
      interval: "EVERY_30_DAYS",
      trialDays: 6,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(abbonamento).toEqual({ confirmationUrl: "https://shopify/conferma", error: null });
  expect(chiamate[0].query).toContain("appSubscriptionCreate");
  expect(chiamate[0].variables).toMatchObject({
    trialDays: 6,
    test: true,
    replacementBehavior: "STANDARD",
  });

  const unaTantum = await createCharge(
    admin({
      data: {
        appPurchaseOneTimeCreate: { confirmationUrl: "https://shopify/unica", userErrors: [] },
      },
    }),
    {
      name: "CF Ready — pagamento unico",
      amount: 89.9,
      currency: "EUR",
      interval: null,
      trialDays: 0,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(unaTantum.confirmationUrl).toBe("https://shopify/unica");
  expect(chiamate[1].query).toContain("appPurchaseOneTimeCreate");

  // Un rifiuto di Shopify non deve passare per successo con un URL mancante.
  const rifiutato = await createCharge(
    admin({
      data: { appSubscriptionCreate: { confirmationUrl: null, userErrors: [{ message: "no" }] } },
    }),
    {
      name: "CF Ready — abbonamento mensile",
      amount: 2.99,
      currency: "EUR",
      interval: "EVERY_30_DAYS",
      trialDays: 0,
      test: true,
      returnUrl: "https://app.example/app",
    },
  );

  expect(rifiutato).toEqual({ confirmationUrl: null, error: "charge_create_failed" });

  expect(
    await createCharge(
      { graphql: async () => Promise.reject(new Error("Shopify non disponibile")) },
      {
        name: "CF Ready — abbonamento mensile",
        amount: 2.99,
        currency: "EUR",
        interval: "EVERY_30_DAYS",
        trialDays: 0,
        test: true,
        returnUrl: "https://app.example/app",
      },
    ),
  ).toEqual({ confirmationUrl: null, error: "charge_create_failed" });
});

test("il confine billing riconosce il piano ricorrente già attivo", () => {
  const mensile = abbonamento("gid://shopify/AppSubscription/attivo", "2026-08-31");

  expect(requestedRecurringPlanIsActive(mensile, "monthly")).toBe(true);
  expect(requestedRecurringPlanIsActive(mensile, "annual")).toBe(false);
  expect(requestedRecurringPlanIsActive(mensile, "one_time")).toBe(false);
});

test("la lease impedisce che due riconciliazioni facciano la stessa operazione", async () => {
  const shop = await insertShop("contesa.example.myshopify.com");
  let esecuzioni = 0;
  const operazione = async () => {
    esecuzioni += 1;
    // Mentre la prima tiene la lease, la seconda deve uscire senza fare nulla.
    const seconda = await withValidationLock(env.DB, shop, async () => {
      esecuzioni += 1;
      return "eseguita";
    });
    expect(seconda).toEqual({ acquired: false });
    return "eseguita";
  };

  expect(await withValidationLock(env.DB, shop, operazione)).toEqual({
    acquired: true,
    result: "eseguita",
  });
  expect(esecuzioni).toBe(1);

  // Rilasciata la lease, l'operazione successiva può procedere.
  expect(await withValidationLock(env.DB, shop, async () => "dopo")).toEqual({
    acquired: true,
    result: "dopo",
  });
});

test("l'URL di ritorno riporta il merchant dentro l'admin", () => {
  const host = btoa("admin.shopify.com/store/negozio");
  const dentroAdmin = returnUrlFor(
    new Request(`https://app.example/app?shop=intruso.myshopify.com&host=${host}`),
    "negozio.myshopify.com",
  );

  expect(dentroAdmin).toContain("shop=negozio.myshopify.com");
  expect(dentroAdmin).not.toContain("intruso");
  expect(dentroAdmin).toContain(`host=${encodeURIComponent(host)}`);

  // Un `host` non coerente viene scartato; lo shop autenticato permette comunque il rientro.
  const senzaHost = returnUrlFor(
    new Request(`https://app.example/app?host=${btoa("admin.shopify.com/store/altro")}`),
    "negozio.myshopify.com",
  );
  expect(senzaHost).toContain("shop=negozio.myshopify.com");
  expect(senzaHost).not.toContain("host=");
});

test("la cancellazione riporta un errore invece di fingere il successo", async () => {
  const risposta = (userErrors: { message: string }[]) => ({
    json: async () => ({ data: { appSubscriptionCancel: { userErrors } } }),
  });

  expect(
    await cancelSubscription(
      { graphql: async () => risposta([]) as unknown as Response },
      "gid://shopify/AppSubscription/50",
      { prorate: false },
    ),
  ).toBeNull();
  expect(
    await cancelSubscription(
      { graphql: async () => risposta([{ message: "non cancellabile" }]) as unknown as Response },
      "gid://shopify/AppSubscription/50",
      { prorate: true },
    ),
  ).toBe("subscription_cancel_failed");
  expect(
    await cancelSubscription(
      { graphql: async () => Promise.reject(new Error("Shopify non disponibile")) },
      "gid://shopify/AppSubscription/50",
      { prorate: false },
    ),
  ).toBe("subscription_cancel_failed");
});

test("la prova risulta convertita quando il merchant paga", async () => {
  const shop = await insertShop("convertita.example.myshopify.com");
  await syncTrial(env.DB, shop, { eligible: true, today: "2026-07-30" });

  await markTrialConverted(env.DB, shop);

  expect(
    await env.DB.prepare(
      "SELECT status FROM trials WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ status: "converted" });
});

test("il diritto pagato prevale sulla prova ancora attiva", () => {
  const prova = {
    status: "active" as const,
    started_at: null,
    ends_at: "2026-08-12",
    pricing_generation: "launch" as const,
  };
  const unaTantum = {
    entitlement_status: "active" as const,
    plan_kind: "one_time" as const,
    pricing_generation: "launch" as const,
    shopify_charge_gid: "gid://shopify/AppPurchaseOneTime/1",
    current_period_end: null,
  };

  expect(entitlementFor(prova, "2026-08-01", unaTantum)).toEqual({
    kind: "one_time",
    validThrough: null,
  });
});

test("i giorni di prova residui includono oggi e non vanno sotto zero", () => {
  const prova = {
    status: "active" as const,
    started_at: null,
    ends_at: "2026-08-12",
    pricing_generation: "launch" as const,
  };

  expect(remainingTrialDays(prova, "2026-08-01")).toBe(12);
  expect(remainingTrialDays(prova, "2026-08-12")).toBe(1);
  expect(remainingTrialDays(prova, "2026-08-13")).toBe(0);
  expect(remainingTrialDays(null, "2026-08-01")).toBe(0);
});

test("l'entitlement viene riscritto solo quando cambia davvero", () => {
  const entitlement = { kind: "trial", validThrough: "2026-08-12" } as const;
  const config = { schemaVersion: 2, rules: { taxCode: "required_validated" }, entitlement };

  expect(entitlementDiffers(config, entitlement)).toBe(false);
  expect(entitlementDiffers(config, { kind: "none", validThrough: null })).toBe(true);
  expect(entitlementDiffers(undefined, entitlement)).toBe(true);
});

test("la riscrittura conserva regole e messaggi del merchant", () => {
  const merchant = {
    schemaVersion: 2,
    enabled: true,
    errorDisplay: "preventive",
    entitlement: { kind: "trial", validThrough: "2026-08-01" },
    rules: { taxCode: "optional_validated", pec: "unmanaged" },
    messages: { it: {}, en: {} },
  };

  expect(configWithEntitlement(merchant, { kind: "none", validThrough: null })).toMatchObject({
    errorDisplay: "preventive",
    rules: { taxCode: "optional_validated", pec: "unmanaged" },
    entitlement: { kind: "none", validThrough: null },
  });
  // Configurazione illeggibile: si riparte dal default invece di propagare spazzatura.
  expect(configWithEntitlement("rotto", { kind: "none", validThrough: null })).toMatchObject({
    schemaVersion: 2,
    rules: { taxCode: "unmanaged" },
  });
});

test("la data del primo addebito è il giorno dopo i giorni di prova ceduti a Shopify", () => {
  const trial = {
    status: "active" as const,
    started_at: "2026-07-29",
    ends_at: "2026-08-11",
    pricing_generation: "launch" as const,
  };

  // §14.6: chi attiva oggi cede a Shopify i giorni residui, oggi incluso, e il primo addebito
  // cade il giorno dopo l'ultimo giorno di prova.
  const remaining = remainingTrialDays(trial, "2026-08-01");
  expect(remaining).toBe(11);
  expect(addDays("2026-08-01", remaining)).toBe("2026-08-12");
  expect(addDays(trial.ends_at, 1)).toBe("2026-08-12");

  // Ultimo giorno di prova: resta un giorno, quindi l'addebito è domani.
  expect(addDays("2026-08-11", remainingTrialDays(trial, "2026-08-11"))).toBe("2026-08-12");
  // Prova finita: nessun giorno da cedere, l'addebito parte all'approvazione.
  expect(remainingTrialDays(trial, "2026-08-12")).toBe(0);
});
