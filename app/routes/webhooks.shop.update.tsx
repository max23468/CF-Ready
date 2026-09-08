import type { ActionFunctionArgs } from "react-router";
import { databaseContext, webhookQueueContext } from "../context.server";
import { authenticateWebhook } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.get(databaseContext);
  const webhook = await authenticateWebhook(request);
  const countryCode = webhook.payload.country_code;

  if (typeof countryCode === "string") {
    const unchanged = await db
      .prepare("SELECT 1 FROM shops WHERE shop_domain = ? AND country_code = ?")
      .bind(webhook.shop, countryCode)
      .first();
    if (unchanged) return new Response(null, { status: 200 });
  }

  return handleWebhook(db, webhook, context.get(webhookQueueContext));
};
