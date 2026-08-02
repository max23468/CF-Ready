import type { ActionFunctionArgs } from "react-router";
import { databaseContext } from "../context.server";
import { markUninstalled } from "../shop.server";
import { authenticate } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.get(databaseContext);
  const webhook = await authenticate.webhook(request);

  return handleWebhook(db, webhook, async (claim) => {
    if (claim.installationStartedAt) {
      await markUninstalled(db, webhook.shop, claim.installationStartedAt, webhook.webhookId);
    }
  });
};
