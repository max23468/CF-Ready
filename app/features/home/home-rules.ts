import type { AppErrorCode } from "../../app-error";

const REVIEW_MIN_DAYS = 7;

// Un merchant che ha già configurato almeno una regola, acquisito un diritto valido e acceso
// davvero la Validation ha concluso il setup operativo anche se non ha premuto il pulsante
// finale della procedura guidata. L'evento automatico resta distinto da quello manuale.
export function onboardingCanAutoComplete(state: {
  onboarding: string;
  configured: boolean;
  entitled: boolean;
  validationEnabled: boolean;
  errorCode: AppErrorCode | null;
}) {
  if (state.onboarding === "completed") return false;
  return state.configured && state.entitled && state.validationEnabled && !state.errorCode;
}

// ui-content.md, Recensioni e FR-093: Shopify espone il tipo di store nel piano e sui partner
// development store la modale non può inviare recensioni.
export function reviewIsDue(
  state: {
    onboarding: string;
    validationEnabled: boolean;
    errorCode: AppErrorCode | null;
    enabledSince: string | null;
    partnerDevelopment: boolean;
    // Shopify ha già registrato una recensione: ripetere la richiesta produce solo esiti vuoti.
    reviewCompleted: boolean;
  },
  now: number,
) {
  if (
    state.partnerDevelopment ||
    state.reviewCompleted ||
    state.onboarding !== "completed" ||
    !state.validationEnabled
  )
    return false;
  if (state.errorCode || !state.enabledSince) return false;
  return now - Date.parse(state.enabledSince) >= REVIEW_MIN_DAYS * 86_400_000;
}
