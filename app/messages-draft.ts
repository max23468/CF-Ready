import { MESSAGE_KEYS } from "./config";
import type { CheckoutConfig } from "./config";

type Messages = CheckoutConfig["messages"];
type MessageLocale = keyof Messages;
type MessageKey = (typeof MESSAGE_KEYS)[number];

export function updateMessageDraft(
  current: Messages,
  locale: MessageLocale,
  key: MessageKey,
  value: string,
) {
  return {
    ...current,
    [locale]: { ...current[locale], [key]: value },
  };
}

export function messageSubmission(configHash: string, current: Messages) {
  return {
    configHash,
    ...Object.fromEntries(
      (["it", "en"] as const).flatMap((locale) =>
        MESSAGE_KEYS.map((key) => [`${locale}.${key}`, current[locale][key]] as const),
      ),
    ),
  };
}
