import { expect, test } from "vitest";
import { addDays, entitlementFor, remainingTrialDays } from "../../app/billing.server";
import { configWithEntitlement, entitlementDiffers } from "../../app/validation.server";

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
