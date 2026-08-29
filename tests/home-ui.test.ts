import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";
import { commercialState } from "../app/features/home/commercial-state";
import {
  handlePlanComparisonRequest,
  hideAppWindow,
  isPlanComparisonLocationState,
  isPlanComparisonRequest,
  PLAN_COMPARISON_MESSAGE_TYPE,
  planComparisonLocationState,
  requestPlanComparison,
  requestPlanComparisonFromFrame,
} from "../app/features/home/plan-comparison";
import { PlanStatus } from "../app/features/home/PlanStatus";
import { onboardingCheckoutPreview } from "../app/features/onboarding/checkout-preview";
import { onboardingStep4State } from "../app/features/onboarding/step4-state";
import { openBillingApproval } from "../app/revalidation";
import { MerchantCheckIn, PlanChoice, SetupGuide } from "../app/routes/app._index";
import {
  Address2DeclarationPrompt,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Content,
} from "../app/routes/app.onboarding";

vi.mock("../app/shopify.server", () => ({ authenticate: {} }));

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node, ...elements((node.props as { children?: ReactNode }).children)];
}

const data = {
  locale: "it",
  entitlement: { kind: "subscription", validThrough: "2026-08-31" },
  plan: { monthly: 2.99, annual: 29.9, one_time: 89.9, generation: "launch" },
  planKind: "monthly",
  accountStatus: "active",
  creditEstimate: null,
} as Parameters<typeof PlanChoice>[0]["data"];

test("il piano omaggio non viene presentato come un pagamento", () => {
  const complimentary = {
    ...data,
    entitlement: { kind: "one_time", validThrough: null },
    complimentary: true,
  } as Parameters<typeof PlanChoice>[0]["data"];
  const choice = elements(
    PlanChoice({
      data: complimentary,
      busy: false,
      pendingIntent: null,
      submit: vi.fn(),
      firstCharge: "oggi",
    }),
  );
  const status = elements(PlanStatus({ data: complimentary }));

  expect(
    choice.some(
      (element) =>
        (element.props as { children?: ReactNode }).children ===
        texts("it").plan.complimentarySettled,
    ),
  ).toBe(true);
  expect(
    status.some(
      (element) =>
        (element.props as { children?: ReactNode }).children === texts("it").plan.complimentary,
    ),
  ).toBe(true);
});

test("il check-in pagante resta neutro, apre l'assistenza e può sparire", () => {
  const submit = vi.fn();
  const checkInData = {
    locale: "it",
    shopDomain: "merchant.example.myshopify.com",
    version: "1.0.6",
    countryCode: "IT",
    entitlement: { kind: "subscription", validThrough: "2026-09-30" },
    validationEnabled: true,
    errorCode: null,
  } as Parameters<typeof MerchantCheckIn>[0]["data"];
  const rendered = elements(
    MerchantCheckIn({ data: checkInData, busy: false, pendingIntent: null, submit }),
  );
  const banner = rendered.find((element) => element.type === "s-banner");
  const buttons = rendered.filter((element) => element.type === "s-button");
  const contact = buttons.find(
    (button) =>
      (button.props as { children?: ReactNode }).children === texts("it").home.checkInContact,
  );
  const dismiss = buttons.find(
    (button) =>
      (button.props as { children?: ReactNode }).children === texts("it").home.checkInDismiss,
  );
  if (!banner || !contact || !dismiss) throw new Error("azioni check-in assenti");

  expect((contact.props as { href?: string }).href).toMatch(/^mailto:cfready@icloud\.com/);
  expect((contact.props as { href?: string }).href).not.toContain("Codice%20Fiscale");
  expect((contact.props as { slot?: string }).slot).toBe("secondary-actions");
  expect((dismiss.props as { slot?: string }).slot).toBe("secondary-actions");
  (dismiss.props as { onClick: () => void }).onClick();
  expect(submit).toHaveBeenCalledWith("dismiss_checkin", "checkin");
  submit.mockClear();
  expect((banner.props as { dismissible?: boolean }).dismissible).toBe(true);
  (banner.props as { onDismiss: () => void }).onDismiss();
  expect(submit).toHaveBeenCalledWith("dismiss_checkin", "checkin");
});

test("il prossimo passo usa un testo generico sui prossimi ordini", () => {
  const it = texts("it").home.nextTestOrder;
  const en = texts("en").home.nextTestOrder;

  expect(it).toMatch(/prossimi ordini/i);
  expect(it).not.toMatch(/autentici|prova|fake|lingua/i);
  expect(en).toMatch(/next orders/i);
  expect(en).not.toMatch(/authentic|genuine|test|fake|language/i);
});

test("l'approvazione billing si apre fuori dall'iframe", () => {
  const opener = vi.fn();

  openBillingApproval("https://shopify.example/approve", opener);

  expect(opener).toHaveBeenCalledWith("https://shopify.example/approve", "_top");
});

test("la cancellazione apre la conferma e invia l'intent soltanto dall'azione primaria", () => {
  const submit = vi.fn();
  const render = (pendingIntent: string | null) =>
    elements(
      PlanChoice({
        data,
        busy: pendingIntent !== null,
        pendingIntent,
        submit,
        firstCharge: "oggi",
      }),
    );
  const buttons = render(null).filter((element) => element.type === "s-button");
  const trigger = buttons.find(
    (button) =>
      (button.props as { children?: ReactNode; slot?: string }).children ===
        texts("it").plan.cancelRenewal && !(button.props as { slot?: string }).slot,
  );
  const confirmation = buttons.find(
    (button) => (button.props as { slot?: string }).slot === "primary-action",
  );
  if (!trigger || !confirmation) throw new Error("controlli di cancellazione assenti");

  expect(trigger.props).toMatchObject({ commandFor: "cancel-renewal", command: "--show" });
  expect((trigger.props as { onClick?: () => void }).onClick).toBeUndefined();
  expect(submit).not.toHaveBeenCalled();

  (confirmation.props as { onClick: () => void }).onClick();
  expect(submit).toHaveBeenCalledWith("cancel");

  const pendingTrigger = render("cancel").find(
    (element) =>
      element.type === "s-button" && (element.props as { command?: string }).command === "--show",
  );
  if (!pendingTrigger) throw new Error("trigger di cancellazione assente");
  expect(pendingTrigger.props).toMatchObject({ loading: true });
});

test("la Setup guide non marca come completati i passi aperti e usa la griglia responsive", () => {
  const data = {
    locale: "it",
    rules: { taxCode: "unmanaged", pec: "unmanaged" },
    validationEnabled: false,
    entitlement: { kind: "none", validThrough: null },
    planKind: "none",
    address2Declared: false,
  } as Parameters<typeof SetupGuide>[0]["data"];
  const rendered = elements(
    SetupGuide({ data, busy: false, pendingIntent: null, pendingSource: null, submit: vi.fn() }),
  );

  const grid = rendered.find((element) => element.type === "s-grid");
  expect(grid?.props).toMatchObject({
    gridTemplateColumns: "@container (inline-size > 560px) 1fr 1fr 1fr, 1fr",
    gap: "small-100",
  });
  expect(rendered.some((element) => element.type === "s-query-container")).toBe(true);

  // Ogni passo ha la sua icona, ma la spunta appartiene solo a quelli conclusi: qui
  // nessuno lo è, quindi nessun `check-circle` e nessun tono di successo.
  const icons = rendered.filter((element) => element.type === "s-icon");
  expect(icons.length).toBeGreaterThan(0);
  expect(
    icons.filter((icon) => (icon.props as { type?: string }).type === "check-circle"),
  ).toHaveLength(0);
  expect(icons.filter((icon) => (icon.props as { tone?: string }).tone === "success")).toHaveLength(
    0,
  );
});

test("gli elenchi onboarding restano vicini al testo che li introduce", () => {
  const rendered = elements(
    OnboardingListBlock({
      lead: "Testo introduttivo",
      items: ["Primo punto", "Secondo punto"],
    }),
  );
  const grids = rendered.filter((element) => element.type === "s-grid");
  const list = grids.find(
    (element) =>
      (element.props as { accessibilityRole?: string }).accessibilityRole === "unordered-list",
  );
  const items = rendered.filter(
    (element) =>
      element.type === "s-grid" &&
      (element.props as { accessibilityRole?: string }).accessibilityRole === "list-item",
  );

  expect(grids[0]?.props).toMatchObject({ gridTemplateColumns: "1fr", gap: "none" });
  expect(list?.props).toMatchObject({ gridTemplateColumns: "1fr", gap: "none" });
  expect(items).toHaveLength(2);
  expect(items[0]?.props).toMatchObject({
    gridTemplateColumns: "auto 1fr",
    gap: "small-100",
  });
});

test("la Home chiude l'App Window con il metodo Shopify prima di mostrare i piani", async () => {
  const hide = vi.fn(async () => undefined);
  const document = {
    getElementById: vi.fn(() => ({ hide })),
  } as unknown as Pick<Document, "getElementById">;

  expect(await hideAppWindow(document, "onboarding-window")).toBe(true);
  expect(document.getElementById).toHaveBeenCalledWith("onboarding-window");
  expect(hide).toHaveBeenCalledOnce();

  expect(await hideAppWindow({ getElementById: vi.fn(() => null) }, "onboarding-window")).toBe(
    false,
  );
});

// La card è la prima cosa che si vede dopo l'installazione: deve accogliere, e deve
// offrire l'unica azione che sblocca tutto il resto invece di limitarsi a nominarla.
test("la Setup guide accoglie alla prima apertura e offre di iniziare la prova", () => {
  const base = {
    locale: "it",
    rules: { taxCode: "unmanaged", pec: "unmanaged" },
    validationEnabled: false,
    eligible: true,
    entitlement: { kind: "none", validThrough: null },
    trialStatus: null,
    planKind: "none",
    address2Declared: false,
  } as Parameters<typeof SetupGuide>[0]["data"];
  const submit = vi.fn();
  const render = (data: Parameters<typeof SetupGuide>[0]["data"]) =>
    elements(SetupGuide({ data, busy: false, pendingIntent: null, pendingSource: null, submit }));

  const primaVolta = render(base);
  const benvenuto = primaVolta.some(
    (element) =>
      element.type === "s-paragraph" &&
      (element.props as { children?: ReactNode }).children === texts("it").setup.welcome,
  );
  expect(benvenuto).toBe(true);

  // La card apre un passo per volta: quello della prova si apre con le regole già scelte,
  // e viene prima dell'attivazione, che senza un diritto valido resterebbe disabilitata.
  const alPassoProva = render({
    ...base,
    rules: { taxCode: "required_validated", pec: "unmanaged" },
  } as Parameters<typeof SetupGuide>[0]["data"]);
  expect(
    alPassoProva.some(
      (element) =>
        element.type === "s-text" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.planTitle,
    ),
  ).toBe(true);
  const avvia = alPassoProva.find(
    (element) =>
      element.type === "s-button" &&
      (element.props as { children?: ReactNode }).children === texts("it").setup.startTrial,
  );
  if (!avvia) throw new Error("azione per iniziare la prova assente");
  (avvia.props as { onClick: () => void }).onClick();
  expect(submit).toHaveBeenCalledWith("start_trial", "setup");

  // Con la prova in corso il passo è concluso: niente benvenuto, niente pulsante.
  const inProva = render({
    ...base,
    trialStatus: "active",
    entitlement: { kind: "trial", validThrough: "2026-08-18" },
  });
  expect(
    inProva.some(
      (element) =>
        element.type === "s-paragraph" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.welcome,
    ),
  ).toBe(false);
  expect(
    inProva.some(
      (element) =>
        element.type === "s-button" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.startTrial,
    ),
  ).toBe(false);

  // Un piano assegnato prima di usare la prova è comunque uno stato attivo, non un
  // primo avvio commerciale: non deve invitare ad avviare anche la prova.
  const conPiano = render({
    ...base,
    trialStatus: null,
    entitlement: { kind: "subscription", validThrough: "2027-08-18" },
  });
  expect(
    conPiano.some(
      (element) =>
        element.type === "s-button" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.startTrial,
    ),
  ).toBe(false);
  expect(
    conPiano.some(
      (element) =>
        element.type === "s-text" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.planTitleActive,
    ),
  ).toBe(true);

  const dopoLaProva = render({
    ...base,
    rules: { taxCode: "required_validated", pec: "unmanaged" },
    trialStatus: "expired",
  });
  expect(
    dopoLaProva.some(
      (element) =>
        element.type === "s-paragraph" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.planBodyLapsed,
    ),
  ).toBe(true);
  expect(
    dopoLaProva.some(
      (element) =>
        element.type === "s-text" &&
        (element.props as { children?: ReactNode }).children === texts("it").setup.planTitleLapsed,
    ),
  ).toBe(true);
});

test("la prima installazione non viene presentata come un piano da riattivare", () => {
  const firstRunData = {
    ...data,
    entitlement: { kind: "none", validThrough: null },
    trialStatus: null,
    planKind: "none",
  } as Parameters<typeof PlanChoice>[0]["data"];
  const rendered = elements(
    PlanChoice({
      data: firstRunData,
      busy: false,
      pendingIntent: null,
      submit: vi.fn(),
      firstCharge: "oggi",
    }),
  );
  const headings = rendered
    .filter((element) => element.type === "s-section")
    .map((element) => (element.props as { heading?: string }).heading);
  const paragraphs = rendered
    .filter((element) => element.type === "s-paragraph")
    .map((element) => (element.props as { children?: ReactNode }).children);
  const buttons = rendered
    .filter((element) => element.type === "s-button")
    .map((element) => (element.props as { children?: ReactNode }).children);
  const primaryButtons = rendered
    .filter(
      (element) =>
        element.type === "s-button" &&
        (element.props as { variant?: string; slot?: string }).variant === "primary" &&
        !(element.props as { slot?: string }).slot,
    )
    .map((element) => (element.props as { children?: ReactNode }).children);
  const planStatus = elements(PlanStatus({ data: firstRunData }));

  expect(commercialState(firstRunData)).toBe("first_run");
  expect(headings).toContain(texts("it").plan.chooseNowHeading);
  expect(headings).not.toContain(texts("it").plan.chooseHeading);
  expect(paragraphs).toContain(texts("it").plan.oneTimeChargeNotStarted);
  expect(paragraphs).not.toContain(texts("it").plan.oneTimeCharge);
  expect(buttons).toContain(texts("it").plan.oneTimeStart);
  expect(buttons).not.toContain(texts("it").plan.oneTimeSwitch);
  expect(primaryButtons).toEqual([texts("it").plan.startTrial]);
  expect(
    planStatus.some(
      (element) =>
        element.type === "s-paragraph" &&
        (element.props as { children?: ReactNode }).children === texts("it").plan.notStartedStatus,
    ),
  ).toBe(true);
  expect(
    commercialState({
      ...firstRunData,
      trialStatus: "expired",
    }),
  ).toBe("lapsed");
});

test("l’avanzamento onboarding resta compatto anche al quarto passo", () => {
  const rendered = elements(OnboardingProgress({ step: 4, t: texts("it") }));
  const labels = rendered
    .filter((element) => element.type === "s-text")
    .map((element) => (element.props as { children?: ReactNode }).children);

  expect(labels).toEqual(["Passo 4 di 4"]);
  expect(labels).not.toContain(texts("it").onboarding.step4Heading);
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

test("il confronto piani comunica con la Home senza navigare il frame della modale", async () => {
  const showPlans = vi.fn();
  const rendered = elements(
    OnboardingStep4Content({
      saved: {
        locale: "it",
        rules: { taxCode: "required_validated", pec: "unmanaged" },
      } as Awaited<ReturnType<typeof import("../app/routes/app.onboarding").loader>>,
      declared: false,
      t: texts("it"),
      state: { summary: "needs", access: "first_run", canActivate: false },
      busy: false,
      pendingIntent: null,
      startTrial: vi.fn(),
      showPlans,
    }),
  );
  const actions = rendered.filter(
    (element) =>
      element.type === "s-button" &&
      [texts("it").onboarding.step4StartTrial, texts("it").onboarding.step4SeePlans].includes(
        (element.props as { children?: string }).children ?? "",
      ),
  );

  expect(actions).toHaveLength(2);
  expect(actions[1].props).not.toHaveProperty("href");
  (actions[1].props as { onClick: () => void }).onClick();
  expect(showPlans).toHaveBeenCalledOnce();

  const postMessage = vi.fn();
  expect(requestPlanComparison({ postMessage }, "https://app.example")).toBe(true);
  expect(postMessage).toHaveBeenCalledWith(
    { type: PLAN_COMPARISON_MESSAGE_TYPE },
    "https://app.example",
  );
  expect(requestPlanComparison(null, "https://app.example")).toBe(false);
  const openerPostMessage = vi.fn();
  const fallback = vi.fn();
  expect(
    requestPlanComparisonFromFrame(
      {
        location: { origin: "https://app.example" },
        opener: { postMessage: openerPostMessage },
      } as unknown as Pick<Window, "location" | "opener">,
      fallback,
    ),
  ).toBe("opener");
  expect(openerPostMessage).toHaveBeenCalledWith(
    { type: PLAN_COMPARISON_MESSAGE_TYPE },
    "https://app.example",
  );
  expect(fallback).not.toHaveBeenCalled();

  const directFallback = vi.fn();
  expect(
    requestPlanComparisonFromFrame(
      {
        location: { origin: "https://app.example" },
        opener: null,
      } as unknown as Pick<Window, "location" | "opener">,
      directFallback,
    ),
  ).toBe("fallback");
  expect(directFallback).toHaveBeenCalledOnce();
  expect(isPlanComparisonLocationState(planComparisonLocationState())).toBe(true);
  expect(isPlanComparisonLocationState(null)).toBe(false);
  expect(
    isPlanComparisonRequest(
      {
        origin: "https://app.example",
        data: { type: PLAN_COMPARISON_MESSAGE_TYPE },
      } as MessageEvent,
      "https://app.example",
    ),
  ).toBe(true);
  expect(
    isPlanComparisonRequest(
      {
        origin: "https://other.example",
        data: { type: PLAN_COMPARISON_MESSAGE_TYPE },
      } as MessageEvent,
      "https://app.example",
    ),
  ).toBe(false);

  const order: string[] = [];
  const hideWindow = vi.fn(async () => {
    order.push("hide");
  });
  const showPlanSection = vi.fn();
  expect(
    await handlePlanComparisonRequest(
      {
        origin: "https://app.example",
        data: { type: PLAN_COMPARISON_MESSAGE_TYPE },
      } as MessageEvent,
      "https://app.example",
      {
        hideWindow,
        showPlans: () => {
          order.push("show");
          showPlanSection();
        },
      },
    ),
  ).toBe(true);
  expect(hideWindow).toHaveBeenCalledOnce();
  expect(showPlanSection).toHaveBeenCalledOnce();
  expect(order).toEqual(["hide", "show"]);

  const renderedPlanChoice = elements(
    PlanChoice({
      data,
      busy: false,
      pendingIntent: null,
      submit: vi.fn(),
      firstCharge: "oggi",
    }),
  );
  const planAnchor = renderedPlanChoice.find(
    (element) => element.type === "s-box" && (element.props as { id?: string }).id === "plans",
  );
  const planStack = renderedPlanChoice.find(
    (element) =>
      element.type === "s-stack" &&
      (element.props as { direction?: string; gap?: string }).direction === "block" &&
      (element.props as { direction?: string; gap?: string }).gap === "base",
  );
  expect(planAnchor?.props).toMatchObject({ paddingBlockEnd: "base" });
  expect(planStack).toBeDefined();
});

test("l’anteprima onboarding descrive le regole attive senza contraddire lo stato corrente", () => {
  const it = texts("it");
  const preview = onboardingCheckoutPreview({
    rules: { taxCode: "required_validated", pec: "unmanaged" },
    errorDisplay: "inline",
    locale: "it",
  });

  expect(preview).toContain(it.checkout.taxCodeRequired);
  expect(preview).not.toContain(it.checkout.disabled);
  expect(it.onboarding.step3MessagesBody).toMatch(/quattro messaggi già configurati/i);
  expect(`${it.onboarding.welcomeBody} ${it.onboarding.step1Limits.join(" ")}`).not.toMatch(
    /fail-open|cinque minuti|niente parte|Shopify|campo mancante/i,
  );
  expect(it.rules.exceptions.join(" ")).not.toMatch(/Shopify|campo mancante/i);
  expect(it.rules.exceptions).toEqual([
    "Queste regole si applicano solo agli ordini con consegna e fatturazione in Italia.",
  ]);
  expect(it.onboarding.step4StartTrial).toBe(it.setup.startTrial);
});

test("i testi iniziali non presuppongono una configurazione precedente", () => {
  const it = texts("it");
  const en = texts("en");
  const initialItalian = [
    it.home.badgeNotStarted,
    it.home.titleNotStarted,
    it.setup.welcome,
    it.setup.planBody,
    it.onboarding.welcomeBody,
    it.onboarding.step4BodyNeedsEntitlement,
    it.plan.notStartedStatus,
    it.plan.oneTimeChargeNotStarted,
    it.messages.appearIntro,
  ].join(" ");
  const initialEnglish = [
    en.home.badgeNotStarted,
    en.home.titleNotStarted,
    en.setup.welcome,
    en.setup.planBody,
    en.onboarding.welcomeBody,
    en.onboarding.step4BodyNeedsEntitlement,
    en.plan.notStartedStatus,
    en.plan.oneTimeChargeNotStarted,
    en.messages.appearIntro,
  ].join(" ");

  expect(initialItalian).not.toMatch(/riattiv|disattivat|già attiv|tornano validi/i);
  expect(initialEnglish).not.toMatch(/reactiv|turned off|already active|apply again/i);
});

test("checkbox e istruzioni della dichiarazione condividono lo stesso stato", () => {
  const render = (declared: boolean) =>
    elements(Address2DeclarationPrompt({ declared, t: texts("it") }));
  const checkbox = (declared: boolean) =>
    render(declared).find((element) => element.type === "s-checkbox");
  const instructions = (declared: boolean) =>
    render(declared).some(
      (element) =>
        element.type === "s-paragraph" &&
        (element.props as { children?: ReactNode }).children ===
          texts("it").rules.address2Instructions,
    );
  const unchecked = checkbox(false);
  const checked = checkbox(true);
  if (!unchecked || !checked) throw new Error("dichiarazione del campo Interno assente");

  expect(texts("it").rules.address2Body).toMatch(/seleziona la casella/i);
  expect((unchecked.props as { label?: string }).label).toMatch(/^Sì,/);

  expect(unchecked.props).toMatchObject({ checked: false });
  expect(instructions(false)).toBe(false);
  expect(checked.props).toMatchObject({ checked: true });
  expect(instructions(true)).toBe(true);
});
