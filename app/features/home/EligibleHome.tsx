import { localizedError, type AppErrorCode } from "../../app-error";
import { pendingFetcherIntent, pendingFetcherSource } from "../../config";
import { formatDate, texts, trialNotice } from "../../i18n";
import { commercialState } from "./commercial-state";
import { DeactivateModal, HomeAside, HomeValidationSection, MotionBanner } from "./HomeSections";
import { MerchantCheckIn } from "./MerchantCheckIn";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";
import { homeNextStep } from "./home-next-step";
import type { HomeData } from "./home.server";

type Submit = (intent: string, source?: string) => void;

export function EligibleHome({
  data,
  fetcherState,
  formData,
  result,
  submit,
  onboardingWindowId,
}: {
  data: HomeData;
  fetcherState: "idle" | "loading" | "submitting";
  formData: FormData | undefined;
  result: { ok: boolean; errorCode?: AppErrorCode; confirmationUrl?: string } | undefined;
  submit: Submit;
  onboardingWindowId: string;
}) {
  const t = texts(data.locale);
  const currentCommercialState = commercialState(data);
  const entitled = currentCommercialState === "entitled";
  const firstRun = currentCommercialState === "first_run";
  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);
  const busy = fetcherState !== "idle";
  const pendingIntent = pendingFetcherIntent(formData);
  const pendingSource = pendingFetcherSource(formData);
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;
  const nextStep = homeNextStep(data, currentCommercialState, t);

  return (
    <s-page heading={t.home.heading}>
      <HomeNotices
        data={data}
        entitled={entitled}
        firstRun={firstRun}
        notice={notice}
        result={result}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
      />
      {data.showMerchantCheckIn ? (
        <MerchantCheckIn data={data} busy={busy} pendingIntent={pendingIntent} submit={submit} />
      ) : null}
      {data.onboarding !== "completed" ? (
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
        t={t}
      />
      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />
      <PlanStatus data={data} />
      <HomeAside data={data} nextStep={nextStep} t={t} />
      <s-app-window id={onboardingWindowId} src="/app/onboarding" />
      <DeactivateModal pendingIntent={pendingIntent} submit={submit} t={t} />
    </s-page>
  );
}

function HomeNotices({
  data,
  entitled,
  firstRun,
  notice,
  result,
  busy,
  pendingIntent,
  submit,
}: {
  data: HomeData;
  entitled: boolean;
  firstRun: boolean;
  notice: ReturnType<typeof trialNotice>;
  result: { ok: boolean; errorCode?: AppErrorCode } | undefined;
  busy: boolean;
  pendingIntent: string | null;
  submit: Submit;
}) {
  const t = texts(data.locale);
  return (
    <>
      <PrimaryNotice
        data={data}
        entitled={entitled}
        firstRun={firstRun}
        notice={notice}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
      />
      {result && !result.ok ? (
        <MotionBanner tone="critical">{localizedError(t.errors, result.errorCode)}</MotionBanner>
      ) : null}
    </>
  );
}

function PrimaryNotice({
  data,
  entitled,
  firstRun,
  notice,
  busy,
  pendingIntent,
  submit,
}: {
  data: HomeData;
  entitled: boolean;
  firstRun: boolean;
  notice: ReturnType<typeof trialNotice>;
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
      <MotionBanner tone="warning">
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
      </MotionBanner>
    );
  }
  if (!firstRun && !entitled)
    return <MotionBanner tone="warning">{t.home.noEntitlement}</MotionBanner>;
  return notice ? <MotionBanner tone={notice.tone}>{notice.text}</MotionBanner> : null;
}
