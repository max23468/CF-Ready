export const PLAN_COMPARISON_MESSAGE_TYPE = "cf-ready:show-plans";

type MessageTarget = Pick<Window, "postMessage">;
type PlanComparisonMessage = Pick<MessageEvent, "data" | "origin">;
type PlanComparisonActions = { hideWindow(): void; showPlans(): void };

export function requestPlanComparison(target: MessageTarget | null, targetOrigin: string) {
  if (!target) return false;
  target.postMessage({ type: PLAN_COMPARISON_MESSAGE_TYPE }, targetOrigin);
  return true;
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
