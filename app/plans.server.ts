import type { PricingGeneration } from "./billing/types";
import { CURRENCY } from "./config";

export type PlanKind = "monthly" | "annual" | "one_time";

// Prezzi del Master Plan §14.2.
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

// Un solo pagamento accanto alle sottoscrizioni è possibile solo con Manual Pricing.
const INTERVALS = {
  monthly: "EVERY_30_DAYS",
  annual: "ANNUAL",
  one_time: null,
} as const;

export function planFor(generation: PricingGeneration, kind: PlanKind) {
  return {
    name: LABELS[kind],
    amount: AMOUNTS[generation][kind],
    currency: CURRENCY,
    interval: INTERVALS[kind],
  };
}

// Prezzi da mostrare al merchant per la generazione acquisita.
export function planPrices(generation: PricingGeneration) {
  return { generation, ...AMOUNTS[generation] };
}
