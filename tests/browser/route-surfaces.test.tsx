import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { DEFAULT_CONFIG } from "../../app/config";
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
vi.mock("../../app/env.server", () => ({ APP_API_KEY: "api-key", APP_VERSION: "1.1.4" }));
vi.mock("../../app/events.server", () => ({ recordEvent: vi.fn() }));
vi.mock("../../app/shop-profile.server", () => ({ persistShopDisplayName: vi.fn() }));
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
  eligible: true,
  validationEnabled: false,
  rules: { taxCode: "unmanaged", pec: "unmanaged" },
  errorDisplay: "inline",
  messagesDefault: true,
  address2Declared: false,
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
} as const;

const onboardingData = {
  locale: "it",
  step: 1,
  completed: false,
  rules: DEFAULT_CONFIG.rules,
  errorDisplay: DEFAULT_CONFIG.errorDisplay,
  messages: DEFAULT_CONFIG.messages,
  enabled: false,
  entitlementKind: "none",
  entitled: false,
  trialStatus: null,
  address2Declared: false,
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
  router.submit.mockReset();
  vi.stubGlobal("shopify", {
    loading: vi.fn(),
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
  test("mostra navigazione, outlet, loading e gestisce gli eventi Shopify", async () => {
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
    await dispatch(rulesLink, new Event("shopify:navigate", { bubbles: true }));
    expect(router.navigate).toHaveBeenCalled();

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

  test("copre store escluso e stato attivo completo", async () => {
    router.loaderData = { ...homeData, eligible: false, countryCode: "FR" };
    const view = await mount(<HomePage />);
    expect(view.container.textContent).toContain(texts("it").home.unsupportedBody);

    router.loaderData = {
      ...homeData,
      entitlement: { kind: "subscription", validThrough: "2026-09-30" },
      planKind: "monthly",
      accountStatus: "active",
      validationEnabled: true,
      rules: { taxCode: "required_validated", pec: "optional_validated" },
      onboarding: "completed",
      address2Declared: true,
      showMerchantCheckIn: true,
      messagesDefault: false,
      firstChargeAt: "2026-09-10",
    };
    await view.rerender(<HomePage />);
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
    expect(view.container.querySelectorAll("s-text-area")).toHaveLength(4);

    router.actionData = { ok: false, errorCode: "validation_write_failed" };
    await view.rerender(<CustomerMessages />);
    expect(view.container.querySelector('s-banner[tone="critical"]')).not.toBeNull();

    router.actionData = { ok: true };
    await view.rerender(<CustomerMessages />);
    expect(view.container.textContent).toContain(texts("it").messages.saved);
  });
});

describe("Onboarding", () => {
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
      address2Declared: true,
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
});

describe("Regole", () => {
  const rulesData = {
    locale: "it",
    duplicateError: null,
    configHash: "hash",
    rules: { taxCode: "optional_validated", pec: "required_validated" },
    errorDisplay: "inline",
    messages: DEFAULT_CONFIG.messages,
    enabled: true,
    entitled: true,
    address2Declared: false,
  } as const;

  test("modifica la bozza, salva, annulla e invia il form", async () => {
    router.loaderData = rulesData;
    const view = await mount(<CheckoutRules />);
    const forms = [...view.container.querySelectorAll("form")];
    const originalFormData = FormData;
    class RulesFormData {
      private form: HTMLFormElement;
      constructor(form: HTMLFormElement) {
        this.form = form;
      }
      get(name: string) {
        if (name === "taxCode") return "required_validated";
        if (name === "pec") return "unmanaged";
        if (name === "address2") return "declared";
        if (name === "errorDisplay" && this.form === forms[1]) return "preventive";
        return null;
      }
    }
    vi.stubGlobal("FormData", RulesFormData as unknown as typeof originalFormData);
    await dispatch(forms[0], new Event("change", { bubbles: true }));
    await dispatch(forms[1], new Event("change", { bubbles: true }));
    const buttons = [...view.container.querySelectorAll("button")];
    await click(buttons[1]);
    await click(buttons[0]);
    await dispatch(forms[0], new Event("submit", { bubbles: true, cancelable: true }));
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

    router.actionData = { ok: true };
    await view.rerender(<CheckoutRules />);
    expect(view.container.textContent).toContain(texts("it").rules.saved);
  });
});
