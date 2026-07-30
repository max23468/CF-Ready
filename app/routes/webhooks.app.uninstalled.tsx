import type { ActionFunctionArgs } from "react-router";
import { recordEvent } from "../events.server";
import { markUninstalled } from "../shop.server";
import { authenticate, sessionStorage } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.cloudflare.env.DB;
  const webhook = await authenticate.webhook(request);

  return handleWebhook(db, webhook, async () => {
    await markUninstalled(db, webhook.shop);
    await sessionStorage.deleteSessionsByShop(webhook.shop);
    await recordEvent(db, {
      shopDomain: webhook.shop,
      name: "app_uninstalled",
      class: "lifecycle",
    });
  });
};
