import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { expect, test, vi } from "vitest";
import { texts } from "../app/i18n";
import { PlanChoice } from "../app/routes/app._index";

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
