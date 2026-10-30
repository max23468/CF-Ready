import { useEffect } from "react";
import type { NavigateFunction } from "react-router";
import { appWindowSource, handleAppWindowNavigation } from "../../app-window-navigation";
import { handlePlanComparisonRequest, hideAppWindow } from "./plan-comparison";

export const ONBOARDING_WINDOW_ID = "onboarding-window";

// Home e Guida aprono l'onboarding nella stessa `s-app-window` (BFS 4.1.1): la pagina che la
// ospita riceve i link interni e la richiesta di confrontare i piani.
export function useOnboardingWindowNavigation(navigate: NavigateFunction, showPlans: () => void) {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const source = appWindowSource(document, ONBOARDING_WINDOW_ID);
      const hideWindow = async () => void (await hideAppWindow(document, ONBOARDING_WINDOW_ID));
      void handleAppWindowNavigation(
        event,
        window.location.origin,
        { hideWindow, navigate: (href) => navigate(href, { viewTransition: true }) },
        source,
      );
      void handlePlanComparisonRequest(
        event,
        window.location.origin,
        { hideWindow, showPlans },
        source,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, showPlans]);
}
