import { isValidPec, isValidTaxCode } from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";

export type SimulatorFieldError = "required" | "invalid" | null;
export type SimulatorOutcome = "notApplied" | "noChecks" | "checkAtPayment" | "blocked" | "ready";

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
  revealErrors,
}: {
  rules: Rules;
  deliveryCountry: string;
  billingCountry: string;
  taxCode: string;
  pec: string;
  revealErrors: boolean;
}): SimulatorOutcome {
  if (deliveryCountry !== "IT" || billingCountry !== "IT") return "notApplied";
  if (rules.taxCode === "unmanaged" && rules.pec === "unmanaged") return "noChecks";

  const hasErrors =
    (rules.taxCode !== "unmanaged" &&
      simulatorFieldError(rules.taxCode, taxCode, isValidTaxCode) !== null) ||
    (rules.pec !== "unmanaged" && simulatorFieldError(rules.pec, pec, isValidPec) !== null);
  if (!hasErrors) return "ready";
  return revealErrors ? "blocked" : "checkAtPayment";
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
