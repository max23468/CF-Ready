import { useEffect } from "react";
import type { NavigateFunction } from "react-router";
import { APP_ROUTES } from "../../app-routes";
import {
  appWindowSource,
  handleAppWindowNavigation,
  hideAppWindow,
} from "../../app-window-navigation";
import { handlePlanComparisonRequest } from "./plan-comparison";

export const ONBOARDING_WINDOW_ID = "onboarding-window";

// BFS 4.1.1: Home e Guida aprono l'onboarding nella stessa `s-app-window`.
export function OnboardingWindow() {
  return <s-app-window id={ONBOARDING_WINDOW_ID} src={APP_ROUTES.onboarding} />;
}

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
