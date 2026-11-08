import { texts, type Locale } from "../../i18n";
import type { SupportDiagnosticState } from "../../support.server";

// ui-content.md, Assistenza: la stessa casella della pagina Support del sito pubblico.
export const SUPPORT_EMAIL = "supporto@cfready.it";

// FR-090: il corpo del `mailto:` contiene soltanto l'allowlist di ui-content.md, Assistenza, che il
// merchant vede e può cancellare prima di inviare: mai Codice Fiscale, PEC, ordini, indirizzi,
// token o payload.
type SupportDetails = Partial<Omit<SupportDiagnosticState, "timeZone">> & {
  shopDomain: string;
  version: string;
  countryCode?: string | null;
  entitlement?: boolean;
  diagnosticId?: string;
};

export type SupportCategory = keyof ReturnType<typeof texts>["support"]["categories"];

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
