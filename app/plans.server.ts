import { CURRENCY } from "./config";

export const PRICING_GENERATIONS = ["launch", "balanced"] as const;
export type PricingGeneration = (typeof PRICING_GENERATIONS)[number];
export type PlanKind = "monthly" | "annual" | "one_time";
export type RecurringInterval = "EVERY_30_DAYS" | "ANNUAL";

const AMOUNTS: Record<PricingGeneration, Record<PlanKind, number>> = {
  launch: { monthly: 2.99, annual: 29.9, one_time: 89.9 },
  balanced: { monthly: 3.99, annual: 39.9, one_time: 119.9 },
};

// Nome che il merchant legge nella pagina di approvazione e nella fattura Shopify.
const LABELS: Record<PlanKind, string> = {
  monthly: "CF Ready — abbonamento mensile",
  annual: "CF Ready — abbonamento annuale",
  one_time: "CF Ready — pagamento unico",
};

// Il pagamento unico accanto alle sottoscrizioni è possibile solo con Manual Pricing.
const INTERVALS: Record<PlanKind, RecurringInterval | null> = {
  monthly: "EVERY_30_DAYS",
  annual: "ANNUAL",
  one_time: null,
};

export function planInterval(kind: PlanKind) {
  return INTERVALS[kind];
}

export function recurringPlanKind(interval: RecurringInterval | null) {
  return interval === "ANNUAL" ? "annual" : "monthly";
}

export function planFor(generation: PricingGeneration, kind: PlanKind) {
  return {
    name: LABELS[kind],
    amount: AMOUNTS[generation][kind],
    currency: CURRENCY,
    interval: INTERVALS[kind],
  };
}

export function planPrices(generation: PricingGeneration) {
  return { generation, ...AMOUNTS[generation] };
}
