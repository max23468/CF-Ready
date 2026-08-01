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
      // Senza sessione non esiste un token valido: ritentare non aiuta.
      await recordEvent(db, {
        shopDomain: shop,
        webhookId: webhook.webhookId,
        name: "shop_update_skipped",
        class: "lifecycle",
        metadata: { error_code: "missing_admin_context" },
      });
      return;
    }

    const state = await reconcile(admin, db, shop);
    await recordEvent(db, {
      shopDomain: shop,
      webhookId: webhook.webhookId,
      name: "shop_updated",
      class: "lifecycle",
      metadata: {
        country_code: state.countryCode,
        enabled: state.validationEnabled,
        ...(state.errorCode ? { error_code: state.errorCode } : {}),
      },
    });
  });
};
