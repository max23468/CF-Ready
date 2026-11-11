import type {
  CheckoutLabelsSnapshot,
  CheckoutLabelState,
  GuidedConfirmation,
} from "../../checkout-labels/domain";
import { isRecord } from "../../primitives";

export const RULES_INTENTS = {
  loadCheckoutLabels: "load_checkout_labels",
  save: "save",
  refreshCheckoutLabels: "refresh_checkout_labels",
  restoreAddress2Labels: "restore_address2_labels",
  acceptAddress2Labels: "accept_address2_labels",
  acceptCheckoutLabels: "accept_checkout_labels",
  confirmGuidedLabels: "confirm_guided_labels",
  resumeOrderNormalization: "resume_order_normalization",
} as const;

// Chiave del fetcher delle azioni sulle etichette: la sezione lo invia, la pagina ne legge l'esito.
export const CHECKOUT_LABELS_ACTION_FETCHER = "checkout-labels-action";

export type CheckoutLabelsLoadAction = {
  ok: true;
  loaded: {
    scopeGranted: boolean;
    snapshot: CheckoutLabelsSnapshot | null;
    state: CheckoutLabelState;
    guidedConfirmations: GuidedConfirmation[];
    errorCode: string | null;
  };
};

export type CheckoutLabelsRefreshAction = {
  ok: true;
  refreshed: {
    snapshot: CheckoutLabelsSnapshot;
    state: CheckoutLabelState;
    guidedConfirmations: GuidedConfirmation[];
  };
};

export function isCheckoutLabelsRead(
  result: unknown,
): result is CheckoutLabelsLoadAction | CheckoutLabelsRefreshAction {
  return isRecord(result) && ("refreshed" in result || "loaded" in result);
}

export type RulesIntent = (typeof RULES_INTENTS)[keyof typeof RULES_INTENTS];
type CheckoutLabelsIntent = Exclude<
  RulesIntent,
  typeof RULES_INTENTS.save | typeof RULES_INTENTS.resumeOrderNormalization
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
