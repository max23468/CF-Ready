import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator } from "react-router";
import type { AppErrorCode } from "../../app-error";
import { openBillingApproval } from "../../revalidation";
import type { HomeData, action, loader } from "./home.server";
import {
  handlePlanComparisonRequest,
  hideAppWindow,
  isPlanComparisonLocationState,
} from "./plan-comparison";
import { useOnboardingWindowNavigation } from "./use-onboarding-window-navigation";
import { useNativeReviewPrompt } from "./use-native-review-prompt";
import { EligibleHome } from "./EligibleHome";
import "./HomePage.css";

const ONBOARDING_WINDOW_ID = "onboarding-window";

export default function HomePage() {
  const { home, confirmed } = useLoaderData<typeof loader>();
  const { data, verification } = useConfirmedHome(home, confirmed);
  const revalidator = useRevalidator();
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data as
    | { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = result?.confirmationUrl;
  const submit = (intent: string, source?: string) =>
    fetcher.submit(source ? { intent, source } : { intent }, {
      method: "post",
    });

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

  return (
    <EligibleHome
      data={data}
      fetcherState={fetcher.state}
      formData={fetcher.formData}
      result={result}
      submit={submit}
      onboardingWindowId={ONBOARDING_WINDOW_ID}
      verification={verification}
      retryVerification={() => void revalidator.revalidate()}
    />
  );
}

// D-167: la conferma Shopify aggiorna la stessa pagina senza rimontarla, così il primo paint
// resta l'elemento LCP e il layout non viene ricostruito.
function useConfirmedHome(stored: HomeData, confirmed: Promise<HomeData>) {
  const [settled, setSettled] = useState<{
    source: Promise<HomeData>;
    data: HomeData | null;
  } | null>(null);

  useEffect(() => {
    let current = true;
    confirmed.then(
      (data) => current && setSettled({ source: confirmed, data }),
      () => current && setSettled({ source: confirmed, data: null }),
    );
    return () => {
      current = false;
    };
  }, [confirmed]);

  if (settled?.source !== confirmed) return { data: stored, verification: "pending" as const };
  return settled.data
    ? { data: settled.data, verification: "confirmed" as const }
    : { data: stored, verification: "failed" as const };
}
