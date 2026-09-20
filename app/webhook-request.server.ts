import { authenticateWebhook } from "./shopify-webhook.server";
import { handleWebhook, type WebhookJob } from "./webhook-ingress.server";

export const WEBHOOK_PATHS = new Set([
  "/webhooks/app/uninstalled",
  "/webhooks/app/scopes_update",
  "/webhooks/shop/update",
  "/webhooks/app/billing",
  "/webhooks/compliance",
]);

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
      const unchanged = await db
        .prepare("SELECT 1 FROM shops WHERE shop_domain = ? AND country_code = ?")
        .bind(webhook.shop, countryCode)
        .first();
      if (unchanged) return new Response(null, { status: 200 });
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
