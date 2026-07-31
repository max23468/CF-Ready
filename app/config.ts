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

export type MessageProblem = { locale: "it" | "en"; key: (typeof MESSAGE_KEYS)[number] };

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

// Quali messaggi il cliente può davvero leggere, date le regole attive. Il messaggio di campo
// obbligatorio esiste solo se il campo è obbligatorio; quello di formato non valido vale anche
// per un campo facoltativo, perché scatta su ciò che il cliente ha scritto.
export function messageAppears(rules: Rules, key: (typeof MESSAGE_KEYS)[number]) {
  const mode = key.startsWith("taxCode") ? rules.taxCode : rules.pec;
  return key.endsWith("Required") ? mode === "required_validated" : mode !== "unmanaged";
}

export const REVIEW_MIN_DAYS = 7;

// §15.10 e FR-093: si chiede una recensione solo a onboarding concluso, con la validazione
// attiva da almeno sette giorni e nessun errore tecnico aperto. Shopify decide poi da sé se
// mostrarla davvero: idoneità, frequenza e rifiuti sono gestiti dalla sua modale.
export function reviewIsDue(
  state: {
    onboarding: string;
    validationEnabled: boolean;
    errorCode: string | null;
    enabledSince: string | null;
  },
  now: number,
) {
  if (state.onboarding !== "completed" || !state.validationEnabled) return false;
  if (state.errorCode || !state.enabledSince) return false;
  return now - Date.parse(state.enabledSince) >= REVIEW_MIN_DAYS * 86_400_000;
}

// I messaggi sono ancora quelli di fabbrica? Serve alla Home per dire in una riga se qualcuno
// li ha riscritti, informazione che altrimenti richiede di aprire la pagina e ricordarsene.
export function messagesAreDefault(messages: CheckoutConfig["messages"]) {
  return (["it", "en"] as const).every((locale) =>
    MESSAGE_KEYS.every((key) => messages[locale][key] === DEFAULT_CONFIG.messages[locale][key]),
  );
}
