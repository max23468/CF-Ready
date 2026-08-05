import { recordEvent } from "./events.server";
import { markUninstalled, redactShop } from "./shop.server";
import { sessionStorage, unauthenticated } from "./shopify.server";
import { reconcile } from "./validation.server";
import { runClaimedWebhook, type WebhookJob } from "./webhooks.server";

export async function processWebhookJob(db: D1Database, job: WebhookJob) {
  await runClaimedWebhook(db, job, async (claim) => {
    const { shop, topic, webhookId } = claim;

    if (topic === "APP_UNINSTALLED") {
      if (claim.installationStartedAt) {
        await markUninstalled(db, shop, claim.installationStartedAt, webhookId);
      }
      return;
    }

    if (topic === "APP_SCOPES_UPDATE") {
      const sessions = await sessionStorage.findSessionsByShop(shop);
      const session = sessions.find(({ isOnline }) => !isOnline);
      if (session && job.currentScopes) {
        session.scope = job.currentScopes.join(",");
        await sessionStorage.storeSession(session);
      }
      return;
    }

    if (topic === "SHOP_REDACT") {
      if (await redactShop(db, shop, webhookId)) return;
      await recordEvent(db, {
        shopDomain: shop,
        webhookId,
        name: "shop_redact_skipped",
        class: "lifecycle",
        metadata: { topic, reason: "installation_active" },
      });
      return;
    }

    if (topic === "CUSTOMERS_DATA_REQUEST" || topic === "CUSTOMERS_REDACT") {
      // CF Ready non conserva dati acquirente: i topic customers/* non hanno nulla da cancellare.
      await recordEvent(db, {
        shopDomain: shop,
        webhookId,
        name: "compliance_acknowledged",
        class: "lifecycle",
        metadata: { topic },
      });
      return;
    }

    if (topic === "SHOP_UPDATE") {
      await reconcileWebhook(db, shop, webhookId, "shop");
      return;
    }

    if (topic === "APP_SUBSCRIPTIONS_UPDATE" || topic === "APP_PURCHASES_ONE_TIME_UPDATE") {
      await reconcileWebhook(db, shop, webhookId, "billing");
      return;
    }

    throw new Error("unsupported_webhook_topic");
  });
}

async function reconcileWebhook(
  db: D1Database,
  shop: string,
  webhookId: string,
  kind: "shop" | "billing",
) {
  const sessions = await sessionStorage.findSessionsByShop(shop);
  if (!sessions.some(({ isOnline }) => !isOnline)) {
    await recordEvent(db, {
      shopDomain: shop,
      webhookId,
      name: kind === "shop" ? "shop_update_skipped" : "billing_update_skipped",
      class: kind === "shop" ? "lifecycle" : "billing",
      metadata: { error_code: "missing_admin_context" },
    });
    return;
  }

  const { admin } = await unauthenticated.admin(shop);
  const state = await reconcile(admin, db, shop);
  await recordEvent(db, {
    shopDomain: shop,
    webhookId,
    name: kind === "shop" ? "shop_updated" : "billing_updated",
    class: kind === "shop" ? "lifecycle" : "billing",
    metadata:
      kind === "shop"
        ? {
            country_code: state.countryCode,
            enabled: state.validationEnabled,
            ...(state.errorCode ? { error_code: state.errorCode } : {}),
          }
        : {
            reason: state.account?.entitlement_status ?? "none",
            ...(state.errorCode ? { error_code: state.errorCode } : {}),
          },
  });
}
