import { authenticateWebhook } from "./shopify-webhook.server";
import { handleWebhook, type WebhookJob } from "./webhook-ingress.server";

export const WEBHOOK_PATHS = new Set([
  "/webhooks/app/uninstalled",
  "/webhooks/app/scopes_update",
  "/webhooks/shop/update",
  "/webhooks/app/billing",
  "/webhooks/compliance",
]);

// Il Paese dello store è solo diagnostico: una conferma vecchia di pochi minuti non cambia
// Validation, billing o configurazione.
const CONFIRMED_COUNTRY_TTL_MS = 10 * 60 * 1000;
const confirmedCountries = new Map<string, { countryCode: string; expiresAt: number }>();

export async function handleWebhookRequest(
  pathname: string,
  request: Request,
  db: D1Database,
  queue: Queue<WebhookJob> | undefined,
) {
  const webhook = await authenticateWebhook(request);

  if (pathname === "/webhooks/shop/update") {
    const countryCode = webhook.payload.country_code;
    if (typeof countryCode === "string") {
      // Alcuni store inviano centinaia di update l'ora: il Paese già confermato da D1 evita la
      // lettura remota che, nei rari picchi di latenza, supera il timeout di consegna Shopify.
      const confirmed = confirmedCountries.get(webhook.shop);
      if (confirmed?.countryCode === countryCode && confirmed.expiresAt > Date.now()) {
        return new Response(null, { status: 200 });
      }
      const unchanged = await db
        .prepare("SELECT 1 FROM shops WHERE shop_domain = ? AND country_code = ?")
        .bind(webhook.shop, countryCode)
        .first();
      if (unchanged) {
        confirmedCountries.set(webhook.shop, {
          countryCode,
          expiresAt: Date.now() + CONFIRMED_COUNTRY_TTL_MS,
        });
        return new Response(null, { status: 200 });
      }
      confirmedCountries.delete(webhook.shop);
    }
  }

  if (pathname === "/webhooks/app/scopes_update") {
    return handleWebhook(db, webhook, queue, {
      currentScopes: Array.isArray(webhook.payload.current)
        ? webhook.payload.current.filter((scope): scope is string => typeof scope === "string")
        : [],
    });
  }

  return handleWebhook(db, webhook, queue);
}
