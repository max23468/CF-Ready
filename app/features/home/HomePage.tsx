import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator } from "react-router";
import type { AppErrorCode } from "../../app-error";
import { texts } from "../../i18n";
import { openBillingApproval } from "../../revalidation";
import { showToast } from "../../save-bar";
import type { HomeData, action, loader } from "./home.server";
import {
  handlePlanComparisonRequest,
  hideAppWindow,
  isPlanComparisonLocationState,
} from "./plan-comparison";
import { useOnboardingWindowNavigation } from "./use-onboarding-window-navigation";
import { useNativeReviewPrompt } from "./use-native-review-prompt";
import { EligibleHome } from "./EligibleHome";
import { showPlans } from "./show-plans";
import "./HomePage.css";

const ONBOARDING_WINDOW_ID = "onboarding-window";

export default function HomePage() {
  const { home, confirmed } = useLoaderData<typeof loader>();
  const { data, verification } = useConfirmedHome(home, confirmed);
  // Di solito Shopify conferma in meno di un secondo: fino ad allora si mostra lo stato salvato,
  // senza far lampeggiare badge e bottoni. Le azioni restano comunque ferme finché lo stato non è
  // confermato (D-167).
  const slow = useSlowPending(verification === "pending");
  const displayedVerification = verification === "pending" && !slow ? "confirmed" : verification;
  const revalidator = useRevalidator();
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data as
    | { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string; enabled?: boolean }
    | undefined;
  const confirmationUrl = result?.confirmationUrl;
  const submit = (intent: string, source?: string) => {
    if (verification !== "confirmed") return;
    fetcher.submit(source ? { intent, source } : { intent }, {
      method: "post",
    });
  };

  useNativeReviewPrompt(data.reviewDue);

  const toggled = result?.ok ? result.enabled : undefined;
  const { activated, deactivated } = texts(data.locale).home;
  useEffect(() => {
    if (toggled !== undefined) showToast(toggled ? activated : deactivated);
  }, [result, toggled, activated, deactivated]);

  useEffect(() => {
    openBillingApproval(confirmationUrl);
  }, [confirmationUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      void handlePlanComparisonRequest(event, window.location.origin, {
        hideWindow: async () => void (await hideAppWindow(document, ONBOARDING_WINDOW_ID)),
        showPlans: () => requestAnimationFrame(showPlans),
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useOnboardingWindowNavigation(navigate);

  useEffect(() => {
    if (!isPlanComparisonLocationState(location.state)) return;
    requestAnimationFrame(showPlans);
  }, [location.state]);

  return (
    <EligibleHome
      data={data}
      fetcherState={fetcher.state}
      formData={fetcher.formData}
      result={result}
      submit={submit}
      onboardingWindowId={ONBOARDING_WINDOW_ID}
      verification={displayedVerification}
      retryVerification={() => void revalidator.revalidate()}
    />
  );
}

function useSlowPending(pending: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 1000);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending]);
  return pending && slow;
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
