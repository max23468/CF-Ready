import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { DEFAULT_CONFIG } from "../../app/config";
import { checkoutLabelSlotId } from "../../app/checkout-labels/domain";
import { texts } from "../../app/i18n";
import { click, dispatch, render, type Rendered } from "./render";

const router = vi.hoisted(() => ({
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
  submit: vi.fn(),
}));

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
    useSubmit: () => router.submit,
  };
});

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  boundary: {
    error: vi.fn(() => <p>Errore gestito</p>),
    headers: vi.fn(() => new Headers({ "x-boundary": "ok" })),
  },
}));

vi.mock("../../app/admin-auth.server", () => ({ authenticateAdmin: vi.fn() }));
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

import App, { ErrorBoundary, headers } from "../../app/routes/app";
import Guide from "../../app/routes/app.guide";
import CustomerMessages from "../../app/routes/app.messages";
import Onboarding from "../../app/routes/app.onboarding";
import CheckoutRules from "../../app/routes/app.rules";
import HomePage from "../../app/features/home/HomePage";
import { MerchantCheckIn } from "../../app/features/home/MerchantCheckIn";
import { PlanChoice } from "../../app/features/home/PlanChoice";
import { PlanStatus } from "../../app/features/home/PlanStatus";
import { SetupGuide } from "../../app/features/home/SetupGuide";

const mounted: Rendered[] = [];

const homeData = {
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

const onboardingData = {
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
  router.submit.mockReset();
  vi.stubGlobal("shopify", {
    loading: vi.fn(),
    scopes: {
      request: vi.fn().mockResolvedValue({ result: "granted-all" }),
    },
    saveBar: { hide: vi.fn(), show: vi.fn() },
  });
});

afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(element: React.ReactElement) {
  const view = await render(element);
  mounted.push(view);
  return view;
}

describe("shell embedded", () => {
  test("gestisce il menu Shopify senza sospendere il render in una View Transition", async () => {
    router.loaderData = {
      apiKey: "api-key",
      shopDomain: "demo.myshopify.com",
      locale: "it",
    };
    const view = await mount(<App />);
    expect(view.container.querySelectorAll("s-app-nav s-link")).toHaveLength(4);
    expect(view.container.querySelector("[data-outlet]")).not.toBeNull();
    expect(shopify.loading).toHaveBeenCalledWith(false);

    const rulesLink = view.container.querySelector('s-link[href="/app/rules"]');
    if (!rulesLink) throw new Error("link Regole assente");
    const retargetedChild = document.createElement("span");
    rulesLink.append(retargetedChild);
    await dispatch(
      retargetedChild,
      new Event("shopify:navigate", { bubbles: true, composed: true }),
    );
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith("/app/rules");
    expect(window.location.pathname).toBe("/");

    router.navigation = { state: "loading" };
    router.location = { pathname: "/app/rules", state: null };
    await view.rerender(<App />);
    expect(shopify.loading).toHaveBeenLastCalledWith(true);
  });

  test("espone boundary e header Shopify", () => {
    expect(ErrorBoundary()).toBeTruthy();
    expect(headers({} as never)).toBeInstanceOf(Headers);
  });
});

describe("Home merchant", () => {
  test("attraversa le varianti commerciali e le relative azioni", async () => {
    const submit = vi.fn();
    const variants = [
      homeData,
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-10" },
        trialStatus: "active",
        trialEndsAt: "2026-09-10",
        remaining: 1,
        rules: { taxCode: "optional_validated", pec: "unmanaged" },
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "annual",
        accountStatus: "active",
        creditEstimate: 12.5,
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "monthly",
        accountStatus: "ending",
      },
      {
        ...homeData,
        entitlement: { kind: "one_time", validThrough: null },
        complimentary: true,
        planKind: "one_time",
      },
    ] as const;

    for (const [index, data] of variants.entries()) {
      const view = await mount(
        <div>
          <PlanChoice
            data={data as never}
            busy={index === 1}
            pendingIntent={index === 1 ? "annual" : null}
            submit={submit}
            firstCharge="oggi"
          />
          <PlanStatus data={data as never} />
          <SetupGuide
            data={data as never}
            busy={false}
            pendingIntent={null}
            pendingSource={null}
            submit={submit}
          />
        </div>,
      );
      for (const button of view.container.querySelectorAll("s-button")) await click(button);
    }
    expect(submit).toHaveBeenCalledWith("monthly");
    expect(submit).toHaveBeenCalledWith("annual");
    expect(submit).toHaveBeenCalledWith("one_time");
    expect(submit).toHaveBeenCalledWith("start_trial");
  });

  test("il check-in copre invio, dismiss e stato occupato", async () => {
    const submit = vi.fn();
    const data = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      validationEnabled: true,
    };
    const view = await mount(
      <MerchantCheckIn
        data={data as never}
        busy={false}
        pendingIntent="dismiss_checkin"
        submit={submit}
      />,
    );
    const banner = view.container.querySelector("s-banner");
    banner?.dispatchEvent(new CustomEvent("dismiss", { bubbles: true }));
    for (const button of view.container.querySelectorAll("s-button")) await click(button);
    expect(submit).toHaveBeenCalledWith("dismiss_checkin", "checkin");
  });

  test("copre primo avvio, errore e azioni principali", async () => {
    router.loaderData = homeData;
    const view = await mount(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.titleNotStarted);
    const startTrial = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").plan.startTrial),
    );
    if (!startTrial) throw new Error("avvio prova assente");
    await click(startTrial);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "start_trial" },
      { method: "post" },
    );

    router.loaderData = { ...homeData, errorCode: "billing_read_failed" };
    router.fetcher.data = { ok: false, errorCode: "generic" };
    await view.rerender(<HomePage />);
    expect(view.container.querySelectorAll('s-banner[tone="critical"]')).toHaveLength(1);
    const repair = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.repair),
    );
    if (!repair) throw new Error("riparazione assente");
    await click(repair);
    expect(router.fetcher.submit).toHaveBeenCalledWith({ intent: "repair" }, { method: "post" });
  });

  test("copre lo stato attivo completo", async () => {
    router.loaderData = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      onboarding: "completed",
      showMerchantCheckIn: true,
      messagesDefault: false,
      firstChargeAt: "2026-09-10",
    };
    const view = await mount(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.titleActive);
    const deactivate = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.deactivate),
    );
    expect(deactivate).toBeTruthy();
  });

  test("copre avvisi, stati inattivi, intent pendenti e messaggi App Window", async () => {
    const variants = [
      {
        ...homeData,
        rules: { taxCode: "required_validated", pec: "unmanaged" },
      },
      {
        ...homeData,
        validationEnabled: true,
        trialStatus: "expired",
        remaining: 0,
        onboarding: "completed",
      },
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-02" },
        trialEndsAt: "2026-09-02",
        trialStatus: "active",
        remaining: 0,
        validationEnabled: true,
        rules: { taxCode: "required_validated", pec: "optional_validated" },
        onboarding: "completed",
      },
      { ...homeData, errorCode: "duplicate_validations" },
      { ...homeData, errorCode: "duplicate_validations_active" },
      { ...homeData, errorCode: "validation_readback_failed" },
    ] as const;
    let view: Rendered | undefined;
    for (const data of variants) {
      const variantKey = `${data.errorCode ?? "ok"}-${data.entitlement.kind}-${data.validationEnabled}-${data.rules.taxCode}-${data.trialStatus ?? "none"}`;
      router.loaderData = data;
      if (!view) view = await mount(<HomePage key={variantKey} />);
      else await view.rerender(<HomePage key={variantKey} />);
    }
    if (!view) throw new Error("Home non montata");

    const appWindow = view.container.querySelector("s-app-window") as HTMLElement & {
      hide: () => Promise<void>;
    };
    appWindow.hide = vi.fn(async () => undefined);
    const plans = view.container.querySelector("#plans") as HTMLElement;
    plans.scrollIntoView = vi.fn();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "cf-ready:show-plans" },
        }),
      );
      await Promise.resolve();
    });
    expect(appWindow.hide).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "cf-ready:navigate-from-app-window", href: "/app/rules" },
        }),
      );
      await Promise.resolve();
    });
    expect(router.navigate).toHaveBeenCalledWith("/app/rules", { viewTransition: true });
  });

  test("inoltra gli esiti della richiesta recensione, incluso il fallimento", async () => {
    const request = vi.fn().mockResolvedValueOnce({ code: "success" });
    vi.stubGlobal("shopify", {
      loading: vi.fn(),
      saveBar: { hide: vi.fn(), show: vi.fn() },
      reviews: { request },
    });
    router.loaderData = { ...homeData, reviewDue: true };
    const view = await mount(<HomePage key="review-ok" />);
    await act(async () => void (await Promise.resolve()));
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "review_prompt_result", code: "success" },
      { method: "post" },
    );

    router.fetcher.submit.mockClear();
    request.mockRejectedValueOnce(new Error("non disponibile"));
    await view.rerender(<HomePage key="review-ko" />);
    await act(async () => void (await Promise.resolve()));
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "review_prompt_result", code: "request-failed" },
      { method: "post" },
    );
  });

  test("copre confronto piani e attivazione da uno stato avente diritto", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    router.location = {
      pathname: "/app",
      state: { cfReady: "cf-ready:show-plans" },
    };
    const entitledData = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-10-01" },
      planKind: "monthly",
      accountStatus: "active",
      onboarding: "completed",
    };
    router.loaderData = entitledData;
    const view = await mount(<HomePage />);
    await act(
      async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(true)))),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    expect(view.container.textContent).toContain(texts("it").home.nextConfigure);

    router.location = { pathname: "/app", state: null };
    router.loaderData = {
      ...entitledData,
      rules: { taxCode: "required_validated", pec: "unmanaged" },
    };
    await view.rerender(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.nextActivate);
    const activate = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").home.activate),
    );
    if (!activate) throw new Error("attivazione Home assente");
    await click(activate);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "enable", source: "status" },
      { method: "post" },
    );

    const pending = new FormData();
    pending.set("intent", "enable");
    pending.set("source", "status");
    router.fetcher.formData = pending;
    router.fetcher.state = "submitting";
    router.fetcher.data = { ok: false, errorCode: "future_error" };
    await view.rerender(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
  });

  test("PlanStatus distingue tutte le forme di accesso e rinnovo", async () => {
    const variants = [
      {
        ...homeData,
        entitlement: { kind: "trial", validThrough: "2026-09-10" },
        trialEndsAt: "2026-09-10",
      },
      {
        ...homeData,
        entitlement: { kind: "one_time", validThrough: null },
        complimentary: false,
      },
      { ...homeData, trialStatus: "expired" },
      { ...homeData, onboarding: "completed" },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "monthly",
        periodEnd: "2026-09-30",
        accountStatus: "active",
        plan: { ...homeData.plan, generation: "standard" },
      },
      {
        ...homeData,
        entitlement: { kind: "subscription", validThrough: "2026-09-30" },
        planKind: "annual",
        periodEnd: "2026-09-30",
        accountStatus: "ending",
      },
    ] as const;
    for (const data of variants) {
      const view = await mount(<PlanStatus data={data as never} />);
      expect(view.container.textContent).not.toBe("");
    }
  });
});

describe("Guida", () => {
  test("la diagnosi distingue stato appena verificato, errore e controlli manuali", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.2.2",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: { lastSyncAt: "2026-09-05T00:00:00Z", errorCode: "generic" },
    };
    const view = await mount(<Guide />);
    expect(view.container.textContent).toContain(texts("it").guide.diagnosis.notChecked);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").guide.diagnosis.refresh,
      )!,
    );
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      { intent: "check_validation" },
      { method: "post" },
    );
    for (const active of [true, false]) {
      router.fetcher.data = {
        ok: true,
        check: {
          checkedAt: "2026-09-05T00:01:00Z",
          enabled: active,
          entitled: active,
          configured: active,
          errorCode: null,
        },
      };
      await view.rerender(<Guide />);
      expect(view.container.textContent).toContain(
        active ? texts("it").guide.diagnosis.enabled : texts("it").guide.diagnosis.disabled,
      );
    }
    router.fetcher.data = {
      ok: true,
      check: {
        checkedAt: "2026-09-05T00:01:00Z",
        enabled: true,
        entitled: true,
        configured: true,
        errorCode: "billing_read_failed",
      },
    };
    await view.rerender(<Guide />);
    expect(view.container.textContent).not.toContain(texts("it").guide.diagnosis.entitled);
    router.fetcher.data = { ok: false };
    await view.rerender(<Guide />);
    expect(view.container.textContent).toContain(texts("it").guide.diagnosis.failed);
    expect(view.container.textContent).not.toContain(texts("it").guide.diagnosis.checkedAt);
  });

  test("espande FAQ, cambia categoria e registra copia riuscita o fallita", async () => {
    router.loaderData = {
      locale: "it",
      shopDomain: "demo.myshopify.com",
      version: "1.1.4",
      diagnosticId: "123e4567-e89b-42d3-a456-426614174000",
      diagnostics: { validationStatus: "active", billingStatus: "active" },
    };
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = await mount(<Guide />);
    const buttons = [...view.container.querySelectorAll("s-button")];
    await click(buttons[0]);
    expect([...view.container.querySelectorAll("details")].every((entry) => !entry.open)).toBe(
      true,
    );

    const select = view.container.querySelector("s-select") as HTMLElement & { value: string };
    select.value = "billing";
    await dispatch(select, new Event("change", { bubbles: true }));
    await click([...view.container.querySelectorAll("s-button")].at(-1)!);
    expect(writeText).toHaveBeenCalledOnce();
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      {
        intent: "diagnostics_copied",
        diagnostic_id: "123e4567-e89b-42d3-a456-426614174000",
      },
      { method: "post" },
    );

    writeText.mockRejectedValueOnce(new Error("clipboard negata"));
    await click([...view.container.querySelectorAll("s-button")].at(-1)!);
    expect(view.container.textContent).toContain(texts("it").support.diagnosticsCopyFailed);
  });
});

describe("Messaggi", () => {
  test("usa nel simulatore l'etichetta osservata per la lingua corrente", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      labelSnapshot: {
        slots: [
          labelSlot({
            name: "taxCode",
            key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            kind: "source",
            currentValue: "Codice fiscale corrente",
          }),
          labelSlot({
            name: "taxCode",
            key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            locale: "en",
            family: "en",
            kind: "global_translation",
            currentValue: null,
            inheritedValue: "Current tax code",
          }),
        ],
      },
    };
    const view = await mount(<CustomerMessages />);
    expect(view.container.textContent).toContain(texts("it").messages.previewCurrentFieldLabel);
    expect(view.container.textContent).toContain("Codice fiscale corrente");

    const language = view.container.querySelector("s-select") as HTMLElement & { value: string };
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(view.container.textContent).toContain("Current tax code");
  });

  test("il salvataggio normalizzato chiude la bozza senza lasciare spazi nei campi", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "fr.taxCodeRequired";
    await dispatch(field, new Event("input", { bubbles: true }));
    field.name = "it.unknown";
    await dispatch(field, new Event("input", { bubbles: true }));
    field.name = "it.taxCodeRequired";
    field.value = "Messaggio normalizzato ";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "new",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "Messaggio normalizzato" },
      },
    };
    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(
      (view.container.querySelector("s-text-area") as HTMLElement & { value: string }).value,
    ).toBe("Messaggio normalizzato");
    expect(view.container.textContent).toContain(texts("it").messages.saved);
    expect(shopify.saveBar.hide).toHaveBeenCalled();
  });

  test("un conflitto conserva la bozza e riapplica solo i campi modificati", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "La mia modifica";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "remote",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: {
          ...DEFAULT_CONFIG.messages.it,
          taxCodeRequired: "Modifica concorrente",
          pecInvalid: "Nuovo testo remoto",
        },
      },
    };
    router.actionData = { ok: false, errorCode: "config_conflict" };
    await view.rerender(<CustomerMessages />);
    expect(view.container.textContent).toContain("Modifica concorrente");
    expect(view.container.textContent).toContain("La mia modifica");
    expect(
      view.container
        .querySelector('ui-save-bar button[variant="primary"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").conflict.reapply,
      )!,
    );
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        configHash: "remote",
        "it.taxCodeRequired": "La mia modifica",
        "it.pecInvalid": "Nuovo testo remoto",
      }),
      { method: "post" },
    );
  });

  test("conserva la digitazione successiva all'invio mentre accetta il testo salvato", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "old",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "Prima versione ";
    await dispatch(field, new Event("input", { bubbles: true }));
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    field.value = "Seconda versione";
    await dispatch(field, new Event("input", { bubbles: true }));
    router.loaderData = {
      ...(router.loaderData as object),
      configHash: "new",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "Prima versione" },
      },
    };
    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(
      (view.container.querySelector("s-text-area") as HTMLElement & { value: string }).value,
    ).toBe("Seconda versione");
    expect(view.container.querySelector("s-text-area")).toBe(field);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ configHash: "new", "it.taxCodeRequired": "Seconda versione" }),
      { method: "post" },
    );
  });

  test("modifica, cambia lingua, annulla, ripristina e salva", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: DEFAULT_CONFIG.messages,
      rules: DEFAULT_CONFIG.rules,
    };
    const view = await mount(<CustomerMessages />);
    const form = view.container.querySelector("form");
    const field = view.container.querySelector("s-text-area") as HTMLElement & {
      name: string;
      value: string;
    };
    field.name = "it.taxCodeRequired";
    field.value = "Nuovo messaggio";
    await dispatch(field, new Event("input", { bubbles: true }));
    expect(form).toBeTruthy();

    const language = view.container.querySelector("s-select") as HTMLElement & { value: string };
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    const buttons = [...view.container.querySelectorAll("button")];
    await click(buttons[1]);
    await click(buttons[0]);
    expect(router.submit).toHaveBeenCalled();

    const restore = [...view.container.querySelectorAll('s-button[slot="primary-action"]')].at(-1);
    if (!restore) throw new Error("ripristino assente");
    await click(restore);
    expect(view.container.querySelectorAll("s-text-area")).toHaveLength(4);
  });

  test("mostra errori di campo e di scrittura e conferma il salvataggio", async () => {
    router.loaderData = {
      locale: "it",
      configHash: "hash",
      messages: {
        ...DEFAULT_CONFIG.messages,
        it: { ...DEFAULT_CONFIG.messages.it, taxCodeRequired: "x".repeat(201) },
      },
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    };
    router.actionData = {
      ok: false,
      problem: { locale: "it", key: "pecInvalid", kind: "empty" },
    };
    const view = await mount(<CustomerMessages />);
    const fields = [...view.container.querySelectorAll("s-text-area")];
    expect(fields).toHaveLength(4);
    await dispatch(fields[0], new FocusEvent("focusin", { bubbles: true }));
    await dispatch(fields[0], new FocusEvent("focusout", { bubbles: true }));

    router.actionData = { ok: false, errorCode: "validation_write_failed" };
    await view.rerender(<CustomerMessages />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(view.container.textContent).toContain(texts("it").messages.saved);
  });
});

describe("Onboarding", () => {
  test("richiede i permessi opzionali e ignora un modulo regole incompleto", async () => {
    router.loaderData = { ...onboardingData, step: 2, labelScopesGranted: false };
    const view = await mount(<Onboarding />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi onboarding assente");
    await click(requestScopes);
    expect(shopify.scopes.request).toHaveBeenCalledWith([
      "write_translations",
      "read_locales",
      "read_markets",
    ]);
    expect(router.revalidator.revalidate).toHaveBeenCalledOnce();
    expect(router.fetcher.submit).not.toHaveBeenCalled();

    const originalFormData = FormData;
    class IncompleteRulesFormData {
      get(name: string) {
        return name === "taxCode" ? "required_validated" : null;
      }
    }
    vi.stubGlobal("FormData", IncompleteRulesFormData as unknown as typeof originalFormData);
    const next = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.next),
    );
    if (!next) throw new Error("avanzamento onboarding assente");
    router.fetcher.submit.mockClear();
    await click(next);
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });

  test("mostra l'errore se Shopify non completa la richiesta dei permessi", async () => {
    router.loaderData = { ...onboardingData, step: 2, labelScopesGranted: false };
    vi.mocked(shopify.scopes.request).mockRejectedValueOnce(new Error("scope_request_failed"));
    const view = await mount(<Onboarding />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi onboarding assente");

    await click(requestScopes);

    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    vi.mocked(shopify.scopes.request).mockResolvedValueOnce({ result: "declined-all" });
    await click(requestScopes);
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();
  });

  test("configura la sincronizzazione automatica delle etichette dal secondo passo", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 2,
      configHash: "hash",
      labelScopesGranted: true,
      labelSnapshot: {
        revision: "labels-r1",
        slots: [
          labelSlot({
            name: "taxCode",
            key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            locale: "en",
            family: "en",
            capability: "automatic",
          }),
        ],
      },
    };
    const view = await mount(<Onboarding />);
    const management = [...view.container.querySelectorAll("s-checkbox")].find((checkbox) =>
      checkbox.getAttribute("label")?.includes(texts("it").rules.labels.enable),
    ) as (HTMLElement & { checked: boolean }) | undefined;
    if (!management) throw new Error("gestione etichette onboarding assente");
    management.checked = true;
    await dispatch(management, new Event("change", { bubbles: true }));
    const confirmation = [...view.container.querySelectorAll("s-checkbox")].find(
      (checkbox) => checkbox.getAttribute("label") === texts("it").rules.labels.enableConfirm,
    ) as (HTMLElement & { checked: boolean }) | undefined;
    if (!confirmation) throw new Error("conferma etichette onboarding assente");
    confirmation.checked = true;
    await dispatch(confirmation, new Event("change", { bubbles: true }));

    const originalFormData = FormData;
    class LabelsFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "optional_validated";
        return null;
      }
    }
    vi.stubGlobal("FormData", LabelsFormData as unknown as typeof originalFormData);
    await click(
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      )!,
    );
    expect(router.fetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        intent: "rules",
        configHash: "hash",
        labelsEnabled: "1",
        labelsConfirmed: "1",
        labelsRevision: "labels-r1",
      }),
      { method: "post" },
    );
    vi.stubGlobal("FormData", originalFormData);
  });

  test("salva le regole nel percorso locale e avanza al riepilogo", async () => {
    router.loaderData = onboardingData;
    const originalFormData = FormData;
    class RulesFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "optional_validated";
        return null;
      }
      has() {
        return false;
      }
    }
    const view = await mount(<Onboarding />);
    const next = () =>
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      );
    await click(next()!);
    vi.stubGlobal("FormData", RulesFormData as unknown as typeof originalFormData);
    await click(next()!);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "rules",
        taxCode: "required_validated",
        pec: "optional_validated",
      }),
      { method: "post" },
    );
    router.fetcher.state = "loading";
    await view.rerender(<Onboarding />);
    router.fetcher.data = { ok: true };
    router.fetcher.state = "idle";
    await view.rerender(<Onboarding />);
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);
    vi.stubGlobal("FormData", originalFormData);
  });

  test("copre accesso prova, piano, scaduto e attivazione", async () => {
    const variants = [
      { entitlementKind: "trial", entitled: true, trialStatus: "active", enabled: false },
      { entitlementKind: "subscription", entitled: true, trialStatus: null, enabled: false },
      { entitlementKind: "none", entitled: false, trialStatus: "expired", enabled: false },
    ] as const;
    for (const variant of variants) {
      router.loaderData = {
        ...onboardingData,
        ...variant,
        step: 4,
        rules: { taxCode: "required_validated", pec: "optional_validated" },
      };
      const variantKey = `${variant.entitlementKind}-${variant.trialStatus ?? "none"}`;
      const view = await mount(<Onboarding key={variantKey} />);
      const actions = [...view.container.querySelectorAll("s-button")];
      for (const label of [
        texts("it").onboarding.step4StartTrial,
        texts("it").onboarding.step4SeePlans,
        texts("it").onboarding.activate,
        texts("it").onboarding.finishWithout,
      ]) {
        const button = actions.find((candidate) => candidate.textContent?.includes(label));
        if (button) await click(button);
      }
    }
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "activate" }),
      { method: "post" },
    );
  });

  test("attraversa i quattro passi e completa senza attivare", async () => {
    router.loaderData = onboardingData;
    const view = await mount(<Onboarding />);
    const next = () =>
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.next),
      );
    await click(next()!);
    expect(view.container.textContent).toContain(texts("it").onboarding.step2Heading);
    await click(
      [...view.container.querySelectorAll("s-button")].find((button) =>
        button.textContent?.includes(texts("it").onboarding.back),
      )!,
    );
    expect(view.container.textContent).toContain(texts("it").onboarding.step1Heading);

    router.loaderData = { ...onboardingData, step: 3 };
    await view.rerender(<Onboarding key="step-3" />);
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);

    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
    };
    await view.rerender(<Onboarding key="step-4" />);
    const finish = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.finishWithout),
    );
    if (!finish) throw new Error("completamento assente");
    await click(finish);
    expect(router.fetcher.submit).toHaveBeenCalled();
  });

  test("mostra errore, riepilogo revisione e schermata conclusa", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 4,
      completed: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      entitled: true,
      entitlementKind: "subscription",
      enabled: true,
    };
    router.fetcher.data = { ok: false, errorCode: "generic" };
    const view = await mount(<Onboarding />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    const complete = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.completeReview),
    );
    if (!complete) throw new Error("azione revisione assente");
    await click(complete);
    router.fetcher.data = { ok: true };
    router.fetcher.state = "loading";
    await view.rerender(<Onboarding />);
    router.fetcher.state = "idle";
    await view.rerender(<Onboarding />);
    expect(view.container.textContent).toContain(texts("it").onboarding.doneBody);
  });

  test("chiude l’onboarding senza chiedere una dichiarazione su Interno", async () => {
    router.loaderData = { ...onboardingData, step: 4 };
    const view = await mount(<Onboarding />);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();
    const startTrial = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.step4StartTrial),
    );
    if (!startTrial) throw new Error("avvio prova onboarding assente");
    await click(startTrial);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "start_trial" }),
      { method: "post" },
    );

    router.loaderData = {
      ...onboardingData,
      step: 4,
      rules: { taxCode: "required_validated", pec: "unmanaged" },
    };
    await view.rerender(<Onboarding key="managed-tax-code-step-4" />);
    const form = view.container.querySelector("form");
    if (!form) throw new Error("form onboarding assente");
    expect(form.querySelector('s-checkbox[name="address2"]')).toBeNull();
    const finish = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.finishWithout),
    );
    if (!finish) throw new Error("completamento onboarding assente");
    await click(finish);
    expect(router.fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "finish",
      }),
      { method: "post" },
    );
  });

  test("un errore onboarding sconosciuto usa il fallback generico", async () => {
    router.loaderData = onboardingData;
    router.fetcher.data = { ok: false, errorCode: "future_error" };
    const view = await mount(<Onboarding />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
  });

  test("la revisione già salvata avanza senza riscrivere regole o progresso", async () => {
    router.loaderData = {
      ...onboardingData,
      step: 2,
      completed: true,
      rules: { taxCode: "optional_validated", pec: "unmanaged" },
    };
    const originalFormData = FormData;
    class UnchangedRulesFormData {
      get(name: string) {
        if (name === "taxCode") return "optional_validated";
        if (name === "pec") return "unmanaged";
        return null;
      }
    }
    vi.stubGlobal("FormData", UnchangedRulesFormData as unknown as typeof originalFormData);
    const view = await mount(<Onboarding />);
    const next = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").onboarding.next),
    );
    if (!next) throw new Error("avanzamento onboarding assente");
    await click(next);
    expect(view.container.textContent).toContain(texts("it").onboarding.step3Heading);
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });
});

describe("Regole", () => {
  test("mostra la modalità Azienda soltanto per la PEC", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const taxCodeChoices = view.container.querySelectorAll(
      's-choice-list[name="taxCode"] s-choice',
    );
    const pecChoices = view.container.querySelectorAll('s-choice-list[name="pec"] s-choice');

    expect(taxCodeChoices).toHaveLength(3);
    expect(pecChoices).toHaveLength(4);
    expect(
      [...taxCodeChoices].some(
        (choice) => choice.getAttribute("value") === "required_when_company",
      ),
    ).toBe(false);
    expect(
      [...pecChoices].some((choice) => choice.getAttribute("value") === "required_when_company"),
    ).toBe(true);
  });

  test("riapplica una regola locale conservando le altre impostazioni remote", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const original = FormData;
    class EditedFormData {
      get(name: string) {
        return name === "taxCode"
          ? "required_validated"
          : name === "pec"
            ? "required_validated"
            : null;
      }
    }
    vi.stubGlobal("FormData", EditedFormData as unknown as typeof original);
    await dispatch(
      view.container.querySelector("s-choice-list")!,
      new Event("change", { bubbles: true }),
    );
    vi.stubGlobal("FormData", original);
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = {
      ...rulesData,
      configHash: "remote",
      rules: { taxCode: "unmanaged", pec: "optional_validated" },
    };
    router.actionData = { ok: false, errorCode: "config_conflict" };
    await view.rerender(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").conflict.heading);
    await click(
      [...view.container.querySelectorAll("s-button")].find(
        (button) => button.textContent === texts("it").conflict.reapply,
      )!,
    );
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        configHash: "remote",
        taxCode: "required_validated",
        pec: "optional_validated",
      }),
      { method: "post" },
    );
  });

  const rulesData = {
    locale: "it",
    duplicateError: null,
    configHash: "hash",
    rules: { taxCode: "optional_validated", pec: "required_validated" },
    messages: DEFAULT_CONFIG.messages,
    enabled: true,
    entitled: true,
    labelScopesGranted: false,
    labelState: {
      mode: "off",
      managementEpoch: null,
      enabledAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
      decision: "pending",
      acceptedRevision: null,
      reviewedAt: null,
      address2Classification: "unknown",
      address2HasMarketOverride: false,
      address2ExternalChangeAt: null,
      address2Decision: "pending",
      address2ReviewedAt: null,
      address2FormMode: null,
    },
    labelSnapshot: null,
    guidedConfirmations: [],
    labelLoadError: null,
    checkoutSettingsUrl: "https://admin.shopify.com/store/demo/settings/checkout",
    storefrontUrl: "https://demo.myshopify.com",
  } as const;

  test("modifica la bozza, salva, annulla e invia il form", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const originalFormData = FormData;
    class RulesFormData {
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "unmanaged";
        return null;
      }
    }
    vi.stubGlobal("FormData", RulesFormData as unknown as typeof originalFormData);
    await dispatch(
      view.container.querySelector("s-choice-list")!,
      new Event("change", { bubbles: true }),
    );
    const buttons = [...view.container.querySelectorAll("button")];
    await click(buttons[1]);
    await click(buttons[0]);
    await dispatch(
      view.container.querySelector("form")!,
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(router.submit).toHaveBeenCalled();
    vi.stubGlobal("FormData", originalFormData);
  });

  test("mostra duplicati, errori e conferma di salvataggio", async () => {
    router.loaderData = { ...rulesData, duplicateError: "duplicate_validations_active" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    router.loaderData = rulesData;
    router.actionData = { ok: false, errorCode: "generic" };
    await view.rerender(<CheckoutRules />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    router.loaderData = { ...rulesData, configHash: "saved-hash" };
    router.actionData = { ok: true };
    await view.rerender(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.saved);
  });

  test("mostra il conflitto senza riproporre la vecchia dichiarazione di Interno", async () => {
    router.loaderData = rulesData;
    router.actionData = { ok: false, errorCode: "config_conflict" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").conflict.heading);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();
  });

  test("salva con hash assente senza riscrivere la vecchia dichiarazione", async () => {
    router.loaderData = {
      ...rulesData,
      configHash: null,
    };
    router.actionData = { ok: false, errorCode: "future_error" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").errors.generic);
    expect(view.container.querySelector('s-checkbox[name="address2"]')).toBeNull();

    const save = view.container.querySelector('ui-save-bar button[variant="primary"]');
    if (!save) throw new Error("salvataggio Regole assente");
    await click(save);
    expect(router.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        configHash: "",
      }),
      { method: "post" },
    );
    expect(router.submit.mock.calls.at(-1)?.[0]).not.toHaveProperty("address2");
  });

  test("registra la scelta di mantenere le etichette native", async () => {
    router.loaderData = rulesData;

    const view = await mount(<CheckoutRules />);
    const keep = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.keepNative,
    );
    if (!keep) throw new Error("scelta sulle etichette native assente");
    await click(keep);

    const [body, options] = router.fetcher.submit.mock.calls.at(-1)!;
    expect(options).toEqual({ method: "post" });
    expect(body).toBeInstanceOf(FormData);
    expect(Object.fromEntries((body as FormData).entries())).toEqual({
      intent: "accept_checkout_labels",
      labelsRevision: "",
    });

    router.loaderData = {
      ...rulesData,
      labelState: { ...rulesData.labelState, decision: "accepted" },
    };
    await view.rerender(<CheckoutRules key="labels-kept" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.keepNativeAccepted);
  });

  test("mostra e aziona etichette native, override e ripristino di Interno", async () => {
    const snapshot = {
      locales: [
        { locale: "it", family: "it", name: "Italiano", primary: true, published: true },
        { locale: "en", family: "en", name: "English", primary: false, published: false },
      ],
      markets: [
        {
          id: "gid://shopify/Market/1",
          name: "Italia",
          defaultLocale: "it",
          locales: ["it", "en"],
          resolution: "ambiguous",
        },
        {
          id: "gid://shopify/Market/2",
          name: "Europa",
          defaultLocale: "it",
          locales: ["it"],
          resolution: "inherited",
        },
      ],
      issues: [],
      revision: "labels-r1",
      address2: { classification: "fiscal_conflict", hasMarketOverride: true },
      slots: [
        labelSlot({
          name: "taxCode",
          key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
          capability: "automatic",
          currentValue: "Codice fiscale (facoltativo)",
        }),
        labelSlot({
          name: "pec",
          key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
          locale: "en",
          family: "en",
          currentValue: "Certified email address (PEC)",
        }),
        labelSlot({
          name: "taxCode",
          key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
          kind: "market_translation",
          marketId: "gid://shopify/Market/1",
          marketName: "Italia",
          currentValue: "Codice fiscale (facoltativo)",
        }),
        labelSlot({
          name: "pec",
          key: "shopify.checkout.localized_fields.additional_information.tax_email_it",
          kind: "market_translation",
          marketId: "gid://shopify/Market/2",
          marketName: "Europa",
          currentValue: "PEC Europa",
        }),
        labelSlot({ name: "address2", kind: "source", currentValue: "Codice fiscale" }),
        labelSlot({ name: "address2", currentValue: "Codice fiscale" }),
        labelSlot({
          name: "optionalAddress2",
          key: "shopify.checkout.contact.optional_address2_label",
          locale: "en",
          family: "en",
          kind: "market_translation",
          marketId: "gid://shopify/Market/1",
          marketName: "Italia",
          currentValue: "Tax code",
        }),
      ],
    } as const;
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "automatic",
        lastSyncAt: "2026-09-08T12:00:00Z",
        address2Classification: "fiscal_conflict",
        address2FormMode: "required",
      },
      labelSnapshot: snapshot,
      labelLoadError: "checkout_labels_readback_failed",
    };
    router.fetcher.data = { ok: false, errorCode: "checkout_labels_conflict" };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.marketAmbiguous);
    expect(view.container.querySelectorAll('s-banner[tone="critical"]')).not.toHaveLength(0);
    const labelsArea = view.container.querySelector(".rules-layout__labels");
    const disclosures = labelsArea?.querySelectorAll("details");
    expect(labelsArea?.parentElement?.lastElementChild).toBe(labelsArea);
    expect(disclosures).toHaveLength(2);
    expect(disclosures?.[1].querySelectorAll(".checkout-label-context__row").length).toBeLessThan(
      8,
    );

    const guidedConfirmations = [...view.container.querySelectorAll("s-button")].filter(
      (button) => button.textContent === texts("it").rules.labels.confirmGuided,
    );
    expect(guidedConfirmations.length).toBeGreaterThan(0);
    expect(guidedConfirmations.length).toBeLessThan(snapshot.slots.length);
    await click(guidedConfirmations[0]);

    expect(disclosures?.[1].querySelector("s-select")).not.toBeNull();

    const restore = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.restoreAddress),
    );
    const keep = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.keepAddress),
    );
    if (!restore || !keep) throw new Error("azioni etichette assenti");
    await click(restore);
    expect(router.fetcher.submit).not.toHaveBeenCalledWith(
      expect.objectContaining({ intent: "restore_address2_labels" }),
      { method: "post" },
    );
    await click(
      view.container.querySelector(
        's-modal[id="restore-address2-it"] s-button[slot="primary-action"]',
      )!,
    );
    await click(keep);
    const addressMode = disclosures?.[1].querySelector("s-select") as HTMLElement & {
      value: string;
    };
    addressMode.value = "optional";
    await dispatch(addressMode, new Event("change", { bubbles: true }));
    const submissions = router.fetcher.submit.mock.calls.map(([body]) =>
      body instanceof FormData ? Object.fromEntries(body.entries()) : body,
    );
    expect(submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intent: "confirm_guided_labels",
          labelsRevision: "labels-r1",
          slotId: expect.any(String),
        }),
        expect.objectContaining({
          intent: "restore_address2_labels",
          labelsRevision: "labels-r1",
          slotId: expect.any(String),
        }),
        { intent: "accept_address2_labels", labelsRevision: "labels-r1" },
        expect.objectContaining({
          intent: "save_address2_form_mode",
          address2FormMode: "optional",
        }),
      ]),
    );

    const language = labelsArea?.querySelector("s-select") as HTMLElement & { value: string };
    expect([...language.querySelectorAll("s-option")].map((option) => option.textContent)).toEqual([
      "Italiano",
      "Inglese",
    ]);
    language.value = "en";
    await dispatch(language, new Event("change", { bubbles: true }));
    expect(language.value).toBe("en");

    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: true,
      labelState: rulesData.labelState,
      labelSnapshot: {
        ...snapshot,
        markets: snapshot.markets.map((market) => ({ ...market, resolution: "direct" as const })),
      },
    };
    await view.rerender(<CheckoutRules key="direct-unmanaged-labels" />);
    expect(view.container.textContent).not.toContain(texts("it").rules.labels.marketAmbiguous);

    router.fetcher.data = undefined;
    router.loaderData = {
      ...rulesData,
      rules: { ...rulesData.rules, taxCode: "required_validated" },
      labelScopesGranted: true,
      labelState: rulesData.labelState,
      labelSnapshot: snapshot,
    };
    await view.rerender(<CheckoutRules key="first-label-write" />);
    const keepNative = [...view.container.querySelectorAll("s-button")].find(
      (button) => button.textContent === texts("it").rules.labels.keepNative,
    );
    if (!keepNative) throw new Error("scelta sulle etichette native con scope assente");
    await click(keepNative);
    expect(router.fetcher.submit).toHaveBeenLastCalledWith(expect.any(FormData), {
      method: "post",
    });
    const management = [...view.container.querySelectorAll("s-checkbox")].find((checkbox) =>
      checkbox.getAttribute("label")?.includes(texts("it").rules.labels.enable),
    ) as (HTMLElement & { checked: boolean }) | undefined;
    if (!management) throw new Error("controllo gestione etichette assente");
    management.checked = true;
    await dispatch(management, new Event("change", { bubbles: true }));
    const submissionsBeforeConfirmation = router.submit.mock.calls.length;
    await click(view.container.querySelector('ui-save-bar button[variant="primary"]')!);
    expect(router.submit).toHaveBeenCalledTimes(submissionsBeforeConfirmation);
    await click(
      view.container.querySelector(
        's-modal[id="confirm-checkout-label-management"] s-button[slot="primary-action"]',
      )!,
    );
    expect(router.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelsEnabled: "1", labelsConfirmed: "1" }),
      { method: "post" },
    );

    router.loaderData = { ...rulesData, labelScopesGranted: true, labelSnapshot: null };
    await view.rerender(<CheckoutRules key="labels-without-snapshot" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.noSnapshot);

    for (const address2Classification of ["nonstandard", "expected"] as const) {
      router.loaderData = {
        ...rulesData,
        labelScopesGranted: true,
        labelState: { ...rulesData.labelState, address2Classification },
        labelSnapshot: {
          ...snapshot,
          address2: { classification: address2Classification, hasMarketOverride: false },
        },
      };
      await view.rerender(<CheckoutRules key={address2Classification} />);
    }

    router.loaderData = {
      ...rulesData,
      locale: "en",
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        lastSyncAt: "2026-09-08T12:00:00Z",
      },
      labelSnapshot: {
        ...snapshot,
        slots: snapshot.slots
          .filter((slot) => slot.marketId === null)
          .map((slot) => ({ ...slot, capability: "guided" as const })),
      },
      guidedConfirmations: [
        {
          slotId: JSON.stringify([
            "gid://shopify/OnlineStoreThemeLocaleContent/1",
            "shopify.checkout.localized_fields.additional_information.tax_credential_it",
            "it",
            null,
            "global_translation",
          ]),
          confirmedAt: "2026-09-08T12:00:00Z",
        },
      ],
    };
    await view.rerender(<CheckoutRules key="guided-english" />);
    const previewLanguage = view.container.querySelector("s-select") as HTMLElement & {
      value: string;
    };
    previewLanguage.value = "it";
    await dispatch(previewLanguage, new Event("change", { bubbles: true }));

    router.actionData = { ok: true, labelsErrorCode: "checkout_labels_partial_sync" };
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelSnapshot: {
        ...snapshot,
        slots: [
          labelSlot({
            name: "address2",
            kind: "global_translation",
            capability: "automatic",
          }),
        ],
      },
    };
    await view.rerender(<CheckoutRules key="labels-partial" />);
    expect(view.container.querySelector('s-banner[tone="warning"]')).not.toBeNull();
  });

  test("copre la variante facoltativa, i testi conformi e l'interfaccia inglese", async () => {
    const taxCode = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      capability: "guided",
      currentValue: "Codice fiscale (facoltativo)",
    });
    const taxCodeMarket = labelSlot({
      name: "taxCode",
      key: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
      capability: "guided",
      kind: "market_translation",
      marketId: "gid://shopify/Market/1",
      marketName: null,
      currentValue: "Codice fiscale (facoltativo)",
    });
    const optionalAddress = labelSlot({
      name: "optionalAddress2",
      key: "shopify.checkout.contact.optional_address2_label",
      currentValue: "Interno, scala, ecc. (facoltativo)",
      sourceValue: "Interno, scala, ecc. (facoltativo)",
    });
    const snapshot = {
      locales: [{ locale: "it", family: "it", name: "Italiano", primary: false, published: false }],
      markets: [
        {
          id: "gid://shopify/Market/1",
          name: "Italia",
          defaultLocale: "it",
          locales: ["it"],
          resolution: "direct",
        },
      ],
      issues: [],
      revision: "labels-optional",
      address2: { classification: "expected", hasMarketOverride: false },
      slots: [taxCode, taxCodeMarket, optionalAddress],
    } as const;
    router.loaderData = {
      ...rulesData,
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        decision: "accepted",
        address2FormMode: "optional",
      },
      labelSnapshot: snapshot,
      guidedConfirmations: [taxCode, taxCodeMarket].map((slot, index) => ({
        slotId: checkoutLabelSlotId(slot),
        confirmedAt: `2026-09-09T12:0${index}:00Z`,
      })),
    };
    const view = await mount(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.allMarketsSame);
    expect(view.container.textContent).toContain("Ultima verifica manuale:");
    expect(view.container.textContent).toContain(texts("it").rules.labels.addressStatus.expected);
    expect(texts("en").rules.labels.marketException("Italy")).toBe("Exception for Italy");
    expect(texts("en").rules.labels.lastManualVerification("now")).toBe(
      "Last manual verification: now",
    );

    router.loaderData = {
      ...router.loaderData,
      labelSnapshot: {
        ...snapshot,
        slots: [
          taxCode,
          taxCodeMarket,
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            kind: "source",
            currentValue: "Piano e porta",
          }),
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            currentValue: "Piano e porta",
          }),
        ],
        address2: { classification: "nonstandard", hasMarketOverride: false },
      },
    };
    await view.rerender(<CheckoutRules key="optional-nonstandard" />);
    expect(view.container.textContent).toContain(
      texts("it").rules.labels.addressStatus.nonstandard,
    );
    expect(view.container.textContent).toContain(texts("it").rules.labels.sourceManual);

    router.loaderData = {
      ...rulesData,
      rules: { ...rulesData.rules, taxCode: "unmanaged" },
      labelScopesGranted: true,
      labelState: {
        ...rulesData.labelState,
        mode: "guided",
        address2FormMode: "optional",
      },
      labelSnapshot: {
        ...snapshot,
        slots: [
          taxCode,
          { ...taxCodeMarket, currentValue: "CF Italia", marketName: "Italia" },
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            currentValue: null,
            inheritedValue: null,
            sourceValue: null,
          }),
          labelSlot({
            name: "optionalAddress2",
            key: "shopify.checkout.contact.optional_address2_label",
            kind: "market_translation",
            marketId: "gid://shopify/Market/1",
            marketName: "Italia",
            currentValue: "Piano e porta",
          }),
        ],
        address2: { classification: "nonstandard", hasMarketOverride: true },
      },
      guidedConfirmations: [],
    };
    await view.rerender(<CheckoutRules key="optional-market-exceptions" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.notAvailable);
    expect(view.container.textContent).toContain("Italia");

    router.loaderData = {
      ...rulesData,
      locale: "en",
      labelScopesGranted: false,
      labelState: { ...rulesData.labelState, address2FormMode: "required" },
      labelSnapshot: snapshot,
    };
    await view.rerender(<CheckoutRules key="english-without-scopes" />);
    expect(view.container.textContent).toContain(texts("en").rules.labels.english);
    expect(texts("it").rules.labels.lastManualVerification("ora")).toBe(
      "Ultima verifica manuale: ora",
    );

    router.navigation = { state: "submitting" };
    await view.rerender(<CheckoutRules key="busy-label-confirmation" />);
    const submissions = router.submit.mock.calls.length;
    await click(
      view.container.querySelector(
        's-modal[id="confirm-checkout-label-management"] s-button[slot="primary-action"]',
      )!,
    );
    expect(router.submit).toHaveBeenCalledTimes(submissions);
  });

  test("richiede gli scope delle etichette dalle Regole", async () => {
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: false,
    };
    const view = await mount(<CheckoutRules />);
    const disclosures = view.container.querySelectorAll(".rules-layout__labels details");
    expect(disclosures).toHaveLength(2);
    expect(disclosures[0].hasAttribute("open")).toBe(true);
    expect(disclosures[1].hasAttribute("open")).toBe(true);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi Regole assente");
    await click(requestScopes);
    expect(shopify.scopes.request).toHaveBeenCalledWith([
      "write_translations",
      "read_locales",
      "read_markets",
    ]);
    expect(router.revalidator.revalidate).toHaveBeenCalledOnce();
    expect(router.fetcher.submit).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  test("gestisce l'errore dei permessi e gli stati sintetici delle etichette", async () => {
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "unmanaged", pec: "unmanaged" },
      labelScopesGranted: false,
    };
    vi.mocked(shopify.scopes.request).mockRejectedValueOnce(new Error("scope_request_failed"));
    const view = await mount(<CheckoutRules />);
    const requestScopes = [...view.container.querySelectorAll("s-button")].find((button) =>
      button.textContent?.includes(texts("it").rules.labels.requestPermissions),
    );
    if (!requestScopes) throw new Error("richiesta permessi Regole assente");

    await click(requestScopes);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    vi.mocked(shopify.scopes.request).mockResolvedValueOnce({ result: "declined-all" });
    await click(requestScopes);
    expect(router.revalidator.revalidate).not.toHaveBeenCalled();

    const healthySnapshot = {
      locales: [{ locale: "it", family: "it", name: "Italiano", primary: false, published: true }],
      markets: [],
      issues: [],
      revision: "labels-healthy",
      address2: { classification: "expected", hasMarketOverride: false },
      slots: [
        labelSlot({
          name: "taxCode",
          locale: "it",
          family: "it",
          capability: "automatic",
          currentValue: null,
          sourceValue: null,
        }),
      ],
    } as const;
    router.loaderData = {
      ...rulesData,
      rules: { taxCode: "optional_validated", pec: "unmanaged" },
      labelScopesGranted: true,
      labelState: { ...rulesData.labelState, mode: "automatic" },
      labelSnapshot: healthySnapshot,
    };
    await view.rerender(<CheckoutRules key="labels-healthy" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.statusManagedByShopify);
    expect(view.container.textContent).toContain(texts("it").rules.labels.notAvailable);

    router.loaderData = {
      ...router.loaderData,
      labelState: {
        ...rulesData.labelState,
        mode: "automatic",
        lastErrorCode: "checkout_labels_partial_sync",
      },
    };
    await view.rerender(<CheckoutRules key="labels-error" />);
    expect(view.container.textContent).toContain(texts("it").rules.labels.nativeSummaryError);
  });
});

function labelSlot(overrides: Record<string, unknown>) {
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
