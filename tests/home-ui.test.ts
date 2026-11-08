import { expect, test, vi } from "vitest";
import { hideAppWindow } from "../app/app-window-navigation";
import { commercialState } from "../app/features/home/commercial-state";
import { homeNextStep, homeValidationPresentation } from "../app/features/home/home-next-step";
import {
  handlePlanComparisonRequest,
  isPlanComparisonLocationState,
  planComparisonLocationState,
} from "../app/features/onboarding/plan-comparison";
import { onboardingStep4State } from "../app/features/onboarding/step4-state";
import { describeCheckout } from "../app/features/rules/checkout-summary";
import { texts } from "../app/i18n";

const APP_ORIGIN = "https://app.example";
const SHOW_PLANS = { type: "cf-ready:show-plans" };
const onboardingSource = {} as Window;

test.each([
  ["mittente assente", APP_ORIGIN, null, SHOW_PLANS, onboardingSource],
  ["mittente diverso", APP_ORIGIN, {} as Window, SHOW_PLANS, onboardingSource],
  ["finestra non aperta", APP_ORIGIN, null, SHOW_PLANS, null],
  ["finestra non aperta e mittente ignoto", APP_ORIGIN, {} as Window, SHOW_PLANS, null],
  ["origine diversa", "https://other.example", onboardingSource, SHOW_PLANS, onboardingSource],
  ["tipo diverso", APP_ORIGIN, onboardingSource, { type: "altro" }, onboardingSource],
  ["contenuto non oggetto", APP_ORIGIN, onboardingSource, "cf-ready:show-plans", onboardingSource],
  ["contenuto nullo", APP_ORIGIN, onboardingSource, null, onboardingSource],
])("rifiuta la richiesta dei piani: %s", async (_, origin, source, data, expectedSource) => {
  const hideWindow = vi.fn(async () => undefined);
  const showPlans = vi.fn();
  expect(
    await handlePlanComparisonRequest(
      { origin, source, data },
      APP_ORIGIN,
      { hideWindow, showPlans },
      expectedSource,
    ),
  ).toBe(false);
  expect(hideWindow).not.toHaveBeenCalled();
  expect(showPlans).not.toHaveBeenCalled();
});

test("la richiesta dei piani chiude la finestra prima di mostrarli", async () => {
  const order: string[] = [];
  expect(
    await handlePlanComparisonRequest(
      { origin: APP_ORIGIN, source: onboardingSource, data: SHOW_PLANS },
      APP_ORIGIN,
      {
        hideWindow: async () => void order.push("hide"),
        showPlans: () => void order.push("show"),
      },
      onboardingSource,
    ),
  ).toBe(true);
  expect(order).toEqual(["hide", "show"]);
});

test("lo stato di navigazione riconosce solo la richiesta dei piani", () => {
  expect(isPlanComparisonLocationState(planComparisonLocationState())).toBe(true);
  for (const state of [null, undefined, "cf-ready:show-plans", {}, { cfReady: "altro" }]) {
    expect(isPlanComparisonLocationState(state)).toBe(false);
  }
});

test("la finestra si chiude con il metodo Shopify e un id assente non genera errori", async () => {
  const hide = vi.fn(async () => undefined);
  const getElementById = vi.fn(() => ({ hide }) as unknown as HTMLElement);

  expect(await hideAppWindow({ getElementById }, "onboarding-window")).toBe(true);
  expect(getElementById).toHaveBeenCalledWith("onboarding-window");
  expect(hide).toHaveBeenCalledOnce();

  expect(await hideAppWindow({ getElementById: vi.fn(() => null) }, "onboarding-window")).toBe(
    false,
  );
});

test("il prossimo passo collega la pagina giusta", () => {
  const t = texts("it");
  const configured = { taxCode: "required_validated", pec: "unmanaged" } as const;
  const unmanaged = { taxCode: "unmanaged", pec: "unmanaged" } as const;

  expect(homeNextStep({ rules: configured, validationEnabled: true }, "entitled", t)).toEqual({
    text: t.home.nextTestOrder,
    href: "shopify://admin/orders",
    label: t.home.openOrders,
  });
  expect(homeNextStep({ rules: unmanaged, validationEnabled: false }, "entitled", t)).toEqual({
    text: t.home.nextConfigure,
    href: "/app/rules",
    label: t.nav.rules,
  });
  // H-6: ogni stato ha un'azione; senza href porta alla scelta del piano.
  expect(homeNextStep({ rules: configured, validationEnabled: false }, "entitled", t)).toEqual({
    text: t.home.nextActivate,
    href: "/app/rules",
    label: t.nav.rules,
  });
  expect(homeNextStep({ rules: configured, validationEnabled: false }, "first_run", t)).toEqual({
    text: t.home.nextStartTrial,
    href: null,
    label: t.home.showPlans,
  });
  expect(homeNextStep({ rules: configured, validationEnabled: true }, "lapsed", t)).toEqual({
    text: t.home.nextChoosePlan,
    href: null,
    label: t.home.showPlans,
  });
});

test("il badge Attiva è verde solo con almeno un campo configurato", () => {
  const t = texts("it");
  const configured = { taxCode: "required_validated", pec: "unmanaged" } as const;
  const unmanaged = { taxCode: "unmanaged", pec: "unmanaged" } as const;
  const present = (rules: typeof configured | typeof unmanaged) =>
    homeValidationPresentation(
      { locale: "it", validationEnabled: true, rules },
      "active",
      false,
      t,
    );

  expect(present(configured)).toMatchObject({ badge: t.home.badgeActive, tone: "success" });
  expect(present(unmanaged)).toMatchObject({ badge: t.home.badgeActive, tone: "neutral" });
});

test("solo chi non ha mai iniziato la prova è al primo avvio", () => {
  const none = { kind: "none", validThrough: null } as const;

  expect(commercialState({ entitlement: none, trialStatus: null })).toBe("first_run");
  expect(commercialState({ entitlement: none, trialStatus: "expired" })).toBe("lapsed");
  expect(
    commercialState({
      entitlement: { kind: "subscription", validThrough: "2027-08-18" },
      trialStatus: null,
    }),
  ).toBe("entitled");
});

test("il riepilogo onboarding distingue primo avvio, prova e piano", () => {
  expect(
    onboardingStep4State({
      enabled: false,
      entitled: false,
      entitlementKind: "none",
      trialStatus: null,
    }),
  ).toEqual({ summary: "needs", access: "first_run", canActivate: false });
  expect(
    onboardingStep4State({
      enabled: false,
      entitled: true,
      entitlementKind: "trial",
      trialStatus: "active",
    }),
  ).toEqual({ summary: "ready", access: "trial", canActivate: true });
  expect(
    onboardingStep4State({
      enabled: false,
      entitled: true,
      entitlementKind: "subscription",
      trialStatus: null,
    }),
  ).toEqual({ summary: "ready", access: "plan", canActivate: true });
});

test("il riepilogo delle regole attive non dichiara il checkout disattivato", () => {
  const it = texts("it");
  const preview = describeCheckout(
    { rules: { taxCode: "required_validated", pec: "unmanaged" }, status: "active" },
    "it",
  );

  expect(preview).toContain(it.checkout.taxCodeRequired);
  expect(preview).not.toContain(it.checkout.disabled);
});

test("onboarding e Regole dichiarano la stessa eccezione e la stessa azione di prova", () => {
  const it = texts("it");
  const en = texts("en");

  expect(it.onboarding.step1Limits[1]).toBe(it.rules.exceptions[0]);
  expect(en.onboarding.step1Limits[1]).toBe(en.rules.exceptions[0]);
  expect(it.onboarding.step4StartTrial).toBe(it.setup.startTrial);
});

test("il prossimo passo non parla di ordini di prova", () => {
  expect(texts("it").home.nextTestOrder).not.toMatch(/autentici|prova|fake|lingua/i);
  expect(texts("en").home.nextTestOrder).not.toMatch(/authentic|genuine|test|fake|language/i);
});

test("l'onboarding non espone dettagli tecnici del controllo", () => {
  const it = texts("it");

  expect(`${it.onboarding.step1Body} ${it.onboarding.step1Limits.join(" ")}`).not.toMatch(
    /fail-open|cinque minuti|niente parte|campo mancante/i,
  );
});

test("i testi iniziali non presuppongono una configurazione precedente", () => {
  const it = texts("it");
  const en = texts("en");
  const initialItalian = [
    it.home.badgeNotStarted,
    it.setup.planBody,
    it.onboarding.step1Body,
    it.onboarding.step4BodyNeedsEntitlement,
    it.plan.notStartedStatus,
    it.plan.oneTimeChargeNotStarted,
    it.messages.appearIntro,
  ].join(" ");
  const initialEnglish = [
    en.home.badgeNotStarted,
    en.setup.planBody,
    en.onboarding.step1Body,
    en.onboarding.step4BodyNeedsEntitlement,
    en.plan.notStartedStatus,
    en.plan.oneTimeChargeNotStarted,
    en.messages.appearIntro,
  ].join(" ");

  expect(initialItalian).not.toMatch(/riattiv|disattivat|già attiv|tornano validi/i);
  expect(initialEnglish).not.toMatch(/reactiv|turned off|already active|apply again/i);
});
