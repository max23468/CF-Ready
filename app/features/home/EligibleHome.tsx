import { useState } from "react";

import { localizedError, type AppErrorCode } from "../../app-error";
import { TAX_CODE_LABEL_FAQ_HREF } from "../../app-routes";
import type { TaxCodeLabelIssue } from "../../checkout-labels/tax-code-label-review";
import { TaxCodeLabelIssueText } from "../../checkout-labels/TaxCodeLabelIssueText";
import { pendingFetcherIntent, pendingFetcherSource } from "../../form-state";
import { texts } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { RevealBanner } from "../../ui/ui-feedback";
import { KeepHeight, PageWithAside } from "../../ui/ui-page";
import { OnboardingWindow } from "../onboarding/onboarding-window";
import { commercialState, trialContinuityNotice } from "./commercial-state";
import type { HomeIntent } from "./home-intents";
import { homeNextStep } from "./home-next-step";
import type { HomeData, HomeOrderUsage as HomeOrderUsageData } from "./home.server";
import { HomeOrderUsage } from "./HomeOrderUsage";
import { DeactivateModal, HomeAside, HomeTrialNotice, HomeValidationSection } from "./HomeSections";
import { MerchantCheckIn } from "./MerchantCheckIn";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";

type Submit = (intent: HomeIntent, source?: string) => void;
type Verification = "pending" | "confirmed" | "failed";

export function EligibleHome({
  data,
  orderUsage = null,
  orderScopeHint = false,
  labelNotice = null,
  fetcherState,
  formData,
  result,
  submit,
  verification,
  retryVerification,
}: {
  data: HomeData;
  orderUsage?: Promise<HomeOrderUsageData> | null;
  orderScopeHint?: boolean;
  labelNotice?: TaxCodeLabelIssue | null;
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
    trialNoticePosition: trialNoticePosition(data),
  }));
  const [trialNoticeData, setTrialNoticeData] = useState(data);
  if (data !== trialNoticeData && trialContinuityNotice(data)) setTrialNoticeData(data);
  const trialNotice = opening.trialNoticePosition ? trialNoticeData : null;
  const currentCommercialState = commercialState(data);
  const entitled = currentCommercialState === "entitled";
  const firstRun = currentCommercialState === "first_run";
  const busy = fetcherState !== "idle" || verification !== "confirmed";
  const pendingIntent = pendingFetcherIntent(formData);
  const pendingSource = pendingFetcherSource(formData);
  const trialDateInBanner = trialNotice?.entitlement.kind === "trial";
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
          <HomeOrderUsage usage={orderUsage} scopeHint={orderScopeHint} locale={data.locale} />
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
        expiredTrial={opening.trialNoticePosition === "top" ? trialNotice : null}
        openedWithCheckIn={opening.checkIn}
      />
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
      <HomeTaxCodeLabelNotice issue={labelNotice} locale={data.locale} />
      <HomeTrialNotice
        data={opening.trialNoticePosition === "below" ? trialNotice : null}
        busy={busy}
      />
      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={homeFirstCharge(data, trialDateInBanner)}
        trialDateInBanner={trialDateInBanner}
      />
      <OnboardingWindow />
      <DeactivateModal pendingIntent={pendingIntent} submit={submit} t={t} />
    </PageWithAside>
  );
}

function homeFirstCharge(data: HomeData, trialDateInBanner: boolean) {
  const t = texts(data.locale).plan;
  if (!data.firstChargeAt) return t.firstChargeNow;
  return trialDateInBanner
    ? t.firstChargeAfterTrial
    : t.firstCharge(formatDate(data.firstChargeAt, data.locale));
}

function trialNoticePosition(data: HomeData) {
  if (!trialContinuityNotice(data)) return null;
  return commercialState(data) === "lapsed" ? "top" : "below";
}

function HomeNotices({
  data,
  result,
  busy,
  pendingIntent,
  submit,
  openedWithNotice,
  expiredTrial,
  openedWithCheckIn,
}: {
  data: HomeData;
  result: { ok: boolean; errorCode?: AppErrorCode } | undefined;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
  openedWithNotice: boolean;
  expiredTrial: HomeData | null;
  openedWithCheckIn: boolean;
}) {
  const t = texts(data.locale);
  const [resolvedClosed, setResolvedClosed] = useState(false);
  const [checkInClosed, setCheckInClosed] = useState(false);
  // BFS 4.3.4: un solo banner in cima. L'errore dell'ultima azione prende il posto dell'avviso
  // di stato, dentro la stessa regione che ne conserva l'altezza (D-199).
  const actionError =
    result && !result.ok ? (
      <RevealBanner tone="critical">{localizedError(t.errors, result.errorCode)}</RevealBanner>
    ) : null;
  if (operationalNoticeVisible(openedWithNotice, resolvedClosed, data.errorCode)) {
    return (
      <KeepHeight region="notice">
        {actionError ?? (
          <OperationalNotice
            data={data}
            busy={busy}
            pendingIntent={pendingIntent}
            submit={submit}
            closeResolved={() => setResolvedClosed(true)}
          />
        )}
      </KeepHeight>
    );
  }
  if (actionError || data.errorCode) return actionError;
  if (expiredTrial) return <HomeTrialNotice data={expiredTrial} busy={busy} />;
  return openedWithCheckIn && !checkInClosed ? (
    <MerchantCheckIn
      data={data}
      busy={busy}
      pendingIntent={pendingIntent}
      onDismiss={() => {
        setCheckInClosed(true);
        submit("dismiss_checkin", "checkin");
      }}
    />
  ) : null;
}

function HomeTaxCodeLabelNotice({
  issue,
  locale,
}: {
  issue: TaxCodeLabelIssue | null;
  locale: HomeData["locale"];
}) {
  if (!issue) return null;
  const copy = texts(locale).taxCodeLabelReview;
  return (
    <s-banner tone="warning" heading={copy.bannerHeading}>
      <TaxCodeLabelIssueText issue={issue} locale={locale} />
      <s-button
        slot="secondary-actions"
        href={issue.editorUrl ?? TAX_CODE_LABEL_FAQ_HREF}
        target={issue.editorUrl ? "_blank" : undefined}
      >
        {issue.editorUrl ? copy.edit : copy.fix}
      </s-button>
    </s-banner>
  );
}

function operationalNoticeVisible(
  openedWithNotice: boolean,
  resolvedClosed: boolean,
  errorCode: HomeData["errorCode"],
) {
  return openedWithNotice && (Boolean(errorCode) || !resolvedClosed);
}

function OperationalNotice({
  data,
  busy,
  pendingIntent,
  submit,
  closeResolved,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
  closeResolved: () => void;
}) {
  const t = texts(data.locale);
  if (!data.errorCode) {
    return (
      <div className="cf-reveal-banner cf-motion-swap">
        <s-banner tone="success" dismissible onDismiss={closeResolved}>
          {t.home.noticeResolved}
        </s-banner>
      </div>
    );
  }
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
