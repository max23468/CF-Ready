import { afterEach, beforeEach, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../app/config";
import { render, type Rendered } from "./render";

export const router = {
  actionData: undefined as unknown,
  fetcher: {
    data: undefined as unknown,
    formData: undefined as FormData | undefined,
    state: "idle",
    submit: vi.fn(),
  },
  loaderData: undefined as unknown,
  location: { pathname: "/app", state: null as unknown },
  navigate: vi.fn(),
  navigation: { state: "idle" },
  revalidator: { revalidate: vi.fn(), state: "idle" },
  restoreEmbeddedAdmin: vi.fn(),
  submit: vi.fn(),
};

const mounted: Rendered[] = [];

export const homeData = {
  locale: "it",
  shopName: "Negozio Demo",
  shopDomain: "demo.myshopify.com",
  version: "1.1.4",
  countryCode: "IT",
  validationEnabled: false,
  rules: { taxCode: "unmanaged", pec: "unmanaged" },
  messagesDefault: true,
  trialEndsAt: null,
  remaining: 7,
  entitlement: { kind: "none", validThrough: null },
  complimentary: false,
  firstChargeAt: null,
  trialStatus: null,
  plan: { monthly: 2.99, annual: 29.9, one_time: 89.9, generation: "launch" },
  planKind: "none",
  periodEnd: null,
  accountStatus: "none",
  creditEstimate: null,
  errorCode: null,
  onboarding: "not_started",
  showMerchantCheckIn: false,
  reviewDue: false,
  checkoutLabels: {
    status: "unknown",
    mode: "off",
    address2Classification: "unknown",
  },
} as const;

// La Home riceve lo stato salvato e la conferma Shopify differita (D-167).
export function confirmedHome<T extends object>(data: T, confirmed?: Promise<unknown>) {
  return {
    home: { ...data, verified: false },
    confirmed: confirmed ?? Promise.resolve({ ...data, verified: true }),
  };
}

export const onboardingData = {
  locale: "it",
  step: 1,
  completed: false,
  rules: DEFAULT_CONFIG.rules,
  messages: DEFAULT_CONFIG.messages,
  enabled: false,
  entitlementKind: "none",
  entitled: false,
  trialStatus: null,
  labelScopesGranted: false,
  labelState: { mode: "off", address2Classification: "unknown" },
  labelSnapshot: null,
} as const;

beforeEach(() => {
  router.actionData = undefined;
  router.fetcher.data = undefined;
  router.fetcher.formData = undefined;
  router.fetcher.state = "idle";
  router.fetcher.submit.mockReset();
  router.location = { pathname: "/app", state: null };
  router.navigate.mockReset();
  router.navigation = { state: "idle" };
  router.revalidator.revalidate.mockReset();
  router.restoreEmbeddedAdmin.mockReset().mockReturnValue(false);
  router.submit.mockReset();
  vi.stubGlobal("shopify", {
    loading: vi.fn(),
    scopes: {
      request: vi.fn().mockResolvedValue({ result: "granted-all" }),
    },
    saveBar: { hide: vi.fn(), show: vi.fn() },
    toast: { show: vi.fn() },
  });
});

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  document
    .querySelectorAll("style[data-test-onboarding-summary]")
    .forEach((style) => style.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export async function mount(element: React.ReactElement) {
  const view = await render(element);
  mounted.push(view);
  return view;
}

export function labelSlot(overrides: Record<string, unknown>) {
  return {
    resourceId: "gid://shopify/OnlineStoreThemeLocaleContent/1",
    key: "shopify.checkout.contact.address2_label",
    name: "address2",
    locale: "it",
    family: "it",
    marketId: null,
    marketName: null,
    kind: "global_translation",
    capability: "guided",
    currentValue: "Interno",
    sourceValue: "Interno",
    sourceDigest: "digest",
    outdated: false,
    ...overrides,
  };
}
