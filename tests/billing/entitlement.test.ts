import { expect, test } from "vitest";
import {
  addDays,
  billingCycleStart,
  conversionCreditEstimate,
  entitlementFor,
  proratedCredit,
  remainingTrialDays,
} from "../../app/billing.server";
import { CONFIG_SCHEMA_VERSION } from "../../app/config";
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
    shopify_status: "ACTIVE" as const,
    is_test: 0,
    current_period_start: null,
    current_period_end: null,
  };

  expect(entitlementFor(prova, "2026-08-01", unaTantum)).toEqual({
    kind: "one_time",
    validThrough: null,
  });
});

test("il diritto omaggio permanente prevale su prova e billing assenti", () => {
  expect(
    entitlementFor(null, "2026-08-24", null, {
      status: "active",
      granted_at: "2026-08-24T00:00:00.000Z",
      revoked_at: null,
    }),
  ).toEqual({ kind: "one_time", validThrough: null });

  expect(
    entitlementFor(null, "2026-08-24", null, {
      status: "revoked",
      granted_at: "2026-08-24T00:00:00.000Z",
      revoked_at: "2026-08-25T00:00:00.000Z",
    }),
  ).toEqual({ kind: "none", validThrough: null });
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

test("la riscrittura conserva regole e messaggi e normalizza la modalità legacy", () => {
  const merchant = {
    schemaVersion: 2,
    enabled: true,
    errorDisplay: "preventive",
    entitlement: { kind: "trial", validThrough: "2026-08-01" },
    rules: { taxCode: "optional_validated", pec: "unmanaged" },
    messages: { it: {}, en: {} },
  };

  expect(configWithEntitlement(merchant, { kind: "none", validThrough: null })).toMatchObject({
    errorDisplay: "inline",
    rules: { taxCode: "optional_validated", pec: "unmanaged" },
    entitlement: { kind: "none", validThrough: null },
  });
  // Configurazione illeggibile: si riparte dal default invece di propagare spazzatura.
  expect(configWithEntitlement("rotto", { kind: "none", validThrough: null })).toMatchObject({
    schemaVersion: CONFIG_SCHEMA_VERSION,
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

test("la stima pro-rata usa il ciclo osservato e non considera la prova gratuita", () => {
  const annual = {
    id: "gid://shopify/AppSubscription/annuale",
    name: "Annuale",
    status: "ACTIVE" as const,
    createdAt: "2025-03-01T10:00:00.000Z",
    trialDays: 0,
    test: false,
    currentPeriodEnd: "2026-03-01T10:00:00.000Z",
    interval: "ANNUAL" as const,
    amount: "29.90",
    currency: "EUR",
  };
  const start = billingCycleStart(annual, "Europe/Rome");
  expect(start).toBe("2025-03-01");
  expect(billingCycleStart({ ...annual, currentPeriodEnd: null }, "Europe/Rome")).toBeNull();
  expect(
    proratedCredit({
      amount: annual.amount,
      interval: annual.interval,
      periodStart: start,
      periodEnd: "2026-03-01",
      today: "2025-09-01",
    }),
  ).toBe(14.83);

  expect(
    billingCycleStart(
      {
        ...annual,
        createdAt: "2026-08-01T10:00:00.000Z",
        trialDays: 14,
        currentPeriodEnd: "2026-08-15T10:00:00.000Z",
      },
      "Europe/Rome",
    ),
  ).toBeNull();

  for (const interval of ["EVERY_30_DAYS", "ANNUAL"] as const) {
    expect(
      conversionCreditEstimate(
        {
          ...annual,
          id: `gid://shopify/AppSubscription/trial-${interval}`,
          interval,
          createdAt: "2026-08-01T10:00:00.000Z",
          trialDays: 14,
          currentPeriodEnd: "2026-08-15T10:00:00.000Z",
        },
        "Europe/Rome",
        "2026-08-10",
      ),
    ).toBe(0);
  }

  expect(
    conversionCreditEstimate(
      { ...annual, currentPeriodEnd: null, trialDays: 0 },
      "Europe/Rome",
      "2026-08-10",
    ),
  ).toBeNull();
});
