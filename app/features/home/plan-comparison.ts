export const PLAN_COMPARISON_MESSAGE_TYPE = "cf-ready:show-plans";
export const PLAN_COMPARISON_LOCATION_STATE = "cf-ready:show-plans";

type MessageTarget = Pick<Window, "postMessage">;
type PlanComparisonMessage = Pick<MessageEvent, "data" | "origin">;
type PlanComparisonActions = { hideWindow(): void; showPlans(): void };
type PlanComparisonFrame = Pick<Window, "location" | "parent">;

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
  try {
    if (frame.parent !== frame && frame.parent.location.origin === frame.location.origin) {
      requestPlanComparison(frame.parent, frame.location.origin);
      return "parent" as const;
    }
  } catch {
    // L'onboarding aperto direttamente vive nel frame Shopify: il parent è cross-origin.
  }
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

export function handlePlanComparisonRequest(
  event: PlanComparisonMessage,
  expectedOrigin: string,
  actions: PlanComparisonActions,
) {
  if (!isPlanComparisonRequest(event, expectedOrigin)) return false;
  actions.hideWindow();
  actions.showPlans();
  return true;
}
