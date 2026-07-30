import { env } from "cloudflare:workers";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { recordEvent } from "./events.server";
import { D1SessionStorage } from "./session-storage.server";
import { recordInstallOnce } from "./shop.server";
import { reconcile } from "./validation.server";

type ShopifyBindings = Env & {
  SCOPES?: string;
  SESSION_ENCRYPTION_KEY?: string;
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
  SHOP_CUSTOM_DOMAIN?: string;
};

const bindings = env as ShopifyBindings;
const d1SessionStorage = new D1SessionStorage(bindings.DB, bindings.SESSION_ENCRYPTION_KEY || "");
const shopify = shopifyApp({
  apiKey: bindings.SHOPIFY_API_KEY,
  apiSecretKey: bindings.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: bindings.SCOPES?.split(","),
  appUrl: bindings.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: d1SessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Ogni autenticazione completata, installazione o rinnovo del token: paese e stato
    // tecnico non aspettano la prima Home.
    afterAuth: async ({ session, admin }) => {
      try {
        await recordInstallOnce(bindings.DB, session.shop);
        await reconcile(admin, bindings.DB, session.shop);
      } catch {
        // Fail-open: un errore Shopify non deve far fallire l'autenticazione.
        await recordEvent(bindings.DB, {
          shopDomain: session.shop,
          name: "install_reconcile_failed",
          class: "error",
          metadata: { error_code: "reconcile_failed" },
        });
      }
    },
  },
  ...(bindings.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [bindings.SHOP_CUSTOM_DOMAIN] } : {}),
});

export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = d1SessionStorage;
