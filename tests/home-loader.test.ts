import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { createAppContext } from "../app/context.server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  readHomeState: vi.fn(),
  readCheckoutLabelState: vi.fn(),
  readStoredShopSnapshot: vi.fn(),
  readTrial: vi.fn(),
  readBillingAccount: vi.fn(),
  readComplimentaryEntitlement: vi.fn(),
  readLatestBillingConversion: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../app/checkout-labels/repository.server", () => ({
  readCheckoutLabelState: mocks.readCheckoutLabelState,
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { admin: mocks.authenticate },
}));

vi.mock("../app/billing.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/billing.server")>()),
  readTrial: mocks.readTrial,
  readBillingAccount: mocks.readBillingAccount,
  readComplimentaryEntitlement: mocks.readComplimentaryEntitlement,
  readLatestBillingConversion: mocks.readLatestBillingConversion,
}));

vi.mock("../app/validation.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/validation.server")>()),
  readHomeState: mocks.readHomeState,
  readStoredShopSnapshot: mocks.readStoredShopSnapshot,
  reconcile: mocks.reconcile,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const shop = "timing.example.myshopify.com";
const configured = {
  ...DEFAULT_CONFIG,
  rules: { ...DEFAULT_CONFIG.rules, taxCode: "required_validated" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ admin: {}, session: { shop } });
  mocks.readHomeState.mockResolvedValue({
    onboarding: {
      status: "in_progress",
      step: 2,
      errorCode: null,
      validationEnabled: true,
    },
    address2Declaration: null,
    enabledSince: "2026-01-01T00:00:00.000Z",
    merchantCheckInDismissed: false,
    reviewCompleted: false,
  });
  mocks.readCheckoutLabelState.mockResolvedValue({
    mode: "off",
    lastSyncAt: null,
    lastErrorCode: null,
    address2ExternalChangeAt: null,
    address2Classification: "unknown",
    address2Decision: "pending",
  });
  mocks.readStoredShopSnapshot.mockResolvedValue({
    displayName: "Negozio salvato",
    countryCode: "IT",
    config: configured,
  });
  mocks.readTrial.mockResolvedValue(null);
  mocks.readBillingAccount.mockResolvedValue({
    plan_kind: "monthly",
    entitlement_status: "active",
    current_period_end: "2999-01-01",
  });
  mocks.readComplimentaryEntitlement.mockResolvedValue(null);
  mocks.readLatestBillingConversion.mockResolvedValue(null);
});

async function loadHome(waitUntil = vi.fn()) {
  const { headers, loader } = await import("../app/routes/app._index");
  const result = await loader({
    request: new Request("https://example.test/app?locale=it"),
    context: createAppContext({} as D1Database, undefined, waitUntil),
    params: {},
  } as never);
  return { headers, result, waitUntil };
}

test("la Home risponde con lo stato D1 senza attendere la riconciliazione Shopify", async () => {
  const reconciliation = deferred<never>();
  mocks.reconcile.mockReturnValue(reconciliation.promise);

  // Prima di D-167 il loader restava fermo qui finché Shopify non rispondeva.
  const { headers, result, waitUntil } = await loadHome();

  expect(mocks.reconcile).toHaveBeenCalledWith({}, expect.anything(), shop, {
    prefetchBilling: true,
    waitUntil,
  });
  expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  expect(result.data.home).toMatchObject({
    verified: false,
    shopName: "Negozio salvato",
    validationEnabled: true,
    rules: configured.rules,
    entitlement: { kind: "subscription", validThrough: "2999-01-01" },
    onboarding: "in_progress",
    creditEstimate: null,
    reviewDue: false,
  });
  expect(result.data.confirmed).toBeInstanceOf(Promise);

  const serverTiming = new Headers(result.init?.headers).get("Server-Timing");
  const parentHeaders = new Headers({ "X-Shopify-Test": "preserved" });
  const documentHeaders = new Headers(
    headers({
      loaderHeaders: new Headers(result.init?.headers),
      parentHeaders,
    } as never),
  );
  expect(serverTiming).toContain("d1_home;dur=");
  expect(serverTiming).toContain("d1_commercial;dur=");
  expect(serverTiming).toContain("total;dur=");
  expect(serverTiming).not.toContain("reconcile_total");
  expect(serverTiming).not.toContain(shop);
  expect(documentHeaders.get("Server-Timing")).toBe(serverTiming);
  expect(documentHeaders.get("X-Shopify-Test")).toBe("preserved");

  reconciliation.reject(new Error("Shopify non disponibile"));
  await expect(result.data.confirmed).rejects.toThrow();
});

test("la conferma Shopify sostituisce lo stato salvato", async () => {
  mocks.reconcile.mockResolvedValue({
    shopName: "Negozio confermato",
    countryCode: "IT",
    partnerDevelopment: false,
    today: "2026-08-05",
    validation: { metafield: { jsonValue: DEFAULT_CONFIG } },
    validationEnabled: false,
    trial: null,
    account: null,
    complimentary: null,
    entitlement: { kind: "none", validThrough: null },
    creditEstimate: 1.5,
    conversionCredit: null,
    errorCode: "billing_read_failed",
  });

  const { result } = await loadHome();

  await expect(result.data.confirmed).resolves.toMatchObject({
    verified: true,
    shopName: "Negozio confermato",
    validationEnabled: false,
    rules: DEFAULT_CONFIG.rules,
    entitlement: { kind: "none", validThrough: null },
    creditEstimate: 1.5,
    errorCode: "billing_read_failed",
    onboarding: "in_progress",
  });
});

test("senza configurazione salvata la Home parte dai valori predefiniti", async () => {
  mocks.readStoredShopSnapshot.mockResolvedValue({
    displayName: null,
    countryCode: null,
    config: null,
  });
  mocks.readBillingAccount.mockResolvedValue(null);
  mocks.reconcile.mockReturnValue(new Promise(() => undefined));

  const { result } = await loadHome();

  expect(result.data.home).toMatchObject({
    verified: false,
    shopName: shop,
    countryCode: "IT",
    rules: DEFAULT_CONFIG.rules,
    entitlement: { kind: "none", validThrough: null },
  });
});
