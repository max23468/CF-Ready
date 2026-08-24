export const PLAN_COMPARISON_STORAGE_KEY = "cf-ready:plan-comparison";

type PlanComparisonStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function markPlanComparison(storage: PlanComparisonStorage) {
  storage.setItem(PLAN_COMPARISON_STORAGE_KEY, "requested");
}

export function hasPlanComparison(storage: PlanComparisonStorage) {
  return storage.getItem(PLAN_COMPARISON_STORAGE_KEY) === "requested";
}

export function clearPlanComparison(storage: PlanComparisonStorage) {
  storage.removeItem(PLAN_COMPARISON_STORAGE_KEY);
}

export function showSetupGuide(onboarding: string, planComparison: boolean) {
  return onboarding !== "completed" && !planComparison;
}
