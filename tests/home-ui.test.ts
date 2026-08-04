import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";
import { openBillingApproval } from "../app/revalidation";
import { PlanChoice, SetupGuide } from "../app/routes/app._index";
import { Address2DeclarationPrompt } from "../app/routes/app.onboarding";

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
    gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
  });
  expect(rendered.filter((element) => element.type === "s-icon")).toHaveLength(0);
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

  expect(checkbox(false)?.props).toMatchObject({ checked: false });
  expect(instructions(false)).toBe(false);
  expect(checkbox(true)?.props).toMatchObject({ checked: true });
  expect(instructions(true)).toBe(true);
});
