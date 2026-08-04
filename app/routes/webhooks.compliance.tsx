import type { ActionFunctionArgs } from "react-router";
import { databaseContext, webhookQueueContext } from "../context.server";
import { authenticate } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.get(databaseContext);
  const webhook = await authenticate.webhook(request);

  return handleWebhook(db, webhook, context.get(webhookQueueContext));
};
