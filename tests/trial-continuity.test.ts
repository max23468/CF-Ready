import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { formatDate, texts } from "../app/i18n";
import { trialContinuityTexts } from "../app/i18n/trial-continuity";
import { trialContinuityNotice } from "../app/features/home/commercial-state";
import { HomeValidationSection } from "../app/features/home/HomeSections";
import { OnboardingCompletion } from "../app/features/onboarding/OnboardingSections";

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  if (typeof node.type === "function") {
    const render = node.type as (props: unknown) => ReactNode;
    return [node, ...elements(render(node.props))];
  }
  return [node, ...elements((node.props as { children?: ReactNode }).children)];
}

type NoticeData = Parameters<typeof trialContinuityNotice>[0];
type CompletionData = Parameters<typeof OnboardingCompletion>[0]["saved"];
type ButtonProps = { variant?: string; children?: ReactNode; onClick: () => void };

const trial: NoticeData = {
  locale: "it",
  entitlement: { kind: "trial", validThrough: "2026-09-28" },
  trialStatus: "active",
  trialEndsAt: "2026-09-28",
  remaining: 14,
  firstChargeAt: "2026-09-29",
  accountStatus: "none",
  validationEnabled: true,
  errorCode: null,
};

const completed: CompletionData = {
  locale: "it",
  enabled: true,
  entitled: true,
  entitlementKind: "trial",
  trialStatus: "active",
  trialEndsAt: "2026-09-28",
  errorCode: null,
};

for (const locale of ["it", "en"] as const) {
  test.each([14, 7, 3, 1])(`Home ${locale}: avviso durante la prova (%i)`, (remaining) => {
    const t = trialContinuityTexts(locale);
    expect(trialContinuityNotice({ ...trial, locale, remaining })).toEqual({
      tone: remaining <= 3 ? "warning" : "info",
      text: t.trialActive(formatDate("2026-09-28", locale)),
      detail: t.approvalHelp,
      action: t.choosePlan,
    });
  });

  test(`Home ${locale}: abbonamento approvato, nessun sollecito`, () => {
    const notice = trialContinuityNotice({
      ...trial,
      locale,
      remaining: 1,
      entitlement: { kind: "subscription", validThrough: "2026-10-29" },
      accountStatus: "active",
    });
    expect(notice).toEqual({
      tone: "info",
      text: trialContinuityTexts(locale).confirmed(formatDate("2026-09-29", locale)),
      detail: null,
      action: null,
    });
  });

  test(`Home ${locale}: scadenza esplicita e impostazioni conservate`, () => {
    expect(
      trialContinuityNotice({
        ...trial,
        locale,
        entitlement: { kind: "none", validThrough: null },
        trialStatus: "expired",
        remaining: 0,
        firstChargeAt: null,
        validationEnabled: false,
      }),
    ).toEqual({
      tone: "warning",
      text: trialContinuityTexts(locale).expired,
      detail: null,
      action: trialContinuityTexts(locale).choosePlan,
    });
  });

  test(`Home ${locale}: una prova attiva non equivale a validazione attiva`, () => {
    expect(trialContinuityNotice({ ...trial, locale, validationEnabled: false })?.text).toBe(
      trialContinuityTexts(locale).trialInactive(formatDate("2026-09-28", locale)),
    );
  });

  test(`onboarding ${locale}: home primaria, piano facoltativo e nessun listino`, () => {
    const goHome = vi.fn();
    const showPlans = vi.fn();
    const t = trialContinuityTexts(locale);
    const rendered = elements(
      OnboardingCompletion({ saved: { ...completed, locale }, goHome, showPlans }),
    );
    const section = rendered.find((element) => element.type === "s-section");
    expect(section?.props).toMatchObject({ heading: t.activeHeading });
    expect(
      rendered.some(
        (element) =>
          (element.props as { children?: ReactNode }).children ===
          t.onboardingTrial(formatDate("2026-09-28", locale)),
      ),
    ).toBe(true);
    const buttons = rendered.filter((element) => element.type === "s-button");
    expect(buttons).toHaveLength(2);
    const [homeButton, planButton] = buttons;
    if (!homeButton || !planButton) throw new Error("Azioni finali mancanti");
    const homeProps = homeButton.props as ButtonProps;
    const planProps = planButton.props as ButtonProps;
    expect(homeProps).toMatchObject({ variant: "primary", children: t.goHome });
    expect(planProps).toMatchObject({ children: t.choosePlan });
    expect(planProps.variant).toBeUndefined();
    expect(showPlans).not.toHaveBeenCalled();
    homeProps.onClick();
    expect(goHome).toHaveBeenCalledOnce();
    expect(showPlans).not.toHaveBeenCalled();
    planProps.onClick();
    expect(showPlans).toHaveBeenCalledOnce();
    expect(rendered.some((element) => element.type === "s-choice-list")).toBe(false);
  });
}

test.each([
  { entitlement: { kind: "none", validThrough: null }, trialStatus: null },
  { entitlement: { kind: "one_time", validThrough: null } },
  { errorCode: "billing_read_failed" },
  { trialStatus: "expired" },
  { remaining: 0 },
  { trialEndsAt: null },
] satisfies Partial<NoticeData>[])("nessun avviso per stato non applicabile: %j", (overrides) => {
  expect(trialContinuityNotice({ ...trial, ...overrides })).toBeNull();
});

test.each([
  { accountStatus: "ending" },
  { accountStatus: "none" },
  { firstChargeAt: null },
  { remaining: 0 },
] satisfies Partial<NoticeData>[])("nessun primo addebito senza conferma: %j", (overrides) => {
  expect(
    trialContinuityNotice({
      ...trial,
      entitlement: { kind: "subscription", validThrough: "2026-10-29" },
      accountStatus: "active",
      ...overrides,
    }),
  ).toBeNull();
});

test.each([
  { enabled: false },
  { entitled: false, entitlementKind: "none" },
  { errorCode: "billing_read_failed" },
] satisfies Partial<CompletionData>[])("nessuna falsa conferma di attivazione: %j", (overrides) => {
  const rendered = elements(
    OnboardingCompletion({
      saved: { ...completed, ...overrides },
      goHome: vi.fn(),
      showPlans: vi.fn(),
    }),
  );
  expect(rendered.find((element) => element.type === "s-section")?.props).toMatchObject({
    heading: texts("it").onboarding.doneHeading,
  });
  expect(rendered.filter((element) => element.type === "s-button")).toHaveLength(1);
});

test.each([
  { entitlementKind: "subscription" },
  { entitlementKind: "one_time" },
  { trialEndsAt: null },
  { trialStatus: "expired" },
] satisfies Partial<CompletionData>[])("nessun invito superfluo a scegliere un piano: %j", (overrides) => {
  const rendered = elements(
    OnboardingCompletion({
      saved: { ...completed, ...overrides },
      goHome: vi.fn(),
      showPlans: vi.fn(),
    }),
  );
  expect(rendered.filter((element) => element.type === "s-button")).toHaveLength(1);
});

test("il richiamo è nello stesso blocco dello stato e punta al listino esistente", () => {
  const submit = vi.fn();
  const rendered = elements(
    HomeValidationSection({
      data: {
        ...trial,
        rules: { taxCode: "required_validated", pec: "optional_validated" },
        messagesDefault: true,
      } as Parameters<typeof HomeValidationSection>[0]["data"],
      entitled: true,
      firstRun: false,
      busy: false,
      pendingIntent: null,
      pendingSource: null,
      submit,
      t: texts("it"),
    }),
  );
  expect(rendered[0]?.type).toBe("s-section");
  expect(rendered.some((element) => element.type === "s-banner")).toBe(true);
  expect(
    rendered.find(
      (element) =>
        element.type === "s-button" && (element.props as { href?: string }).href === "#plans",
    )?.props,
  ).toMatchObject({ children: "Scegli un piano", disabled: false });
  expect(submit).not.toHaveBeenCalled();
});
