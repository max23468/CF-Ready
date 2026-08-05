import type { ActionFunctionArgs } from "react-router";
import { databaseContext, webhookQueueContext } from "../context.server";
import { authenticate } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const webhook = await authenticate.webhook(request);

  return handleWebhook(context.get(databaseContext), webhook, context.get(webhookQueueContext), {
    currentScopes: webhook.payload.current as string[],
  });
};
