import type { Entitlement } from "../config";
import type { BillingAccount, PricingGeneration, ShopifyBilling, Trial } from "./types";

// Data di lancio provvisoria: la generazione Launch copre i primi 90 giorni. Finché il lancio
// non è avvenuto la finestra non è ancora aperta, quindi vale comunque il prezzo di lancio.
export const LAUNCH_WINDOW_END = "2026-11-29";
export const TRIAL_DAYS = 14;

export function requestedRecurringPlanIsActive(
  billing: ShopifyBilling,
  kind: "monthly" | "annual" | "one_time",
) {
  if (kind === "one_time") return false;
  return billing.subscription?.interval === (kind === "monthly" ? "EVERY_30_DAYS" : "ANNUAL");
}

export function pricingGeneration(eligibleOn: string): PricingGeneration {
  return eligibleOn <= LAUNCH_WINDOW_END ? "launch" : "balanced";
}

export function currentPricingGeneration(
  trial: Trial | null,
  account: BillingAccount | null,
  today: string,
): PricingGeneration {
  if (account?.entitlement_status === "active" || account?.entitlement_status === "ending") {
    return account.pricing_generation;
  }
  if (trial?.status === "active" && trial.ends_at && trial.ends_at >= today) {
    return trial.pricing_generation;
  }
  return pricingGeneration(today);
}

export function trialEnd(startedOn: string) {
  return addDays(startedOn, TRIAL_DAYS - 1);
}

export function remainingTrialDays(trial: Trial | null, today: string) {
  if (trial?.status !== "active" || !trial.ends_at || trial.ends_at < today) return 0;
  return Math.round((Date.parse(trial.ends_at) - Date.parse(today)) / 86_400_000) + 1;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function localDate(timeZone: string, now = new Date()) {
  let formatter = dateFormatters.get(timeZone);

  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" });
    } catch {
      // Fuso sconosciuto: UTC è una scelta prudente, sposta la scadenza di poche ore.
      return now.toISOString().slice(0, 10);
    }
    dateFormatters.set(timeZone, formatter);
  }

  return formatter.format(now);
}

export function entitlementFor(
  trial: Trial | null,
  today: string,
  account?: BillingAccount | null,
): Entitlement {
  if (account?.plan_kind === "one_time" && account.entitlement_status === "active") {
    return { kind: "one_time", validThrough: null };
  }
  if (
    (account?.entitlement_status === "active" || account?.entitlement_status === "ending") &&
    account.current_period_end &&
    account.current_period_end >= today
  ) {
    return { kind: "subscription", validThrough: account.current_period_end };
  }
  if (trial?.status === "active" && trial.ends_at && trial.ends_at >= today) {
    return { kind: "trial", validThrough: trial.ends_at };
  }
  return { kind: "none", validThrough: null };
}

export function proratedCredit({
  amount,
  interval,
  periodEnd,
  today,
}: {
  amount: string | null;
  interval: "EVERY_30_DAYS" | "ANNUAL" | null;
  periodEnd: string | null;
  today: string;
}) {
  if (!amount || !interval || !periodEnd) return null;

  const cycleDays = interval === "ANNUAL" ? 365 : 30;
  const remaining = Math.round((Date.parse(periodEnd) - Date.parse(today)) / 86_400_000);
  if (remaining <= 0) return 0;

  return Math.round(Number(amount) * Math.min(remaining, cycleDays) * 100) / cycleDays / 100;
}

export function addDays(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
