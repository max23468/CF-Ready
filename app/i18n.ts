import type { AppErrorCode } from "./app-error";
import type { Rules } from "./config";
import type {
  Address2Classification,
  Address2Decision,
  CheckoutLabelsMode,
  CheckoutLabelsStatus,
} from "./checkout-labels/domain";
import { en } from "./i18n/en";
import { formatDate, formatDateTime, formatMoney } from "./i18n/format";
import { it } from "./i18n/it";
import type { Locale } from "./i18n/types";

export type { Locale } from "./i18n/types";
export { formatDate, formatDateTime, formatMoney };

// §22: casella di assistenza, la stessa della pagina Support del sito pubblico.
export const SUPPORT_EMAIL = "supporto@cfready.it";

// §16.1: la lingua è quella dell'amministratore Shopify corrente, non quella dello store e non
// una preferenza salvata. Il caricamento iniziale porta `locale` nell'URL; sulle richieste
// successive App Bridge imposta `Accept-Language` verso il dominio dell'app. Tutto ciò che non
// è `it*` è inglese.
export function resolveLocale(request: Request): Locale {
  const tag =
    new URL(request.url).searchParams.get("locale") ?? request.headers.get("accept-language") ?? "";
  return tag.trim().toLowerCase().startsWith("it") ? "it" : "en";
}

const dictionaries = { it, en };

export function texts(locale: Locale) {
  return dictionaries[locale];
}

// Il riepilogo di §15.4 e lo stato della Home dicono la stessa cosa e devono dirla con le stesse
// parole: una frase per conseguenza, mai un elenco di stati. Il simulatore aggiunge soltanto una
// prova locale e interattiva delle stesse regole (D-068).
export type CheckoutStatus = "active" | "disabled" | "lapsed";

export const validationStatus = (enabled: boolean, entitled: boolean): CheckoutStatus =>
  !enabled ? "disabled" : entitled ? "active" : "lapsed";

export function describeCheckout(
  { rules, status }: { rules: Rules; status: CheckoutStatus },
  locale: Locale,
) {
  const t = texts(locale).checkout;
  const lines: string[] = [];

  if (rules.taxCode === "required_validated") lines.push(t.taxCodeRequired);
  else if (rules.taxCode === "optional_validated") lines.push(t.taxCodeOptional);

  if (rules.pec === "required_validated") lines.push(t.pecRequired);
  else if (rules.pec === "required_when_company") lines.push(t.pecRequiredWhenCompany);
  else if (rules.pec === "optional_validated") lines.push(t.pecOptional);

  if (!lines.length) return [t.nothing];

  // §7.7: massimo tre frasi per blocco. L'eccezione estera non si ripete qui, perché il
  // simulatore la dichiara accanto ai Paesi di prova; fra le due avvertenze vince quella che
  // decide se le regole valgono davvero.
  if (status !== "active") lines.push(status === "lapsed" ? t.lapsed : t.disabled);
  return lines;
}

// In Home lo stato dice l'esito in una riga: le regole per campo stanno nel blocco
// `Configurazione corrente` e non vanno ripetute in prosa due sezioni più sopra.
export function summariseCheckout(
  { rules, status }: { rules: Rules; status: CheckoutStatus },
  locale: Locale,
) {
  const t = texts(locale).checkout;
  const lines: string[] = [];

  if (rules.taxCode === "required_validated" || rules.pec === "required_validated") {
    lines.push(t.summaryBlocking);
  } else if (rules.pec === "required_when_company") {
    lines.push(t.summaryConditional);
  } else if (rules.taxCode === "optional_validated" || rules.pec === "optional_validated") {
    lines.push(t.summaryChecking);
  } else return [t.nothing];

  if (status !== "active") lines.push(status === "lapsed" ? t.lapsed : t.disabled);
  return lines;
}

export function homeCheckoutSummary(
  { rules, status }: { rules: Rules; status: CheckoutStatus },
  locale: Locale,
) {
  if (status === "active") return summariseCheckout({ rules, status }, locale)[0];
  const t = texts(locale).checkout;
  return status === "lapsed" ? t.lapsed : t.disabled;
}

// FR-090: il recapito dell'assistenza è un `mailto:` precompilato, per l'esito della verifica
// sull'Email binding registrato in §22. Nel corpo finiscono soltanto i campi dell'allowlist di
// §22, che il merchant vede e può cancellare prima di inviare: mai Codice Fiscale, PEC, ordini,
// indirizzi, token o payload.
export type SupportDetails = {
  shopDomain: string;
  version: string;
  countryCode?: string | null;
  entitlement?: boolean;
  entitlementKind?: "annual" | "complimentary" | "monthly" | "none" | "one_time" | "trial";
  validationEnabled?: boolean;
  errorCode?: AppErrorCode | null;
  diagnosticId?: string;
  configSchemaVersion?: number | null;
  configHash?: string | null;
  validationStateRevision?: number;
  lastSyncAt?: string | null;
  checkoutLabelsEnabled?: boolean;
  checkoutLabelsMode?: CheckoutLabelsMode;
  checkoutLabelsStatus?: CheckoutLabelsStatus;
  address2Classification?: Address2Classification;
  address2Decision?: Address2Decision;
  address2MarketOverride?: boolean;
  checkoutLabelLocales?: string;
  checkoutLabelMarketCount?: number;
  checkoutLabelsLastSyncAt?: string | null;
  checkoutLabelsErrorCode?: string | null;
};

export type SupportCategory = keyof typeof it.support.categories;

export function supportDiagnosticText(details: SupportDetails, locale: Locale) {
  const t = texts(locale).support;
  const lines = [
    t.technicalHeading,
    `${t.fieldShop}: ${details.shopDomain}`,
    `${t.fieldVersion}: ${details.version}`,
    `${t.fieldLanguage}: ${locale}`,
  ];

  if (details.countryCode) lines.push(`${t.fieldCountry}: ${details.countryCode}`);
  if (details.entitlement !== undefined) {
    lines.push(`${t.fieldEntitlement}: ${details.entitlement ? t.yes : t.no}`);
  }
  if (details.entitlementKind) {
    lines.push(`${t.fieldEntitlementKind}: ${t.entitlementKinds[details.entitlementKind]}`);
  }
  if (details.validationEnabled !== undefined) {
    lines.push(`${t.fieldValidation}: ${details.validationEnabled ? t.yes : t.no}`);
  }
  if (details.errorCode) lines.push(`${t.fieldErrorCode}: ${details.errorCode}`);
  if (details.configSchemaVersion !== undefined && details.configSchemaVersion !== null) {
    lines.push(`${t.fieldConfigSchema}: ${details.configSchemaVersion}`);
  }
  if (details.configHash) lines.push(`${t.fieldConfigHash}: ${details.configHash}`);
  if (details.validationStateRevision !== undefined) {
    lines.push(`${t.fieldStateRevision}: ${details.validationStateRevision}`);
  }
  if (details.lastSyncAt) lines.push(`${t.fieldLastSync}: ${details.lastSyncAt}`);
  if (details.checkoutLabelsEnabled !== undefined) {
    lines.push(`checkout_labels_enabled=${details.checkoutLabelsEnabled ? "yes" : "no"}`);
  }
  if (details.checkoutLabelsMode) lines.push(`checkout_labels_mode=${details.checkoutLabelsMode}`);
  if (details.checkoutLabelsStatus) {
    lines.push(`checkout_labels_status=${details.checkoutLabelsStatus}`);
  }
  if (details.address2Classification) {
    lines.push(`address2_classification=${details.address2Classification}`);
  }
  if (details.address2Decision) lines.push(`address2_decision=${details.address2Decision}`);
  if (details.address2MarketOverride !== undefined) {
    lines.push(`address2_market_override=${details.address2MarketOverride ? "yes" : "no"}`);
  }
  if (details.checkoutLabelLocales) lines.push(`locales=${details.checkoutLabelLocales}`);
  if (details.checkoutLabelMarketCount !== undefined) {
    lines.push(`market_count=${details.checkoutLabelMarketCount}`);
  }
  if (details.checkoutLabelsLastSyncAt) {
    lines.push(`last_label_sync=${details.checkoutLabelsLastSyncAt}`);
  }
  if (details.checkoutLabelsErrorCode) {
    lines.push(`label_error_code=${details.checkoutLabelsErrorCode}`);
  }
  if (details.diagnosticId) lines.push(`${t.fieldDiagnosticId}: ${details.diagnosticId}`);
  return lines.join("\n");
}

export function supportMailto(details: SupportDetails, locale: Locale, category: SupportCategory) {
  const t = texts(locale).support;
  const lines = ["", "", supportDiagnosticText(details, locale)];
  const query = new URLSearchParams({
    subject: `${t.subject}: ${t.categories[category]}`,
    body: lines.join("\n"),
  });
  // URLSearchParams codifica lo spazio come "+", che nel corpo di un mailto resterebbe tale.
  return `mailto:${SUPPORT_EMAIL}?${query.toString().replaceAll("+", "%20")}`;
}

// FR-077: avvisi di prova a sette giorni, tre giorni, ultimo giorno e scadenza. Solo in app,
// nessuna email (FR-078), e mai un conto alla rovescia (§14.3): si dice la data.
export function trialNotice(
  { remaining, endsAt }: { remaining: number; endsAt: string | null },
  locale: Locale,
): { tone: "info" | "warning"; text: string } | null {
  const t = texts(locale).plan;
  if (!endsAt || remaining > 7 || remaining < 1) return null;
  const date = formatDate(endsAt, locale);

  if (remaining === 1) return { tone: "warning", text: t.trialLastDay(date) };
  return { tone: remaining <= 3 ? "warning" : "info", text: t.trialEndsSoon(date) };
}
