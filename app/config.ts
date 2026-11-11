import { isRecord } from "./primitives";

// Contratto di architecture.md, Configurazione della Validation. Vive fuori da un modulo
// `.server` perché la UI deve mostrare le stesse opzioni che il server accetta e formattare
// gli importi nella valuta dei piani.
export const CURRENCY = "EUR";
export const CONFIG_SCHEMA_VERSION = 3 as const;

export type Entitlement = {
  kind: "trial" | "subscription" | "one_time" | "none";
  validThrough: string | null;
};

export const TAX_CODE_RULE_MODES = [
  "unmanaged",
  "optional_validated",
  "required_validated",
] as const;
export const PEC_RULE_MODES = [...TAX_CODE_RULE_MODES, "required_when_company"] as const;
export const MESSAGE_KEYS = [
  "taxCodeRequired",
  "taxCodeInvalid",
  "pecRequired",
  "pecInvalid",
] as const;
export const MESSAGE_MAX_LENGTH = 200;

export type TaxCodeRuleMode = (typeof TAX_CODE_RULE_MODES)[number];
export type PecRuleMode = (typeof PEC_RULE_MODES)[number];
export type Messages = Record<(typeof MESSAGE_KEYS)[number], string>;
export type Rules = {
  taxCode: TaxCodeRuleMode;
  pec: PecRuleMode;
  // D-192: senza Paese di consegna e con fatturazione italiana, un campo obbligatorio che
  // Shopify non passa alla Function blocca l'ordine. Opzionale per i chiamanti che descrivono
  // solo le modalità dei campi; `readConfig` lo valorizza sempre.
  blockAbsentWithoutDelivery?: boolean;
  // D-206: dopo l'ordine riscrive in forma canonica i valori validi dei campi gestiti.
  normalizeOrderFields?: boolean;
};
export type CheckoutConfig = {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  enabled: boolean;
  entitlement: Entitlement;
  rules: Rules;
  messages: { it: Messages; en: Messages };
};

// FR-050: alla prima installazione nessuno dei due campi è gestito. Il diritto qui è solo un
// segnaposto: ogni scrittura lo sostituisce con quello calcolato da prova e billing.
export const DEFAULT_CONFIG: CheckoutConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  enabled: false,
  entitlement: { kind: "none", validThrough: null },
  rules: {
    taxCode: "unmanaged",
    pec: "unmanaged",
    blockAbsentWithoutDelivery: false,
    normalizeOrderFields: false,
  },
  messages: {
    it: {
      taxCodeRequired: "Inserisci il Codice Fiscale per completare l’ordine.",
      taxCodeInvalid: "Il Codice Fiscale inserito non è formalmente valido. Controllalo e riprova.",
      pecRequired: "Inserisci l’indirizzo PEC per completare l’ordine.",
      pecInvalid: "L’indirizzo PEC inserito non ha un formato email valido.",
    },
    en: {
      taxCodeRequired: "Enter your Italian tax code to complete the order.",
      taxCodeInvalid: "The Italian tax code entered is not formally valid. Check it and try again.",
      pecRequired: "Enter your certified email address (PEC) to complete the order.",
      pecInvalid: "The certified email address (PEC) does not have a valid email format.",
    },
  },
};
export function readConfig(value: unknown): CheckoutConfig {
  if (!isRecord(value) || value.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return DEFAULT_CONFIG;
  }
  const rules = isRecord(value.rules) ? value.rules : {};
  const messages = isRecord(value.messages) ? value.messages : {};

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    enabled: value.enabled === true,
    entitlement: DEFAULT_CONFIG.entitlement,
    rules: {
      taxCode: oneOf(TAX_CODE_RULE_MODES, rules.taxCode) ?? DEFAULT_CONFIG.rules.taxCode,
      pec: oneOf(PEC_RULE_MODES, rules.pec) ?? DEFAULT_CONFIG.rules.pec,
      blockAbsentWithoutDelivery: rules.blockAbsentWithoutDelivery === true,
      normalizeOrderFields: rules.normalizeOrderFields === true,
    },
    messages: {
      it: readMessages(messages.it, DEFAULT_CONFIG.messages.it),
      en: readMessages(messages.en, DEFAULT_CONFIG.messages.en),
    },
  };
}

function readMessages(value: unknown, fallback: Messages): Messages {
  const source = isRecord(value) ? value : {};
  const messages = {} as Messages;

  for (const key of MESSAGE_KEYS) {
    const text = typeof source[key] === "string" ? source[key].trim() : "";
    // FR-061: un messaggio vuoto non è configurabile, quindi un valore invalido osservato non
    // può restare vuoto nell'editor: torna al default della sua lingua.
    messages[key] = text && text.length <= MESSAGE_MAX_LENGTH ? text : fallback[key];
  }

  return messages;
}

export function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

type MessageProblem = { locale: "it" | "en"; key: (typeof MESSAGE_KEYS)[number] };

// FR-061 e FR-062: trim, mai vuoti, mai oltre 200 caratteri. La validazione client è cortesia,
// questa è la difesa: un testo fuori contratto non viene corretto in silenzio, la scrittura non
// parte e il campo colpevole viene indicato.
export function validateMessages(
  input: Record<string, unknown>,
): { messages: CheckoutConfig["messages"] } | { problem: MessageProblem } {
  const messages = { it: {}, en: {} } as CheckoutConfig["messages"];

  for (const locale of ["it", "en"] as const) {
    for (const key of MESSAGE_KEYS) {
      const value = input[`${locale}.${key}`];
      const text = typeof value === "string" ? value.trim() : "";
      if (!text || text.length > MESSAGE_MAX_LENGTH) return { problem: { locale, key } };
      messages[locale][key] = text;
    }
  }

  return { messages };
}

export function hasManagedField(rules: Rules) {
  return rules.taxCode !== "unmanaged" || rules.pec !== "unmanaged";
}

function isRequiredMode(mode: PecRuleMode) {
  return mode === "required_validated" || mode === "required_when_company";
}

export function hasRequiredField(rules: Rules) {
  return isRequiredMode(rules.taxCode) || isRequiredMode(rules.pec);
}

// Il messaggio di formato non valido vale anche per un campo facoltativo: scatta su ciò che il
// cliente ha scritto.
export function messageAppears(rules: Rules, key: (typeof MESSAGE_KEYS)[number]) {
  const mode = key.startsWith("taxCode") ? rules.taxCode : rules.pec;
  return key.endsWith("Required") ? isRequiredMode(mode) : mode !== "unmanaged";
}

export function messagesAreDefault(messages: CheckoutConfig["messages"]) {
  return (["it", "en"] as const).every((locale) =>
    MESSAGE_KEYS.every((key) => messages[locale][key] === DEFAULT_CONFIG.messages[locale][key]),
  );
}
