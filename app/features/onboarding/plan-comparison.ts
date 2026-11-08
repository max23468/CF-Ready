const PLAN_COMPARISON_MESSAGE_TYPE = "cf-ready:show-plans";
const PLAN_COMPARISON_LOCATION_STATE = "cf-ready:show-plans";

type PlanComparisonMessage = Pick<MessageEvent, "data" | "origin" | "source">;
type PlanComparisonActions = { hideWindow(): Promise<void>; showPlans(): void };
type PlanComparisonFrame = Pick<Window, "location" | "opener">;

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

export function requestPlanComparisonFromFrame(frame: PlanComparisonFrame, fallback: () => void) {
  // Shopify carica il contenuto di `s-app-window` in un iframe fratello della Home:
  // il parent è l'Admin, mentre `opener` è la pagina che ha aperto la finestra.
  if (frame.opener) {
    frame.opener.postMessage({ type: PLAN_COMPARISON_MESSAGE_TYPE }, frame.location.origin);
    return "opener" as const;
  }

  fallback();
  return "fallback" as const;
}

function isPlanComparisonRequest(
  event: PlanComparisonMessage,
  expectedOrigin: string,
  expectedSource: Window | null,
) {
  return (
    expectedSource !== null &&
    event.source === expectedSource &&
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
  expectedSource: Window | null,
) {
  if (!isPlanComparisonRequest(event, expectedOrigin, expectedSource)) return false;
  await actions.hideWindow();
  actions.showPlans();
  return true;
}
