import type { ActionFunctionArgs } from "react-router";
import { recordEvent } from "../events.server";
import { authenticate } from "../shopify.server";
import { reconcile } from "../validation.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.cloudflare.env.DB;
  const webhook = await authenticate.webhook(request);

  return handleWebhook(db, webhook, async () => {
    const { admin, shop } = webhook;
    if (!admin) {
      await recordEvent(db, {
        shopDomain: shop,
        webhookId: webhook.webhookId,
        name: "billing_update_skipped",
        class: "billing",
        metadata: { error_code: "missing_admin_context" },
      });
      return;
    }

    // Lo stato commerciale non si deduce dal payload: si rilegge da Shopify e si riconcilia.
    const state = await reconcile(admin, db, shop);
    await recordEvent(db, {
      shopDomain: shop,
      webhookId: webhook.webhookId,
      name: "billing_updated",
      class: "billing",
      metadata: {
        reason: state.account?.entitlement_status ?? "none",
        ...(state.errorCode ? { error_code: state.errorCode } : {}),
      },
    });
  });
};
