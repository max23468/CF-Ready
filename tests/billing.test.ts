import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  entitlementFor,
  localDate,
  pricingGeneration,
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
