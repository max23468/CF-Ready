import type { ActionFunctionArgs } from "react-router";
import { databaseContext } from "../context.server";
import { recordEvent } from "../events.server";
import { redactShop } from "../shop.server";
import { authenticate } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.get(databaseContext);
  const webhook = await authenticate.webhook(request);

  // CF Ready non conserva dati acquirente: i topic `customers/*` non hanno nulla da cancellare.
  return handleWebhook(db, webhook, async () => {
    const { shop, topic } = webhook;
    if (topic !== "SHOP_REDACT") {
      await recordEvent(db, {
        shopDomain: shop,
        webhookId: webhook.webhookId,
        name: "compliance_acknowledged",
        class: "lifecycle",
        metadata: { topic },
      });
      return;
    }

    if (await redactShop(db, shop, webhook.webhookId)) return;

    await recordEvent(db, {
      shopDomain: shop,
      webhookId: webhook.webhookId,
      name: "shop_redact_skipped",
      class: "lifecycle",
      metadata: { topic, reason: "installation_active" },
    });
  });
};
