export const NESSUN_ADDEBITO = {
  subscription: null,
  latestSubscription: null,
  oneTime: null,
  pendingOneTime: false,
};
export const opzioni = {
  today: "2026-08-01",
  timeZone: "Europe/Rome",
  pricingGeneration: "launch" as const,
};

// Un identificatore Shopify è unico nel mondo reale: i test non devono riusarlo, altrimenti
// l'indice di idempotenza scarta l'evento del test successivo.
export function abbonamento(
  id: string,
  currentPeriodEnd: string | null,
  interval: "EVERY_30_DAYS" | "ANNUAL" = "EVERY_30_DAYS",
) {
  const subscription = {
    id,
    name: "launch-monthly",
    status: "ACTIVE" as const,
    createdAt: "2026-07-01T00:00:00Z",
    trialDays: 0,
    test: true,
    currentPeriodEnd,
    interval,
    amount: "2.99",
    currency: "EUR",
  };
  return {
    subscription,
    latestSubscription: subscription,
    oneTime: null,
    pendingOneTime: false,
  };
}
