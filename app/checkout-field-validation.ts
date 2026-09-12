// Codice condiviso fra la Function e il simulatore merchant: l'anteprima deve applicare gli
// stessi controlli formali che verranno eseguiti nel checkout, senza conservarne i valori.
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

export type TaxCodeDiagnostic =
  | "valid"
  | "length"
  | "characters"
  | "date_structure"
  | "check_character";
export type PecDiagnostic = "valid" | "email_format";

export type CheckoutDeliveryContext = {
  countryCode?: string | null;
  selectedDeliveryOption?: boolean;
};

export function requiredFieldsAreDue(
  step: "CHECKOUT_INTERACTION" | "CHECKOUT_COMPLETION",
  deliveryGroups: readonly CheckoutDeliveryContext[],
) {
  if (step === "CHECKOUT_COMPLETION") return true;
  return (
    deliveryGroups.length > 0 &&
    deliveryGroups.every(({ countryCode }) => Boolean(countryCode)) &&
    deliveryGroups.some(({ countryCode }) => countryCode === "IT") &&
    deliveryGroups
      .filter(({ countryCode }) => countryCode === "IT")
      .every(({ selectedDeliveryOption }) => selectedDeliveryOption === true)
  );
}

export function diagnoseTaxCode(rawValue: string): TaxCodeDiagnostic {
  const value = rawValue.trim().toUpperCase();
  if (value.length !== 11 && value.length !== 16) return "length";
  if (value.length === 11) {
    if (!/^\d+$/.test(value)) return "characters";
    if (value === "00000000000") return "check_character";

    let sum = 0;
    for (let index = 0; index < 10; index += 1) {
      let digit = value.charCodeAt(index) - 48;
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return value.charCodeAt(10) - 48 === (10 - (sum % 10)) % 10 ? "valid" : "check_character";
  }
  if (!/^[A-Z0-9]+$/.test(value)) return "characters";
  if (
    !/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
      value,
    )
  ) {
    return "date_structure";
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
    return "date_structure";
  }

  const checksum = value
    .slice(0, 15)
    .split("")
    .reduce((sum, character, index) => {
      if (index % 2 === 0) return sum + oddValues[character];
      return sum + (/\d/.test(character) ? Number(character) : character.charCodeAt(0) - 65);
    }, 0);

  return value[15] === String.fromCharCode(65 + (checksum % 26)) ? "valid" : "check_character";
}

export function isValidTaxCode(rawValue: string): boolean {
  return diagnoseTaxCode(rawValue) === "valid";
}

export function diagnosePec(rawValue: string): PecDiagnostic {
  const value = rawValue.trim();
  if (value.length > 254 || /\s/.test(value)) return "email_format";

  const parts = value.split("@");
  if (parts.length !== 2) return "email_format";
  const [local, domain] = parts;
  if (
    !local ||
    local.length > 64 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return "email_format";
  }

  const labels = domain.split(".");
  return domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 && label.length <= 63 && /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label),
    )
    ? "valid"
    : "email_format";
}

export function isValidPec(rawValue: string): boolean {
  return diagnosePec(rawValue) === "valid";
}
