// Contratto di configurazione di §11.1: forma, valori ammessi e default. Vive fuori da un
// modulo `.server` perché regole, limiti e testi predefiniti servono anche alla UI, che deve
// mostrare le stesse opzioni che il server accetta.
// La valuta dei piani è parte del contratto commerciale e serve anche alla UI, che deve
// formattare gli importi senza importare un modulo server.
export const CURRENCY = "EUR";

// Idoneità geografica: è parte del contratto, non dell'I/O Shopify, e la UI deve poterla
// dichiarare senza importare un modulo server.
export const ELIGIBLE_COUNTRY = "IT";

export type Entitlement = {
  kind: "trial" | "subscription" | "one_time" | "none";
  validThrough: string | null;
};

export const RULE_MODES = ["unmanaged", "optional_validated", "required_validated"] as const;
export const ERROR_DISPLAYS = ["inline", "preventive"] as const;
export const MESSAGE_KEYS = [
  "taxCodeRequired",
  "taxCodeInvalid",
  "pecRequired",
  "pecInvalid",
] as const;
export const MESSAGE_MAX_LENGTH = 200;

export type RuleMode = (typeof RULE_MODES)[number];
export type ErrorDisplay = (typeof ERROR_DISPLAYS)[number];
export type Messages = Record<(typeof MESSAGE_KEYS)[number], string>;
export type Rules = { taxCode: RuleMode; pec: RuleMode };
export type CheckoutConfig = {
  schemaVersion: 2;
  enabled: boolean;
  errorDisplay: ErrorDisplay;
  entitlement: Entitlement;
  rules: Rules;
  messages: { it: Messages; en: Messages };
};

// FR-050: alla prima installazione nessuno dei due campi è gestito. Il diritto qui è solo un
// segnaposto: ogni scrittura lo sostituisce con quello calcolato da prova e billing.
export const DEFAULT_CONFIG: CheckoutConfig = {
  schemaVersion: 2,
  enabled: false,
  errorDisplay: "inline",
  entitlement: { kind: "none", validThrough: null },
  rules: {
    taxCode: "unmanaged",
    pec: "unmanaged",
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
// Legge la configurazione osservata sul metafield. Non lancia mai: una configurazione assente,
// malformata o di uno schema che non conosciamo torna ai default, e la prima scrittura del
// merchant la sostituisce intera.
export function readConfig(value: unknown): CheckoutConfig {
  if (!isRecord(value) || value.schemaVersion !== 2) return DEFAULT_CONFIG;
  const rules = isRecord(value.rules) ? value.rules : {};
  const messages = isRecord(value.messages) ? value.messages : {};

  return {
    schemaVersion: 2,
    enabled: value.enabled === true,
    errorDisplay: oneOf(ERROR_DISPLAYS, value.errorDisplay) ?? DEFAULT_CONFIG.errorDisplay,
    entitlement: DEFAULT_CONFIG.entitlement,
    rules: {
      taxCode: oneOf(RULE_MODES, rules.taxCode) ?? DEFAULT_CONFIG.rules.taxCode,
      pec: oneOf(RULE_MODES, rules.pec) ?? DEFAULT_CONFIG.rules.pec,
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

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// FR-058: la dichiarazione sul campo “Interno” si revoca solo togliendo la spunta. Quando il
// Codice Fiscale non è gestito il blocco non viene reso, e un invio che non lo contiene non
// dice nulla sulla dichiarazione: `null` significa “non toccarla”, non “revocala”.
export function address2Declaration(form: FormData): boolean | null {
  return form.get("address2Shown") === null ? null : form.get("address2") !== null;
}
