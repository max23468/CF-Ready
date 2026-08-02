import type { ActionFunctionArgs } from "react-router";
import { databaseContext } from "../context.server";
import { authenticate, sessionStorage } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const webhook = await authenticate.webhook(request);

  return handleWebhook(context.get(databaseContext), webhook, async () => {
    const { payload, session } = webhook;
    if (session) {
      session.scope = (payload.current as string[]).join(",");
      await sessionStorage.storeSession(session);
    }
  });
};
