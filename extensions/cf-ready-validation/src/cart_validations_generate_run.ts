import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
} from "../generated/api";

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

const omocodiaDigits: Record<string, string> = {
  L: "0",
  M: "1",
  N: "2",
  P: "3",
  Q: "4",
  R: "5",
  S: "6",
  T: "7",
  U: "8",
  V: "9",
};

const oddValues: Record<string, number> = {
  0: 1,
  1: 0,
  2: 5,
  3: 7,
  4: 9,
  5: 13,
  6: 15,
  7: 17,
  8: 19,
  9: 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

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

export function isValidTaxCode(rawValue: string): boolean {
  const value = rawValue.trim().toUpperCase();
  if (/^\d{11}$/.test(value)) return true;
  if (
    !/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
      value,
    )
  ) {
    return false;
  }

  const decoded = [...value].map((character, index) =>
    [6, 7, 9, 10, 12, 13, 14].includes(index)
      ? (omocodiaDigits[character] ?? character)
      : character,
  );
  const month = "ABCDEHLMPRST".indexOf(decoded[8]);
  const encodedDay = Number(decoded[9] + decoded[10]);
  const day = encodedDay > 40 ? encodedDay - 40 : encodedDay;
  const maxDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 0 ||
    encodedDay === 0 ||
    (encodedDay > 31 && encodedDay < 41) ||
    encodedDay > 71 ||
    day > maxDays[month]
  ) {
    return false;
  }

  const checksum = value
    .slice(0, 15)
    .split("")
    .reduce((sum, character, index) => {
      if (index % 2 === 0) return sum + oddValues[character];
      return sum + (/\d/.test(character) ? Number(character) : character.charCodeAt(0) - 65);
    }, 0);

  return value[15] === String.fromCharCode(65 + (checksum % 26));
}

export function isValidPec(rawValue: string): boolean {
  const value = rawValue.trim();
  if (value.length > 254 || /\s/.test(value)) return false;

  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (
    !local ||
    local.length > 64 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return false;
  }

  const labels = domain.split(".");
  return (
    domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label),
    )
  );
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
    if (input.cart.localizedFields.length === 0) return allow;
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

    const messages = config.messages[input.localization.language.isoCode === "IT" ? "it" : "en"];
    const errors: { message: string; target: string }[] = [];
    addFieldError(
      errors,
      input.cart.localizedFields.find(({ key }) => key === "TAX_CREDENTIAL_IT"),
      config.rules.taxCode,
      messages,
      "taxCodeRequired",
      "taxCodeInvalid",
      step === "CHECKOUT_INTERACTION" ? "$.cart" : targets.taxCode,
      isValidTaxCode,
    );
    addFieldError(
      errors,
      input.cart.localizedFields.find(({ key }) => key === "TAX_EMAIL_IT"),
      config.rules.pec,
      messages,
      "pecRequired",
      "pecInvalid",
      step === "CHECKOUT_INTERACTION" ? "$.cart" : targets.pec,
      isValidPec,
    );

    return { operations: [{ validationAdd: { errors } }] };
  } catch {
    return allow;
  }
}
