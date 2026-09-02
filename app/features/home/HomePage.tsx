import { useEffect } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import type { AppErrorCode } from "../../app-error";
import { texts } from "../../i18n";
import { openBillingApproval } from "../../revalidation";
import type { HomeData, action } from "./home.server";
import {
  handlePlanComparisonRequest,
  hideAppWindow,
  isPlanComparisonLocationState,
} from "./plan-comparison";
import { useOnboardingWindowNavigation } from "./use-onboarding-window-navigation";
import { useNativeReviewPrompt } from "./use-native-review-prompt";
import { UnsupportedHome } from "./HomeSections";
import { EligibleHome } from "./EligibleHome";
import "./HomePage.css";

const ONBOARDING_WINDOW_ID = "onboarding-window";

export default function HomePage() {
  const data = useLoaderData<HomeData>();
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const result = fetcher.data as
    | { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = result?.confirmationUrl;
  const submit = (intent: string, source?: string) =>
    fetcher.submit(source ? { intent, source } : { intent }, { method: "post" });

  useNativeReviewPrompt(data.reviewDue);

  useEffect(() => {
    openBillingApproval(confirmationUrl);
  }, [confirmationUrl]);

  useEffect(() => {
    const showPlans = (event: MessageEvent) => {
      void handlePlanComparisonRequest(event, window.location.origin, {
        hideWindow: async () => void (await hideAppWindow(document, ONBOARDING_WINDOW_ID)),
        showPlans: () =>
          requestAnimationFrame(() =>
            document.getElementById("plans")?.scrollIntoView({ block: "start" }),
          ),
      });
    };
    window.addEventListener("message", showPlans);
    return () => window.removeEventListener("message", showPlans);
  }, []);

  useOnboardingWindowNavigation(navigate);

  useEffect(() => {
    if (!isPlanComparisonLocationState(location.state)) return;
    requestAnimationFrame(() =>
      document.getElementById("plans")?.scrollIntoView({ block: "start" }),
    );
  }, [location.state]);

  return data.eligible ? (
    <EligibleHome
      data={data}
      fetcherState={fetcher.state}
      formData={fetcher.formData}
      result={result}
      submit={submit}
      onboardingWindowId={ONBOARDING_WINDOW_ID}
    />
  ) : (
    <UnsupportedHome data={data} t={t} />
  );
}
