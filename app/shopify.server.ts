import { env } from "cloudflare:workers";
import { LogSeverity, shopifyApi } from "@shopify/shopify-api";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { logEvent } from "./events.server";
import { D1SessionStorage, recordSessionTiming } from "./session-storage.server";
import { ALLOWED_SHOP } from "./env.server";
import { recordInstallOnce, refuseInstall } from "./shop.server";
import { POLARIS_URL } from "./shopify-ui";

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
  polarisUrl: POLARIS_URL,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Installazione e rinnovo registrano il lifecycle; la rotta di destinazione riconcilia
    // lo stato autorevole senza duplicare chiamate Shopify nel percorso critico di auth.
    afterAuth: async ({ session }) => {
      const startedAt = performance.now();
      if (ALLOWED_SHOP && session.shop !== ALLOWED_SHOP) {
        await refuseInstall(bindings.DB, session.shop);
        throw new Response("Questa installazione di CF Ready è riservata allo store di sviluppo.", {
          status: 403,
        });
      }

      try {
        await recordInstallOnce(bindings.DB, session.shop);
      } catch {
        // Fail-open: la Home riconcilia comunque lo stato autorevole dopo l'autenticazione.
        logEvent(
          {
            name: "install_record_failed",
            class: "error",
            metadata: { error_code: "install_record_failed" },
          },
          new Date().toISOString(),
        );
      } finally {
        recordSessionTiming(session, "auth_after_hook", performance.now() - startedAt);
      }
    },
  },
  ...(bindings.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [bindings.SHOP_CUSTOM_DOMAIN] } : {}),
});

let refreshApi: ReturnType<typeof shopifyApi> | undefined;

// `shopifyApp` rinnova il token offline solo negli ultimi cinque minuti e non espone il proprio
// client: il cron usa lo stesso grant ufficiale con la configurazione dell'app.
export async function refreshOfflineSession(shop: string, refreshToken: string) {
  refreshApi ??= shopifyApi({
    apiKey: bindings.SHOPIFY_API_KEY,
    apiSecretKey: bindings.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.July26,
    scopes: bindings.SCOPES?.split(","),
    hostName: new URL(bindings.SHOPIFY_APP_URL || "").host,
    isEmbeddedApp: true,
    logger: { level: LogSeverity.Error },
    ...(bindings.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [bindings.SHOP_CUSTOM_DOMAIN] } : {}),
  });
  const { session } = await refreshApi.auth.refreshToken({ shop, refreshToken });
  return session;
}

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const sessionStorage = d1SessionStorage;
