import { vi } from "vitest";
import { router } from "./route-support";

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return {
    ...original,
    Outlet: () => <main data-outlet="true">Contenuto</main>,
    useActionData: () => router.actionData,
    useFetcher: () => router.fetcher,
    useLoaderData: () => router.loaderData,
    useLocation: () => router.location,
    useNavigate: () => router.navigate,
    useNavigation: () => router.navigation,
    useRevalidator: () => router.revalidator,
    useRouteError: () => new Error("errore route"),
    useRouteLoaderData: () => router.loaderData,
    useSubmit: () => router.submit,
  };
});

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  boundary: {
    error: vi.fn(() => <p>Errore gestito</p>),
    headers: vi.fn(() => new Headers({ "x-boundary": "ok" })),
  },
}));

vi.mock("../../app/embedded-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../app/embedded-admin")>();
  return { ...original, restoreEmbeddedAdmin: router.restoreEmbeddedAdmin };
});

vi.mock("../../app/admin-auth.server", () => ({
  authenticateAdmin: vi.fn(),
  authenticateAdminTimed: vi.fn(),
}));
vi.mock("../../app/billing.server", () => ({ localDate: vi.fn(), startTrial: vi.fn() }));
vi.mock("../../app/context.server", () => ({ databaseContext: {}, waitUntilContext: {} }));
vi.mock("../../app/checkout-labels/repository.server", () => ({
  readCheckoutLabelState: vi.fn(),
  saveAddress2FormMode: vi.fn(),
}));
vi.mock("../../app/checkout-labels/service.server", () => ({
  CHECKOUT_LABEL_OPTIONAL_SCOPES: ["write_translations", "read_locales", "read_markets"],
  acceptCheckoutLabelsCustomization: vi.fn(),
  acceptAddress2Customization: vi.fn(),
  confirmGuidedCheckoutLabels: vi.fn(),
  loadCheckoutLabels: vi.fn(),
  prefetchCheckoutLabels: vi.fn(),
  restoreAddress2Translations: vi.fn(),
  saveRulesAndCheckoutLabels: vi.fn(),
}));
vi.mock("../../app/env.server", () => ({
  APP_API_KEY: "api-key",
  APP_VERSION: "1.1.4",
  BILLING_IS_TEST: true,
  TRIAL_LEDGER_HMAC_KEY: "test-key",
}));
vi.mock("../../app/events.server", () => ({ recordEvent: vi.fn() }));
vi.mock("../../app/shop-profile.server", () => ({
  persistShopDisplayName: vi.fn(),
  safeStoreDisplayName: vi.fn(),
}));
vi.mock("../../app/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../../app/support.server", () => ({ readSupportDiagnosticState: vi.fn() }));
vi.mock("../../app/validation.server", () => ({
  findValidation: vi.fn(),
  observedConfigHash: vi.fn(),
  queryContext: vi.fn(),
  readAddress2Declaration: vi.fn(),
  readOnboarding: vi.fn(),
  reconcile: vi.fn(),
  saveAddress2Declaration: vi.fn(),
  saveOnboarding: vi.fn(),
  writeValidation: vi.fn(),
}));
