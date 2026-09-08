import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
} from "../generated/api";
import { isValidPec, isValidTaxCode } from "../../../app/checkout-field-validation";

export { isValidPec, isValidTaxCode } from "../../../app/checkout-field-validation";

type Rule = "unmanaged" | "optional_validated" | "required_validated";
type MessageKey = "taxCodeRequired" | "taxCodeInvalid" | "pecRequired" | "pecInvalid";

type Configuration = {
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
  checkRequiredEmpty: boolean,
): void {
  if (!field || rule === "unmanaged") return;
  const value = field.value?.trim() ?? "";
  if (!value) {
    if (rule === "required_validated" && checkRequiredEmpty) {
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
    if (!config || (step !== "CHECKOUT_COMPLETION" && step !== "CHECKOUT_INTERACTION")) {
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

    const italianDeliveryGroups = input.cart.deliveryGroups.filter(
      (group) => group.deliveryAddress?.countryCode === "IT",
    );
    const deliveryContextResolved =
      input.cart.deliveryGroups.length > 0 &&
      input.cart.deliveryGroups.every((group) => Boolean(group.deliveryAddress?.countryCode));
    const advancedInteraction =
      step === "CHECKOUT_INTERACTION" &&
      deliveryContextResolved &&
      italianDeliveryGroups.length > 0 &&
      italianDeliveryGroups.every((group) => Boolean(group.selectedDeliveryOption));
    const checkRequiredEmpty = step === "CHECKOUT_COMPLETION" || advancedInteraction;

    const messages = config.messages[input.localization.language.isoCode === "IT" ? "it" : "en"];
    const errors: { message: string; target: string }[] = [];
    const taxCode = input.cart.localizedFields.find(({ key }) => key === "TAX_CREDENTIAL_IT");
    const pec = input.cart.localizedFields.find(({ key }) => key === "TAX_EMAIL_IT");
    const absentRequiredField =
      step === "CHECKOUT_COMPLETION" && hasItalianDelivery ? {} : undefined;
    addFieldError(
      errors,
      taxCode ?? absentRequiredField,
      config.rules.taxCode,
      messages,
      "taxCodeRequired",
      "taxCodeInvalid",
      taxCode ? targets.taxCode : "$.cart",
      isValidTaxCode,
      checkRequiredEmpty,
    );
    addFieldError(
      errors,
      pec ?? absentRequiredField,
      config.rules.pec,
      messages,
      "pecRequired",
      "pecInvalid",
      pec ? targets.pec : "$.cart",
      isValidPec,
      checkRequiredEmpty,
    );

    return { operations: [{ validationAdd: { errors } }] };
  } catch {
    return allow;
  }
}
