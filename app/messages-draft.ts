import { MESSAGE_KEYS } from "./config";
import type { CheckoutConfig } from "./config";

type Messages = CheckoutConfig["messages"];
type MessageLocale = keyof Messages;
type MessageKey = (typeof MESSAGE_KEYS)[number];
const MESSAGE_COUNTER_THRESHOLD = 160;

export function shouldShowMessageCounter(length: number, focused: boolean) {
  return focused || length >= MESSAGE_COUNTER_THRESHOLD;
}

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

// Conserva solo i campi modificati rispetto alla base: vale sia per una risposta
// di salvataggio tardiva sia per il recupero esplicito di un conflitto.
export function rebaseMessageDraft(base: Messages, draft: Messages, current: Messages): Messages {
  return Object.fromEntries(
    (["it", "en"] as const).map((locale) => [
      locale,
      Object.fromEntries(
        MESSAGE_KEYS.map((key) => [
          key,
          draft[locale][key] === base[locale][key] ? current[locale][key] : draft[locale][key],
        ]),
      ),
    ]),
  ) as Messages;
}
