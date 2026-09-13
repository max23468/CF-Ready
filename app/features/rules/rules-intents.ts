export const RULES_INTENTS = {
  save: "save",
  saveAddress2FormMode: "save_address2_form_mode",
  restoreConfiguration: "restore_configuration",
  refreshCheckoutLabels: "refresh_checkout_labels",
  restoreAddress2Labels: "restore_address2_labels",
  acceptAddress2Labels: "accept_address2_labels",
  acceptCheckoutLabels: "accept_checkout_labels",
  confirmGuidedLabels: "confirm_guided_labels",
} as const;

export type RulesIntent = (typeof RULES_INTENTS)[keyof typeof RULES_INTENTS];
export type CheckoutLabelsIntent = Exclude<
  RulesIntent,
  typeof RULES_INTENTS.save | typeof RULES_INTENTS.restoreConfiguration
>;
export type SubmitCheckoutLabelsIntent = (
  intent: CheckoutLabelsIntent,
  slotIds?: string[],
  values?: Record<string, string>,
) => void;

const rulesIntents = new Set<string>(Object.values(RULES_INTENTS));

export function parseRulesIntent(value: FormDataEntryValue | null): RulesIntent | null {
  if (value === null) return RULES_INTENTS.save;
  return typeof value === "string" && rulesIntents.has(value) ? (value as RulesIntent) : null;
}
