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
vi.mock("../../app/billing/domain", () => ({ localDate: vi.fn() }));
vi.mock("../../app/context.server", () => ({
  databaseContext: {},
  waitUntilContext: {},
  webhookQueueContext: {},
}));
vi.mock("../../app/checkout-labels/service.server", () => ({
  acceptCheckoutLabelsCustomization: vi.fn(),
  acceptAddress2Customization: vi.fn(),
  confirmGuidedCheckoutLabels: vi.fn(),
  loadCheckoutLabels: vi.fn(),
  readCheckoutLabelState: vi.fn(),
  saveAddress2FormMode: vi.fn(),
  restoreAddress2Translations: vi.fn(),
  saveRulesAndCheckoutLabels: vi.fn(),
}));
vi.mock("../../app/env.server", () => ({
  APP_API_KEY: "api-key",
  APP_URL: "https://app.example.test",
  ORDER_NORMALIZATION_ENABLED: true,
  APP_VERSION: "1.1.4",
  BILLING_IS_TEST: true,
  TRIAL_LEDGER_HMAC_KEY: "test-key",
}));
vi.mock("../../app/events.server", () => ({ recordEvent: vi.fn() }));
vi.mock("../../app/billing/plan-commands.server", () => ({ startPlanTrial: vi.fn() }));
vi.mock("../../app/shop-profile.server", () => ({
  persistShopDisplayName: vi.fn(),
  safeStoreDisplayName: vi.fn(),
}));
vi.mock("../../app/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../../app/support.server", () => ({ readSupportDiagnosticState: vi.fn() }));
vi.mock("../../app/validation/domain", () => ({ observedConfigHash: vi.fn() }));
vi.mock("../../app/validation/shopify.server", () => ({
  findValidation: vi.fn(),
  queryContext: vi.fn(),
  readOwnValidation: vi.fn(),
}));
vi.mock("../../app/validation/repository.server", () => ({
  readOnboarding: vi.fn(),
  saveOnboarding: vi.fn(),
}));
vi.mock("../../app/validation/reconcile.server", () => ({ reconcile: vi.fn() }));
vi.mock("../../app/validation/write.server", () => ({
  saveValidationConfig: vi.fn(),
  setValidationEnabled: vi.fn(),
}));
