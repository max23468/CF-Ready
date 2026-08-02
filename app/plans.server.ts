import type { PricingGeneration } from "./billing.server";
import { CURRENCY } from "./config";

export type PlanKind = "monthly" | "annual" | "one_time";

export { CURRENCY } from "./config";

// Prezzi del Master Plan §14.2. La generazione `value` è un'ipotesi interna: non ha prezzi
// finché non esiste una decisione commerciale, quindi non è acquistabile per errore.
const AMOUNTS: Record<"launch" | "balanced", Record<PlanKind, number>> = {
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

// La generazione senza prezzi non è acquistabile: chi chiama riceve `null`, non un addebito
// costruito su un importo inesistente.
export function planFor(generation: PricingGeneration, kind: PlanKind) {
  if (generation === "value") return null;
  return {
    name: LABELS[kind],
    amount: AMOUNTS[generation][kind],
    currency: CURRENCY,
    interval: INTERVALS[kind],
  };
}

// Prezzi da mostrare al merchant per la generazione acquisita.
export function planPrices(generation: PricingGeneration) {
  if (generation === "value") return null;
  return { generation, ...AMOUNTS[generation] };
}
