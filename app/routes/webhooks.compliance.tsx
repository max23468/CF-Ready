import type { ActionFunctionArgs } from "react-router";
import { recordEvent } from "../events.server";
import { redactShop } from "../shop.server";
import { authenticate } from "../shopify.server";
import { handleWebhook } from "../webhooks.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const db = context.cloudflare.env.DB;
  const webhook = await authenticate.webhook(request);

  // CF Ready non conserva dati acquirente: i topic `customers/*` non hanno nulla da cancellare.
  return handleWebhook(db, webhook, async () => {
    const { shop, topic } = webhook;
    if (topic !== "SHOP_REDACT") {
      await recordEvent(db, {
        shopDomain: shop,
        name: "compliance_acknowledged",
        class: "lifecycle",
        metadata: { topic },
      });
      return;
    }

    if (await redactShop(db, shop)) {
      await recordEvent(db, { name: "shop_redacted", class: "lifecycle", metadata: { topic } });
      return;
    }

    await recordEvent(db, {
      shopDomain: shop,
      name: "shop_redact_skipped",
      class: "lifecycle",
      metadata: { topic, reason: "installation_active" },
    });
  });
};
