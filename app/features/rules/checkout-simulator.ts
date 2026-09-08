import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";

export type SimulatorFieldError = "required" | "invalid" | null;
export type SimulatorOutcome = "notApplied" | "noChecks" | "editing" | "blocked" | "ready";
export type SimulatorScenario = "valid" | "invalidTaxCode" | "invalidPec" | "empty";

export const simulatorScenarioValues: Record<SimulatorScenario, { taxCode: string; pec: string }> =
  {
    valid: { taxCode: "RSSMRA85T10A562S", pec: "mario.rossi@example.com" },
    invalidTaxCode: { taxCode: "RSSMRA85T10A562A", pec: "mario.rossi@example.com" },
    invalidPec: { taxCode: "RSSMRA85T10A562S", pec: "mario.rossi@" },
    empty: { taxCode: "", pec: "" },
  };

export function simulatorFieldError(
  mode: Rules["taxCode"],
  value: string,
  validate: (value: string) => boolean,
): SimulatorFieldError {
  const normalized = value.trim();
  if (!normalized) return mode === "required_validated" ? "required" : null;
  return validate(normalized) ? null : "invalid";
}

export function simulatorOutcome({
  rules,
  deliveryCountry,
  billingCountry,
  taxCode,
  pec,
  submitted,
}: {
  rules: Rules;
  deliveryCountry: string;
  billingCountry: string;
  taxCode: string;
  pec: string;
  submitted: boolean;
}): SimulatorOutcome {
  if ((deliveryCountry && deliveryCountry !== "IT") || (billingCountry && billingCountry !== "IT"))
    return "notApplied";
  if (rules.taxCode === "unmanaged" && rules.pec === "unmanaged") return "noChecks";

  const problems = [
    rules.taxCode === "unmanaged"
      ? null
      : simulatorFieldError(rules.taxCode, taxCode, isValidTaxCode),
    rules.pec === "unmanaged" ? null : simulatorFieldError(rules.pec, pec, isValidPec),
  ];
  if (problems.some((problem) => problem === "invalid" || (submitted && problem === "required"))) {
    return "blocked";
  }
  return problems.includes("required") ? "editing" : "ready";
}

export function simulatorErrorMessage(
  messages: Messages,
  field: "taxCode" | "pec",
  problem: SimulatorFieldError,
  revealErrors: boolean,
): string | undefined {
  if (!revealErrors || !problem) return undefined;
  if (field === "taxCode") {
    return problem === "required" ? messages.taxCodeRequired : messages.taxCodeInvalid;
  }
  return problem === "required" ? messages.pecRequired : messages.pecInvalid;
}
