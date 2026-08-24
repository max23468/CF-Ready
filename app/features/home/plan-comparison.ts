export const PLAN_COMPARISON_STORAGE_KEY = "cf-ready:plan-comparison";

type PlanComparisonStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type PlanComparisonEvents = Pick<Window, "addEventListener" | "removeEventListener">;

export function markPlanComparison(storage: PlanComparisonStorage) {
  storage.setItem(PLAN_COMPARISON_STORAGE_KEY, "requested");
}

export function hasPlanComparison(storage: PlanComparisonStorage) {
  return storage.getItem(PLAN_COMPARISON_STORAGE_KEY) === "requested";
}

export function clearPlanComparison(storage: PlanComparisonStorage) {
  storage.removeItem(PLAN_COMPARISON_STORAGE_KEY);
}

export function createPlanComparisonStore(
  storage: PlanComparisonStorage,
  events: PlanComparisonEvents,
) {
  let requested = hasPlanComparison(storage);
  if (requested) clearPlanComparison(storage);
  const listeners = new Set<() => void>();
  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== PLAN_COMPARISON_STORAGE_KEY ||
      event.newValue !== "requested" ||
      !hasPlanComparison(storage)
    ) {
      return;
    }
    clearPlanComparison(storage);
    requested = true;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => requested,
    reset: () => {
      requested = false;
    },
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) events.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) events.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function showSetupGuide(onboarding: string, planComparison: boolean) {
  return onboarding !== "completed" && !planComparison;
}
