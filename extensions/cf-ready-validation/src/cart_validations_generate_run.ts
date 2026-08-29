import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
} from "../generated/api";
import { isValidPec, isValidTaxCode } from "../../../app/checkout-field-validation";

export { isValidPec, isValidTaxCode } from "../../../app/checkout-field-validation";

type Rule = "unmanaged" | "optional_validated" | "required_validated";
type MessageKey = "taxCodeRequired" | "taxCodeInvalid" | "pecRequired" | "pecInvalid";
type ErrorDisplay = "inline" | "preventive";

type Configuration = {
  errorDisplay: ErrorDisplay;
  rules: { taxCode: Rule; pec: Rule };
  messages: Record<"it" | "en", Record<MessageKey, string>>;
};

const allow: CartValidationsGenerateRunResult = {
  operations: [{ validationAdd: { errors: [] } }],
};

const targets = {
  taxCode: "$.cart.localizedField.TAX_CREDENTIAL_IT",
  pec: "$.cart.localizedField.TAX_EMAIL_IT",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function isMessages(value: unknown): value is Record<"it" | "en", Record<MessageKey, string>> {
  if (!isRecord(value)) return false;
  const keys: MessageKey[] = ["taxCodeRequired", "taxCodeInvalid", "pecRequired", "pecInvalid"];

  return ["it", "en"].every((language) => {
    const messages = value[language];
    return (
      isRecord(messages) &&
      keys.every((key) => {
        const message = messages[key];
        return (
          typeof message === "string" &&
          message === message.trim() &&
          message.length > 0 &&
          message.length <= 200
        );
      })
    );
  });
}

function readConfiguration(value: unknown, localDate: unknown): Configuration | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.enabled !== true ||
    !isDate(localDate)
  ) {
    return null;
  }

  const entitlement = value.entitlement;
  const rules = value.rules;
  if (!isRecord(entitlement) || !isRecord(rules) || !isMessages(value.messages)) {
    return null;
  }

  const ruleValues = ["unmanaged", "optional_validated", "required_validated"];
  if (
    (value.errorDisplay !== "inline" && value.errorDisplay !== "preventive") ||
    typeof rules.taxCode !== "string" ||
    !ruleValues.includes(rules.taxCode) ||
    typeof rules.pec !== "string" ||
    !ruleValues.includes(rules.pec)
  ) {
    return null;
  }

  const entitled =
    (entitlement.kind === "one_time" && entitlement.validThrough === null) ||
    ((entitlement.kind === "trial" || entitlement.kind === "subscription") &&
      isDate(entitlement.validThrough) &&
      entitlement.validThrough >= localDate);

  return entitled
    ? {
        errorDisplay: value.errorDisplay,
        rules: {
          taxCode: rules.taxCode as Rule,
          pec: rules.pec as Rule,
        },
        messages: value.messages,
      }
    : null;
}

function addFieldError(
  errors: { message: string; target: string }[],
  field: { value?: string | null } | undefined,
  rule: Rule,
  messages: Record<MessageKey, string>,
  requiredKey: MessageKey,
  invalidKey: MessageKey,
  target: string,
  validate: (value: string) => boolean,
): void {
  if (!field || rule === "unmanaged") return;
  const value = field.value?.trim() ?? "";
  if (!value) {
    if (rule === "required_validated") {
      errors.push({ message: messages[requiredKey], target });
    }
  } else if (!validate(value)) {
    errors.push({ message: messages[invalidKey], target });
  }
}

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  try {
    const config = readConfiguration(
      input.validation.metafield?.jsonValue,
      input.shop.localTime.date,
    );
    const step = input.buyerJourney.step;
    if (
      !config ||
      (step !== "CHECKOUT_COMPLETION" &&
        !(config.errorDisplay === "preventive" && step === "CHECKOUT_INTERACTION"))
    ) {
      return allow;
    }
    if (input.cart.billingAddress?.countryCode && input.cart.billingAddress.countryCode !== "IT") {
      return allow;
    }

    const deliveryCountries = input.cart.deliveryGroups.flatMap((group) =>
      group.deliveryAddress?.countryCode ? [group.deliveryAddress.countryCode] : [],
    );
    if (
      deliveryCountries.length > 0 &&
      !deliveryCountries.includes("IT" as (typeof deliveryCountries)[number])
    ) {
      return allow;
    }

    const hasItalianDelivery = deliveryCountries.includes(
      "IT" as (typeof deliveryCountries)[number],
    );
    if (input.cart.localizedFields.length === 0 && !hasItalianDelivery) return allow;

    const messages = config.messages[input.localization.language.isoCode === "IT" ? "it" : "en"];
    const errors: { message: string; target: string }[] = [];
    const taxCode = input.cart.localizedFields.find(({ key }) => key === "TAX_CREDENTIAL_IT");
    const pec = input.cart.localizedFields.find(({ key }) => key === "TAX_EMAIL_IT");
    addFieldError(
      errors,
      taxCode ?? (hasItalianDelivery ? {} : undefined),
      config.rules.taxCode,
      messages,
      "taxCodeRequired",
      "taxCodeInvalid",
      step === "CHECKOUT_INTERACTION" || !taxCode ? "$.cart" : targets.taxCode,
      isValidTaxCode,
    );
    addFieldError(
      errors,
      pec ?? (hasItalianDelivery ? {} : undefined),
      config.rules.pec,
      messages,
      "pecRequired",
      "pecInvalid",
      step === "CHECKOUT_INTERACTION" || !pec ? "$.cart" : targets.pec,
      isValidPec,
    );

    return { operations: [{ validationAdd: { errors } }] };
  } catch {
    return allow;
  }
}
