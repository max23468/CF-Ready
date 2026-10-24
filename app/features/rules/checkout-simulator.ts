import {
  absentFieldsBlockOrder,
  checkoutCountryApplies,
  pecIsRequired,
  invalidPecMessage,
  invalidTaxCodeMessage,
  isValidPec,
  isValidTaxCode,
  requiredFieldsAreDue,
} from "../../checkout-field-validation";
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

export { pecIsRequired } from "../../checkout-field-validation";

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
  if (!checkoutCountryApplies(billingCountry, deliveryGroups)) return "notApplied";
  const absentFieldsBlock = absentFieldsBlockOrder(
    rules.blockAbsentWithoutDelivery,
    deliveryGroups,
    billingCountry,
  );
  if (!taxCodePresent && !pecPresent && !absentFieldsBlock) return "notApplied";
  if (rules.taxCode === "unmanaged" && rules.pec === "unmanaged") return "noChecks";

  const checkRequiredEmpty = requiredFieldsAreDue(step, deliveryGroups);
  const absentRequiredField = absentRequiredFieldsDue(rules, step, deliveryGroups, billingCountry);
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

type SimulatorDeliveryGroups = readonly { countryCode?: string | null }[];

export function absentRequiredFieldsDue(
  rules: Rules,
  step: "CHECKOUT_INTERACTION" | "CHECKOUT_COMPLETION",
  deliveryGroups: SimulatorDeliveryGroups,
  billingCountry: string,
) {
  return (
    step === "CHECKOUT_COMPLETION" &&
    absentFieldsBlockOrder(rules.blockAbsentWithoutDelivery, deliveryGroups, billingCountry)
  );
}

export function simulatorErrorMessage(
  messages: Messages,
  field: "taxCode" | "pec",
  problem: SimulatorFieldError,
  revealErrors: boolean,
  value = "",
  language: "it" | "en" = "en",
): string | undefined {
  if (!revealErrors || !problem) return undefined;
  if (field === "taxCode") {
    return problem === "required"
      ? messages.taxCodeRequired
      : invalidTaxCodeMessage(messages.taxCodeInvalid, value, language);
  }
  return problem === "required"
    ? messages.pecRequired
    : invalidPecMessage(messages.pecInvalid, value, language);
}
