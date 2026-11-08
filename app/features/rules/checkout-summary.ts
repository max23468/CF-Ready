import { hasRequiredField, type Rules } from "../../config";
import { texts, type Locale } from "../../i18n";

type CheckoutStatus = "active" | "disabled" | "lapsed";

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

  if (status !== "active") lines.push(status === "lapsed" ? t.lapsed : t.disabled);
  return lines;
}

export function rulesException(rules: Rules, locale: Locale) {
  const t = texts(locale).rules;
  return rules.blockAbsentWithoutDelivery === true && hasRequiredField(rules)
    ? t.exceptionsBlockingAbsent
    : t.exceptions[0];
}

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

// La forma breve tiene il badge leggibile anche a 320 px.
export function pecModeBadgeText(mode: Rules["pec"], t: ReturnType<typeof texts>) {
  return mode === "required_when_company" ? t.home.pecRequiredForCompanies : t.rules.pec[mode];
}

export function homeCheckoutSummary(
  { rules, status }: { rules: Rules; status: CheckoutStatus },
  locale: Locale,
) {
  if (status === "active") return summariseCheckout({ rules, status }, locale)[0];
  const t = texts(locale).checkout;
  return status === "lapsed" ? t.lapsed : t.disabled;
}
