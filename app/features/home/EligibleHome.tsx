import { useState } from "react";
import { localizedError, type AppErrorCode } from "../../app-error";
import { pendingFetcherIntent, pendingFetcherSource } from "../../config";
import { formatDate, texts } from "../../i18n";
import { commercialState, trialContinuityNotice } from "./commercial-state";
import { DeactivateModal, HomeAside, HomeTrialNotice, HomeValidationSection } from "./HomeSections";
import { RevealBanner } from "../../ui-feedback";
import { MerchantCheckIn } from "./MerchantCheckIn";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";
import { homeNextStep } from "./home-next-step";
import type { HomeData } from "./home.server";

type Submit = (intent: string, source?: string) => void;
type Verification = "pending" | "confirmed" | "failed";

export function EligibleHome({
  data,
  fetcherState,
  formData,
  result,
  submit,
  onboardingWindowId,
  verification,
  retryVerification,
}: {
  data: HomeData;
  fetcherState: "idle" | "loading" | "submitting";
  formData: FormData | undefined;
  result: { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string } | undefined;
  submit: Submit;
  onboardingWindowId: string;
  verification: Verification;
  retryVerification: () => void;
}) {
  const t = texts(data.locale);
  // La guida visibile all'apertura resta fino al prossimo caricamento e mostra i passi completati:
  // toglierla in cima alla pagina dopo la configurazione spostava tutta la Home (CLS fino a 0,6).
  const [setupGuideShown] = useState(() => data.onboarding !== "completed");
  const currentCommercialState = commercialState(data);
  const entitled = currentCommercialState === "entitled";
  const firstRun = currentCommercialState === "first_run";
  // Le azioni partono solo da uno stato confermato da Shopify (D-167).
  const busy = fetcherState !== "idle" || verification !== "confirmed";
  const pendingIntent = pendingFetcherIntent(formData);
  const pendingSource = pendingFetcherSource(formData);
  // H-1: durante la prova il banner dice già la data; piano e scelta non la ripetono.
  const trialDateInBanner =
    data.entitlement.kind === "trial" && trialContinuityNotice(data) !== null;
  const firstCharge = !data.firstChargeAt
    ? t.plan.firstChargeNow
    : trialDateInBanner
      ? t.plan.firstChargeAfterTrial
      : t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale));
  const nextStep = homeNextStep(data, currentCommercialState, t);

  return (
    <s-page heading={t.home.heading}>
      <HomeNotices
        data={data}
        result={result}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        verification={verification}
        retryVerification={retryVerification}
      />
      {data.showMerchantCheckIn ? (
        <MerchantCheckIn data={data} busy={busy} pendingIntent={pendingIntent} submit={submit} />
      ) : null}
      {setupGuideShown ? (
        <SetupGuide
          data={data}
          busy={busy}
          pendingIntent={pendingIntent}
          pendingSource={pendingSource}
          submit={submit}
        />
      ) : null}
      <HomeValidationSection
        data={data}
        entitled={entitled}
        firstRun={firstRun}
        busy={busy}
        pendingIntent={pendingIntent}
        pendingSource={pendingSource}
        submit={submit}
        verification={verification}
        t={t}
      />
      <HomeTrialNotice data={data} busy={busy} />
      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />
      <s-stack slot="aside" direction="block" gap="base">
        <PlanStatus data={data} trialDateInBanner={trialDateInBanner} />
        <HomeAside nextStep={nextStep} t={t} />
      </s-stack>
      <s-app-window id={onboardingWindowId} src="/app/onboarding" />
      <DeactivateModal pendingIntent={pendingIntent} submit={submit} t={t} />
    </s-page>
  );
}

function HomeNotices({
  data,
  result,
  busy,
  pendingIntent,
  submit,
  verification,
  retryVerification,
}: {
  data: HomeData;
  result: { ok: boolean; errorCode?: AppErrorCode } | undefined;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
  verification: Verification;
  retryVerification: () => void;
}) {
  const t = texts(data.locale);
  return (
    <>
      {verification === "failed" ? (
        <RevealBanner tone="warning">
          <s-stack direction="block" gap="small-100">
            <s-paragraph>{t.home.verificationFailed}</s-paragraph>
            <s-button onClick={retryVerification}>{t.home.verificationRetry}</s-button>
          </s-stack>
        </RevealBanner>
      ) : null}
      <PrimaryNotice data={data} busy={busy} pendingIntent={pendingIntent} submit={submit} />
      {result && !result.ok ? (
        <RevealBanner tone="critical">{localizedError(t.errors, result.errorCode)}</RevealBanner>
      ) : null}
    </>
  );
}

function PrimaryNotice({
  data,
  busy,
  pendingIntent,
  submit,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
}) {
  const t = texts(data.locale);
  if (data.errorCode) {
    const message =
      data.errorCode === "billing_read_failed"
        ? t.plan.lastAttempt
        : data.errorCode === "duplicate_validations" ||
            data.errorCode === "duplicate_validations_active"
          ? t.errors[data.errorCode]
          : t.home.syncNeeded;
    return (
      <RevealBanner tone="warning">
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{message}</s-paragraph>
          <s-button
            disabled={busy}
            loading={pendingIntent === "repair"}
            onClick={() => submit("repair")}
          >
            {t.home.repair}
          </s-button>
        </s-stack>
      </RevealBanner>
    );
  }
  return null;
}
