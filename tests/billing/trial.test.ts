import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  entitlementFor,
  localDate,
  pricingGeneration,
  startTrial,
  syncTrial,
  trialEnd,
} from "../../app/billing.server";
import { trialLedgerHash } from "../../app/hash.server";
import { redactShop } from "../../app/shop.server";
import { insertShop } from "../support/billing";

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

test("uno store estero può avviare la prova", async () => {
  const shop = await insertShop("estero.example.myshopify.com");

  expect(await startTrial(env.DB, shop, { today: "2026-07-30" })).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
  });
});

// Il merchant decide quando cominciare: aprire l'app, anche molte volte, non gli toglie
// nemmeno un giorno di prova. È il comportamento che distingue questa versione dalla
// precedente, dove la prova partiva al primo accesso idoneo.
test("aprire l'app non avvia la prova: la avvia solo una richiesta esplicita", async () => {
  const shop = await insertShop("attesa.example.myshopify.com");

  expect(await syncTrial(env.DB, shop, { today: "2026-07-30" })).toBeNull();
  expect(await syncTrial(env.DB, shop, { today: "2026-08-20" })).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS totale FROM trials WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)",
    )
      .bind(shop)
      .first<{ totale: number }>(),
  ).toMatchObject({ totale: 0 });
  expect(entitlementFor(null, "2026-08-20")).toEqual({ kind: "none", validThrough: null });

  // Chiesta il 20 agosto, la prova dura da lì: i giorni di attesa non sono stati consumati.
  expect(await startTrial(env.DB, shop, { today: "2026-08-20" })).toMatchObject({
    status: "active",
    ends_at: "2026-09-02",
  });

  // Una seconda richiesta non ne apre un'altra né sposta la scadenza.
  expect(await startTrial(env.DB, shop, { today: "2026-08-25" })).toMatchObject({
    ends_at: "2026-09-02",
  });
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS totale FROM app_events
       WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?) AND event_name = 'trial_started'`,
    )
      .bind(shop)
      .first(),
  ).toMatchObject({ totale: 1 });
});

test("la prova parte una volta sola e scade da sé", async () => {
  const shop = await insertShop("prova.example.myshopify.com");

  const avviata = await startTrial(env.DB, shop, { today: "2026-07-30" });
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
  expect(await syncTrial(env.DB, shop, { today: "2026-08-01" })).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
  });

  const scaduta = await syncTrial(env.DB, shop, { today: "2026-08-13" });
  expect(scaduta?.status).toBe("expired");
  expect(entitlementFor(scaduta, "2026-08-13")).toEqual({ kind: "none", validThrough: null });

  // Avvio e scadenza sono registrati una volta sola, anche riaprendo l'app dopo la scadenza.
  await syncTrial(env.DB, shop, { today: "2026-08-14" });
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
    startTrial(env.DB, shop, { today: "2026-07-30" }),
    startTrial(env.DB, shop, { today: "2026-07-30" }),
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

  expect(await startTrial(env.DB, shop, { today: "2026-07-30" })).toMatchObject({
    status: "active",
    ends_at: "2026-08-12",
  });

  // Disinstallazione, `shop/redact` e reinstallazione dello stesso store.
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  expect(await redactShop(env.DB, shop, "wh-ledger-consumato")).toBe(true);
  await insertShop(shop);

  expect(await startTrial(env.DB, shop, { today: "2026-09-01" })).toMatchObject({
    status: "expired",
    ends_at: "2026-08-12",
    pricing_generation: "launch",
  });
});

test("il registro della prova non conserva il dominio in chiaro", async () => {
  const shop = await insertShop("registro.example.myshopify.com");
  await startTrial(env.DB, shop, { today: "2026-07-30" });
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(shop)
    .run();
  await redactShop(env.DB, shop, "wh-ledger-attivo");

  const registro = await env.DB.prepare(
    "SELECT shop_hash, trial_ends_at FROM trial_ledger WHERE shop_hash = ?",
  )
    .bind(await trialLedgerHash(shop))
    .first<{ shop_hash: string; trial_ends_at: string }>();

  expect(registro).toMatchObject({ trial_ends_at: "2026-08-12" });
  expect(registro?.shop_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(registro)).not.toContain("registro.example");
});
