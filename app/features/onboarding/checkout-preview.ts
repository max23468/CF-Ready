import type { ErrorDisplay, Rules } from "../../config";
import { describeCheckout } from "../../i18n";
import type { Locale } from "../../i18n";

export function onboardingCheckoutPreview({
  rules,
  errorDisplay,
  locale,
}: {
  rules: Rules;
  errorDisplay: ErrorDisplay;
  locale: Locale;
}) {
  return describeCheckout({ rules, errorDisplay, status: "active" }, locale);
}
