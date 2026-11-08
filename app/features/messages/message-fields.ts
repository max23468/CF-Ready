import { MESSAGE_KEYS, type Rules } from "../../config";
import type { Locale, texts } from "../../i18n";
import { checkoutLabelCopy } from "../../checkout-labels/domain";

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export const messageField = (key: MessageKey) =>
  key.startsWith("taxCode") ? ("taxCode" as const) : ("pec" as const);

export function proposedFieldLabel(
  t: ReturnType<typeof texts>,
  rules: Rules,
  locale: Locale,
  field: "taxCode" | "pec",
) {
  return checkoutLabelCopy(field, locale, rules[field]) ?? t.rules[`${field}Label`];
}
