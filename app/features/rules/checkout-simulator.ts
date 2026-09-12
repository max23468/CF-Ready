import { isValidPec, isValidTaxCode, requiredFieldsAreDue } from "../../checkout-field-validation";
import type { Messages, Rules } from "../../config";

export type SimulatorFieldError = "required" | "invalid" | null;
export type SimulatorOutcome = "notApplied" | "noChecks" | "editing" | "blocked" | "ready";
export type SimulatorScenario =
  | "valid"
  | "invalidTaxCode"
  | "invalidPec"
  | "numericTaxCode"
  | "omocodiaTaxCode"
  | "companyWithoutPec"
  | "empty";

export const simulatorScenarioValues: Record<
  SimulatorScenario,
  { company: string; taxCode: string; pec: string }
> = {
  valid: { company: "Acme S.r.l.", taxCode: "RSSMRA85T10A562S", pec: "mario.rossi@example.com" },
  invalidTaxCode: {
    company: "Acme S.r.l.",
    taxCode: "RSSMRA85T10A562A",
    pec: "mario.rossi@example.com",
  },
  invalidPec: { company: "Acme S.r.l.", taxCode: "RSSMRA85T10A562S", pec: "mario.rossi@" },
  numericTaxCode: {
    company: "Acme S.r.l.",
    taxCode: "12345678903",
    pec: "mario.rossi@example.com",
  },
  omocodiaTaxCode: {
    company: "Acme S.r.l.",
    taxCode: "AAAAAAL0A01A000K",
    pec: "mario.rossi@example.com",
  },
  companyWithoutPec: { company: "Acme S.r.l.", taxCode: "RSSMRA85T10A562S", pec: "" },
  empty: { company: "", taxCode: "", pec: "" },
};

export function pecIsRequired(mode: Rules["pec"], company: string) {
  return (
    mode === "required_validated" || (mode === "required_when_company" && company.trim() !== "")
  );
}

export function simulatorFieldError(
  mode: Rules["taxCode"] | Rules["pec"],
  value: string,
  validate: (value: string) => boolean,
  required = mode === "required_validated",
): SimulatorFieldError {
  const normalized = value.trim();
  if (!normalized) return required ? "required" : null;
  return validate(normalized) ? null : "invalid";
}

export function simulatorOutcome({
  rules,
  billingCountry,
  company,
  taxCode,
  pec,
  step,
  deliveryGroups,
  taxCodePresent = true,
  pecPresent = true,
}: {
  rules: Rules;
  billingCountry: string;
  company?: string;
  taxCode: string;
  pec: string;
  step: "CHECKOUT_INTERACTION" | "CHECKOUT_COMPLETION";
  deliveryGroups: readonly { countryCode?: string | null; selectedDeliveryOption?: boolean }[];
  taxCodePresent?: boolean;
  pecPresent?: boolean;
}): SimulatorOutcome {
  if (billingCountry && billingCountry !== "IT") return "notApplied";
  const deliveryCountries = deliveryGroups.flatMap(({ countryCode }) =>
    countryCode ? [countryCode] : [],
  );
  if (deliveryCountries.length > 0 && !deliveryCountries.includes("IT")) return "notApplied";
  const hasItalianDelivery = deliveryCountries.includes("IT");
  if (!taxCodePresent && !pecPresent && !hasItalianDelivery) return "notApplied";
  if (rules.taxCode === "unmanaged" && rules.pec === "unmanaged") return "noChecks";

  const checkRequiredEmpty = requiredFieldsAreDue(step, deliveryGroups);
  const absentRequiredField = step === "CHECKOUT_COMPLETION" && hasItalianDelivery;
  const problems = [
    rules.taxCode === "unmanaged"
      ? null
      : taxCodePresent || absentRequiredField
        ? simulatorFieldError(
            rules.taxCode,
            taxCodePresent ? taxCode : "",
            isValidTaxCode,
            rules.taxCode === "required_validated",
          )
        : null,
    rules.pec === "unmanaged"
      ? null
      : pecPresent || absentRequiredField
        ? simulatorFieldError(
            rules.pec,
            pecPresent ? pec : "",
            isValidPec,
            pecIsRequired(rules.pec, company ?? ""),
          )
        : null,
  ];
  if (
    problems.some(
      (problem) => problem === "invalid" || (problem === "required" && checkRequiredEmpty),
    )
  ) {
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
