import { useState } from "react";
import { localizedError, type AppErrorCode } from "../../app-error";
import { pendingFetcherIntent, pendingFetcherSource } from "../../form-state";
import { texts } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { OnboardingWindow } from "../onboarding/onboarding-window";
import { commercialState, trialContinuityNotice } from "./commercial-state";
import { DeactivateModal, HomeAside, HomeTrialNotice, HomeValidationSection } from "./HomeSections";
import { RevealBanner } from "../../ui/ui-feedback";
import { KeepHeight, PageWithAside } from "../../ui/ui-page";
import { MerchantCheckIn } from "./MerchantCheckIn";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";
import { homeNextStep } from "./home-next-step";
import type { HomeData } from "./home.server";
import type { HomeIntent } from "./home-intents";

type Submit = (intent: HomeIntent, source?: string) => void;
type Verification = "pending" | "confirmed" | "failed";

export function EligibleHome({
  data,
  fetcherState,
  formData,
  result,
  submit,
  verification,
  retryVerification,
}: {
  data: HomeData;
  fetcherState: "idle" | "loading" | "submitting";
  formData: FormData | undefined;
  result: { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string } | undefined;
  submit: Submit;
  verification: Verification;
  retryVerification: () => void;
}) {
  const t = texts(data.locale);
  // D-199: le sezioni in cima si decidono al primo paint e restano fino al prossimo caricamento;
  // la conferma Shopify ne cambia solo il contenuto. Toglierle o aggiungerle dopo spostava tutta
  // la Home (CLS fino a 0,6 con la guida, 0,18 con un avviso a 390 px). La guida mostra i passi
  // completati, l'avviso risolto lo dice, check-in e avviso della prova compaiono al caricamento
  // successivo.
  const [opening] = useState(() => ({
    notice: data.errorCode !== null,
    setupGuide: data.onboarding !== "completed",
    checkIn: data.showMerchantCheckIn,
    trialNotice: trialContinuityNotice(data) !== null,
  }));
  const [checkInClosed, setCheckInClosed] = useState(false);
  const [trialNoticeData, setTrialNoticeData] = useState(data);
  if (data !== trialNoticeData && trialContinuityNotice(data)) setTrialNoticeData(data);
  const trialNotice = opening.trialNotice ? trialNoticeData : null;
  const currentCommercialState = commercialState(data);
  const entitled = currentCommercialState === "entitled";
  const firstRun = currentCommercialState === "first_run";
  const busy = fetcherState !== "idle" || verification !== "confirmed";
  const pendingIntent = pendingFetcherIntent(formData);
  const pendingSource = pendingFetcherSource(formData);
  const trialDateInBanner = trialNotice?.entitlement.kind === "trial";
  const firstCharge = !data.firstChargeAt
    ? t.plan.firstChargeNow
    : trialDateInBanner
      ? t.plan.firstChargeAfterTrial
      : t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale));
  const nextStep = homeNextStep(data, currentCommercialState, t);
  const issue =
    verification === "failed"
      ? ("retry" as const)
      : data.errorCode && !opening.notice
        ? ("repair" as const)
        : null;

  return (
    <PageWithAside
      heading={t.home.heading}
      aside={
        <>
          <PlanStatus data={data} trialDateInBanner={trialDateInBanner} />
          <HomeAside nextStep={nextStep} t={t} />
        </>
      }
    >
      <HomeNotices
        data={data}
        result={result}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        openedWithNotice={opening.notice}
      />
      {opening.checkIn && !checkInClosed ? (
        <MerchantCheckIn
          data={data}
          busy={busy}
          pendingIntent={pendingIntent}
          onDismiss={() => {
            setCheckInClosed(true);
            submit("dismiss_checkin", "checkin");
          }}
        />
      ) : null}
      {opening.setupGuide ? (
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
        issue={issue}
        retryVerification={retryVerification}
        t={t}
      />
      {trialNotice ? <HomeTrialNotice data={trialNotice} busy={busy} /> : null}
      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />
      <OnboardingWindow />
      <DeactivateModal pendingIntent={pendingIntent} submit={submit} t={t} />
    </PageWithAside>
  );
}

function HomeNotices({
  data,
  result,
  busy,
  pendingIntent,
  submit,
  openedWithNotice,
}: {
  data: HomeData;
  result: { ok: boolean; errorCode?: AppErrorCode } | undefined;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
  openedWithNotice: boolean;
}) {
  const t = texts(data.locale);
  const [resolvedClosed, setResolvedClosed] = useState(false);
  const resolved = !data.errorCode;
  return (
    <>
      {openedWithNotice && !(resolved && resolvedClosed) ? (
        <KeepHeight region="notice">
          {resolved ? (
            <div className="cf-reveal-banner cf-motion-swap">
              <s-banner tone="success" dismissible onDismiss={() => setResolvedClosed(true)}>
                {t.home.noticeResolved}
              </s-banner>
            </div>
          ) : (
            <PrimaryNotice data={data} busy={busy} pendingIntent={pendingIntent} submit={submit} />
          )}
        </KeepHeight>
      ) : null}
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
  const message =
    data.errorCode === "billing_read_failed"
      ? t.plan.lastAttempt
      : data.errorCode === "duplicate_validations" ||
          data.errorCode === "duplicate_validations_active"
        ? t.errors[data.errorCode]
        : t.home.syncNeeded;
  return (
    <RevealBanner tone="critical">
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
