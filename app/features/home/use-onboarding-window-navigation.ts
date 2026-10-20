import { useEffect } from "react";
import type { NavigateFunction } from "react-router";
import { appWindowSource, handleAppWindowNavigation } from "../../app-window-navigation";
import { hideAppWindow } from "./plan-comparison";

const ONBOARDING_WINDOW_ID = "onboarding-window";

export function useOnboardingWindowNavigation(navigate: NavigateFunction) {
  useEffect(() => {
    const navigateFromWindow = (event: MessageEvent) => {
      void handleAppWindowNavigation(
        event,
        window.location.origin,
        {
          hideWindow: async () => void (await hideAppWindow(document, ONBOARDING_WINDOW_ID)),
          navigate: (href) => navigate(href, { viewTransition: true }),
        },
        appWindowSource(document, ONBOARDING_WINDOW_ID),
      );
    };
    window.addEventListener("message", navigateFromWindow);
    return () => window.removeEventListener("message", navigateFromWindow);
  }, [navigate]);
}
