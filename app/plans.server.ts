import {
  BillingInterval,
  BillingReplacementBehavior,
} from "@shopify/shopify-app-react-router/server";
import type { PricingGeneration } from "./billing.server";

export type PlanKind = "monthly" | "annual" | "one_time";

export const CURRENCY = "EUR";

// Prezzi del Master Plan §14.2. La generazione `value` è un'ipotesi interna: non ha piani
// finché non esiste una decisione commerciale, quindi non è acquistabile per errore.
const AMOUNTS: Record<"launch" | "balanced", Record<PlanKind, number>> = {
  launch: { monthly: 2.99, annual: 29.9, one_time: 89.9 },
  balanced: { monthly: 3.99, annual: 39.9, one_time: 119.9 },
};

// La generazione senza piani non è acquistabile: chi chiama riceve `null`, non un nome
// inventato che Shopify rifiuterebbe.
export function planFor(generation: PricingGeneration, kind: PlanKind) {
  if (generation === "value") return null;
  return { name: `${generation}-${kind}` as const, amount: AMOUNTS[generation][kind] };
}

// Prezzi da mostrare al merchant per la generazione acquisita.
export function planPrices(generation: PricingGeneration) {
  if (generation === "value") return null;
  return { generation, ...AMOUNTS[generation] };
}

// I cambi fra mensile e annuale usano il comportamento nativo Shopify: nessun calcolo di
// proratazione custom.
const subscription = (
  amount: number,
  interval: BillingInterval.Every30Days | BillingInterval.Annual,
) => ({
  replacementBehavior: BillingReplacementBehavior.Standard,
  lineItems: [{ amount, currencyCode: CURRENCY, interval }],
});

// Un solo pagamento per lo store: Manual Pricing consente l'acquisto una tantum accanto
// alle sottoscrizioni, che Shopify App Pricing non permetterebbe.
const oneTime = (amount: number) => ({
  amount,
  currencyCode: CURRENCY,
  interval: BillingInterval.OneTime as const,
});

export const BILLING_PLANS = {
  "launch-monthly": subscription(AMOUNTS.launch.monthly, BillingInterval.Every30Days),
  "launch-annual": subscription(AMOUNTS.launch.annual, BillingInterval.Annual),
  "launch-one_time": oneTime(AMOUNTS.launch.one_time),
  "balanced-monthly": subscription(AMOUNTS.balanced.monthly, BillingInterval.Every30Days),
  "balanced-annual": subscription(AMOUNTS.balanced.annual, BillingInterval.Annual),
  "balanced-one_time": oneTime(AMOUNTS.balanced.one_time),
};
