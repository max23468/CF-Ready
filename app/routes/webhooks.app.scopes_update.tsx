import type { ActionFunctionArgs } from "react-router";
import { databaseContext, webhookQueueContext } from "../context.server";
import { authenticateWebhook } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const webhook = await authenticateWebhook(request);

  return handleWebhook(context.get(databaseContext), webhook, context.get(webhookQueueContext), {
    currentScopes: Array.isArray(webhook.payload.current)
      ? webhook.payload.current.filter((scope): scope is string => typeof scope === "string")
      : [],
  });
};
