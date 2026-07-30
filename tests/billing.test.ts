import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  entitlementFor,
  localDate,
  pricingGeneration,
  readBilling,
  remainingTrialDays,
  syncBillingAccount,
  syncTrial,
  trialEnd,
} from "../app/billing.server";
import { sha256Hex } from "../app/hash.server";
import { redactShop } from "../app/shop.server";
import { configWithEntitlement, entitlementDiffers } from "../app/validation.server";

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
  expect(await redactShop(env.DB, shop)).toBe(true);
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
  await redactShop(env.DB, shop);

  const registro = await env.DB.prepare(
    "SELECT shop_hash, trial_ends_at FROM trial_ledger WHERE shop_hash = ?",
  )
    .bind(await sha256Hex(shop))
    .first<{ shop_hash: string; trial_ends_at: string }>();

  expect(registro).toMatchObject({ trial_ends_at: "2026-08-12" });
  expect(registro?.shop_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(registro)).not.toContain("registro.example");
});

const NESSUN_ADDEBITO = { subscription: null, oneTime: null };
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
          oneTimePurchases: { nodes: [] },
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
    rules: { taxCode: "required_validated" },
  });
});
