import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator } from "react-router";
import type { AppErrorCode } from "../../app-error";
import { texts } from "../../i18n";
import { openBillingApproval } from "../../revalidation";
import { showToast } from "../../save-bar";
import type { HomeData, action, loader } from "./home.server";
import type { HomeIntent } from "./home-intents";
import { isPlanComparisonLocationState } from "../onboarding/plan-comparison";
import { useOnboardingWindowNavigation } from "../onboarding/onboarding-window";
import { useNativeReviewPrompt } from "./use-native-review-prompt";
import { EligibleHome } from "./EligibleHome";
import { showPlans } from "./show-plans";
import "./HomePage.css";

export default function HomePage() {
  const { home, confirmed } = useLoaderData<typeof loader>();
  const { data, verification } = useConfirmedHome(home, confirmed);
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
  const submit = (intent: HomeIntent, source?: string) => {
    // La chiusura del check-in scrive solo D1: non dipende dalla verifica Shopify in corso.
    if (verification !== "confirmed" && intent !== "dismiss_checkin") return;
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

  useOnboardingWindowNavigation(navigate, showPlansAfterPaint);

  useEffect(() => {
    if (isPlanComparisonLocationState(location.state)) showPlansAfterPaint();
  }, [location.state]);

  return (
    <EligibleHome
      data={data}
      fetcherState={fetcher.state}
      formData={fetcher.formData}
      result={result}
      submit={submit}
      verification={displayedVerification}
      retryVerification={() => void revalidator.revalidate()}
    />
  );
}

// D-167: di solito Shopify conferma entro un secondo e fino ad allora resta lo stato salvato, senza
// far lampeggiare badge e bottoni. `submit` guarda lo stato reale: le azioni restano ferme.
const VERIFICATION_BADGE_DELAY_MS = 1000;

function useSlowPending(pending: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), VERIFICATION_BADGE_DELAY_MS);
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

function showPlansAfterPaint() {
  requestAnimationFrame(showPlans);
}
