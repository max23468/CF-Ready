import { env } from "cloudflare:test";

export async function insertShop(shopDomain: string) {
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

export const NESSUN_ADDEBITO = { subscription: null, oneTime: null, pendingOneTime: false };
export const opzioni = {
  today: "2026-08-01",
  timeZone: "Europe/Rome",
  pricingGeneration: "launch" as const,
};

// Un identificatore Shopify è unico nel mondo reale: i test non devono riusarlo, altrimenti
// l'indice di idempotenza scarta l'evento del test successivo.
export function abbonamento(
  id: string,
  currentPeriodEnd: string,
  interval: "EVERY_30_DAYS" | "ANNUAL" = "EVERY_30_DAYS",
) {
  return {
    subscription: {
      id,
      name: "launch-monthly",
      currentPeriodEnd,
      interval,
      amount: "2.99",
      currency: "EUR",
    },
    oneTime: null,
    pendingOneTime: false,
  };
}
