import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowedShop: "",
  bindings: {} as Record<string, unknown>,
  shopifyOptions: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  logEvent: vi.fn(),
  recordInstallOnce: vi.fn(),
  recordSessionTiming: vi.fn(),
  refuseInstall: vi.fn(),
  sessionStorage: vi.fn(),
  shopifyApp: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  get env() {
    return state.bindings;
  },
}));

vi.mock("../app/env.server", () => ({
  get ALLOWED_SHOP() {
    return state.allowedShop;
  },
}));

vi.mock("../app/events.server", () => ({ logEvent: mocks.logEvent }));
vi.mock("../app/shop.server", () => ({
  recordInstallOnce: mocks.recordInstallOnce,
  refuseInstall: mocks.refuseInstall,
}));
vi.mock("../app/session-storage.server", () => ({
  D1SessionStorage: class {
    kind = "d1-session-storage";

    constructor(...args: unknown[]) {
      mocks.sessionStorage(...args);
    }
  },
  recordSessionTiming: mocks.recordSessionTiming,
}));

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  ApiVersion: { July26: "2026-07" },
  AppDistribution: { AppStore: "app-store" },
  shopifyApp: mocks.shopifyApp,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.allowedShop = "";
  state.bindings = { DB: { name: "db" } };
  state.shopifyOptions = [];
  mocks.shopifyApp.mockImplementation((options: Record<string, unknown>) => {
    state.shopifyOptions.push(options);
    return {
      addDocumentResponseHeaders: vi.fn(),
      authenticate: { admin: vi.fn() },
      unauthenticated: { admin: vi.fn() },
      registerWebhooks: vi.fn(),
    };
  });
});

test("il bootstrap Shopify usa fallback locali", async () => {
  const module = await import("../app/shopify.server");

  expect(mocks.sessionStorage).toHaveBeenCalledWith(state.bindings.DB, "");
  expect(state.shopifyOptions[0]).toMatchObject({
    apiKey: undefined,
    apiSecretKey: "",
    apiVersion: "2026-07",
    scopes: undefined,
    appUrl: "",
    authPathPrefix: "/auth",
    distribution: "app-store",
    polarisUrl: "https://cdn.shopify.com/shopifycloud/polaris-2.0-rc.js",
    future: { expiringOfflineAccessTokens: true },
  });
  expect(module.sessionStorage).toEqual({ kind: "d1-session-storage" });
});

test("il bootstrap inoltra binding espliciti e dominio custom", async () => {
  state.bindings = {
    DB: { name: "db" },
    SCOPES: "write_validations,read_own_subscription_contracts",
    SESSION_ENCRYPTION_KEY: "session-key",
    SHOPIFY_API_KEY: "api-key",
    SHOPIFY_API_SECRET: "api-secret",
    SHOPIFY_APP_URL: "https://app.example.test/path",
    SHOP_CUSTOM_DOMAIN: "checkout.example.test",
  };

  await import("../app/shopify.server");

  expect(mocks.sessionStorage).toHaveBeenCalledWith(state.bindings.DB, "session-key");
  expect(state.shopifyOptions[0]).toMatchObject({
    apiKey: "api-key",
    apiSecretKey: "api-secret",
    scopes: ["write_validations", "read_own_subscription_contracts"],
    appUrl: "https://app.example.test/path",
    customShopDomains: ["checkout.example.test"],
  });
});

test("afterAuth rifiuta uno store diverso da quello Development consentito", async () => {
  state.allowedShop = "cf-ready-dev.myshopify.com";
  await import("../app/shopify.server");
  const afterAuth = (
    state.shopifyOptions[0].hooks as {
      afterAuth: (input: { session: { shop: string }; admin: unknown }) => Promise<void>;
    }
  ).afterAuth;

  await expect(
    afterAuth({ session: { shop: "wrong.myshopify.com" }, admin: {} }),
  ).rejects.toMatchObject({ status: 403 });
  expect(mocks.refuseInstall).toHaveBeenCalledWith(state.bindings.DB, "wrong.myshopify.com");
  expect(mocks.recordInstallOnce).not.toHaveBeenCalled();
});

test("afterAuth registra l'installazione senza duplicare la riconciliazione della rotta", async () => {
  await import("../app/shopify.server");
  const afterAuth = (
    state.shopifyOptions[0].hooks as {
      afterAuth: (input: { session: { shop: string } }) => Promise<void>;
    }
  ).afterAuth;

  const session = { shop: "merchant.myshopify.com" };
  await afterAuth({ session });

  expect(mocks.recordInstallOnce).toHaveBeenCalledWith(state.bindings.DB, "merchant.myshopify.com");
  expect(mocks.recordSessionTiming).toHaveBeenCalledWith(
    session,
    "auth_after_hook",
    expect.any(Number),
  );
  expect(mocks.logEvent).not.toHaveBeenCalled();
});

test("afterAuth resta fail-open e registra soltanto il codice tecnico", async () => {
  mocks.recordInstallOnce.mockRejectedValue(new Error("errore D1 sintetico"));
  await import("../app/shopify.server");
  const afterAuth = (
    state.shopifyOptions[0].hooks as {
      afterAuth: (input: { session: { shop: string }; admin: unknown }) => Promise<void>;
    }
  ).afterAuth;

  await expect(
    afterAuth({ session: { shop: "merchant.myshopify.com" }, admin: {} }),
  ).resolves.toBeUndefined();
  expect(mocks.logEvent).toHaveBeenCalledWith(
    {
      name: "install_record_failed",
      class: "error",
      metadata: { error_code: "install_record_failed" },
    },
    expect.any(String),
  );
});
