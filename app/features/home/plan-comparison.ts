export const PLAN_COMPARISON_MESSAGE_TYPE = "cf-ready:show-plans";
export const PLAN_COMPARISON_LOCATION_STATE = "cf-ready:show-plans";

type MessageTarget = Pick<Window, "postMessage">;
type PlanComparisonMessage = Pick<MessageEvent, "data" | "origin">;
type PlanComparisonActions = { hideWindow(): Promise<void>; showPlans(): void };
type PlanComparisonFrame = Pick<Window, "location" | "opener">;
type AppWindowElement = HTMLElement & { hide(): Promise<void> };

export async function hideAppWindow(document: Pick<Document, "getElementById">, id: string) {
  const appWindow = document.getElementById(id) as AppWindowElement | null;
  if (!appWindow) return false;
  await appWindow.hide();
  return true;
}

export function planComparisonLocationState() {
  return { cfReady: PLAN_COMPARISON_LOCATION_STATE };
}

export function isPlanComparisonLocationState(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "cfReady" in value &&
    value.cfReady === PLAN_COMPARISON_LOCATION_STATE
  );
}

export function requestPlanComparison(target: MessageTarget | null, targetOrigin: string) {
  if (!target) return false;
  target.postMessage({ type: PLAN_COMPARISON_MESSAGE_TYPE }, targetOrigin);
  return true;
}

export function requestPlanComparisonFromFrame(frame: PlanComparisonFrame, fallback: () => void) {
  // Shopify carica il contenuto di `s-app-window` in un iframe fratello della Home:
  // il parent è l'Admin, mentre `opener` è la pagina che ha aperto la finestra.
  if (frame.opener) {
    requestPlanComparison(frame.opener, frame.location.origin);
    return "opener" as const;
  }

  // Aperto direttamente dalla Guida, l'onboarding vive nel normale frame dell'app.
  fallback();
  return "fallback" as const;
}

export function isPlanComparisonRequest(event: PlanComparisonMessage, expectedOrigin: string) {
  return (
    event.origin === expectedOrigin &&
    typeof event.data === "object" &&
    event.data !== null &&
    "type" in event.data &&
    event.data.type === PLAN_COMPARISON_MESSAGE_TYPE
  );
}

export async function handlePlanComparisonRequest(
  event: PlanComparisonMessage,
  expectedOrigin: string,
  actions: PlanComparisonActions,
) {
  if (!isPlanComparisonRequest(event, expectedOrigin)) return false;
  await actions.hideWindow();
  actions.showPlans();
  return true;
}
