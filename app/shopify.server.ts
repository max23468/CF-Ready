import { LogSeverity, type Session, shopifyApi } from "@shopify/shopify-api";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { logEvent } from "./events.server";
import { D1SessionStorage, recordSessionTiming } from "./session-storage.server";
import { ALLOWED_SHOP, bindings } from "./env.server";
import { recordInstallOnce, refuseInstall } from "./shop.server";
import { POLARIS_URL } from "./shopify-ui";

const shopifyCredentials = {
  apiKey: bindings.SHOPIFY_API_KEY,
  apiSecretKey: bindings.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: bindings.SCOPES?.split(","),
};

async function refuseShopOutsideAllowList(shop: string) {
  if (!ALLOWED_SHOP || ALLOWED_SHOP.split(",").includes(shop)) return;
  await refuseInstall(bindings.DB, shop);
  throw new Response("Questa installazione di CF Ready è riservata allo store di sviluppo.", {
    status: 403,
  });
}

// Il token exchange salva la sessione prima di `afterAuth` e salta l'hook quando rivede lo
// stesso session token entro un minuto: la lista vale quindi già al salvataggio, su ogni
// percorso che persiste una sessione.
class AllowedShopSessionStorage extends D1SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    await refuseShopOutsideAllowList(session.shop);
    return super.storeSession(session);
  }
}

const d1SessionStorage = new AllowedShopSessionStorage(
  bindings.DB,
  bindings.SESSION_ENCRYPTION_KEY || "",
);
const shopify = shopifyApp({
  ...shopifyCredentials,
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
      await refuseShopOutsideAllowList(session.shop);

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
});

let refreshApi: ReturnType<typeof shopifyApi> | undefined;

// `shopifyApp` rinnova il token offline solo negli ultimi cinque minuti e non espone il proprio
// client: il cron usa lo stesso grant ufficiale con la configurazione dell'app.
export async function refreshOfflineSession(shop: string, refreshToken: string) {
  refreshApi ??= shopifyApi({
    ...shopifyCredentials,
    hostName: new URL(bindings.SHOPIFY_APP_URL || "").host,
    isEmbeddedApp: true,
    logger: { level: LogSeverity.Error },
  });
  const { session } = await refreshApi.auth.refreshToken({ shop, refreshToken });
  return session;
}

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const sessionStorage = d1SessionStorage;

// La sessione offline ha un ID derivato dallo store: si legge e si decifra solo quella, senza
// decifrare anche le sessioni online dello stesso store.
export async function findOfflineSession(shop: string) {
  const session = await d1SessionStorage.loadSession(`offline_${shop}`);
  return session && !session.isOnline ? session : undefined;
}
