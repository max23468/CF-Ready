import type { ReactNode } from "react";
import { useEffect } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import { ELIGIBLE_COUNTRY, pendingFetcherIntent, pendingFetcherSource } from "../../config";
import {
  formatDate,
  homeCheckoutSummary,
  supportMailto,
  texts,
  trialNotice,
  validationStatus,
} from "../../i18n";
import { openBillingApproval } from "../../revalidation";
import { commercialState } from "./commercial-state";
import { PlanChoice } from "./PlanChoice";
import { PlanStatus } from "./PlanStatus";
import { SetupGuide } from "./SetupGuide";
import type { HomeData, action } from "./home.server";
import {
  handlePlanComparisonRequest,
  hideAppWindow,
  isPlanComparisonLocationState,
} from "./plan-comparison";
import { useOnboardingWindowNavigation } from "./use-onboarding-window-navigation";
import { useNativeReviewPrompt } from "./use-native-review-prompt";
import { MerchantCheckIn } from "./MerchantCheckIn";
import "./HomePage.css";

const ONBOARDING_WINDOW_ID = "onboarding-window";

function MotionBanner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "critical" | "info" | "warning";
}) {
  return (
    <div className="cf-motion-reveal">
      <s-banner tone={tone}>{children}</s-banner>
    </div>
  );
}

type SubmitHomeAction = (intent: string, source?: string) => void;
type HomeActionResult = { ok: boolean; errorCode?: string; confirmationUrl?: string } | undefined;

function UnsupportedHome({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  return (
    <s-page heading={t.home.heading}>
      <s-section heading={t.home.unsupported}>
        <s-box maxInlineSize="180px">
          <s-image
            src="/cf-ready-lockup.svg"
            alt="CF Ready"
            aspectRatio="16/3"
            objectFit="contain"
          />
        </s-box>
        <s-paragraph>{t.home.unsupportedBody}</s-paragraph>
        <s-paragraph>
          {data.shopName} · {data.countryCode} → {ELIGIBLE_COUNTRY}
        </s-paragraph>
        <s-paragraph>{t.home.unsupportedCheckAddress}</s-paragraph>
        <s-paragraph>{t.home.unsupportedGuide}</s-paragraph>
        <s-link href="/app/guide">{t.nav.guide}</s-link>
        <s-paragraph>{t.support.chooseCategory}</s-paragraph>
        {Object.entries(t.support.categories).map(([category, label]) => (
          <s-link
            key={category}
            href={supportMailto(
              {
                shopDomain: data.shopDomain,
                version: data.version,
                countryCode: data.countryCode,
              },
              data.locale,
              category as keyof typeof t.support.categories,
            )}
          >
            {label}
          </s-link>
        ))}
      </s-section>
    </s-page>
  );
}

function HomeNotices({
  data,
  result,
  busy,
  pendingIntent,
  submit,
}: {
  data: HomeData;
  result: HomeActionResult;
  busy: boolean;
  pendingIntent: string | null;
  submit: SubmitHomeAction;
}) {
  const t = texts(data.locale);
  const state = commercialState(data);
  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);

  let primaryNotice: ReactNode = null;
  if (data.errorCode) {
    const message =
      data.errorCode === "billing_read_failed"
        ? t.plan.lastAttempt
        : data.errorCode === "duplicate_validations" ||
            data.errorCode === "duplicate_validations_active"
          ? t.errors[data.errorCode]
          : t.home.syncNeeded;
    primaryNotice = (
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
  } else if (state !== "first_run" && state !== "entitled") {
    primaryNotice = <MotionBanner tone="warning">{t.home.noEntitlement}</MotionBanner>;
  } else if (notice) {
    primaryNotice = <MotionBanner tone={notice.tone}>{notice.text}</MotionBanner>;
  }

  return (
    <>
      {primaryNotice}
      {result && !result.ok ? (
        <MotionBanner tone="critical">
          {t.errors[result.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </MotionBanner>
      ) : null}
    </>
  );
}

function nextStep(data: HomeData, firstRun: boolean, entitled: boolean) {
  const t = texts(data.locale);
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  if (firstRun && !configured) return { text: t.home.nextConfigure, href: "/app/rules" };
  if (firstRun) return { text: t.home.nextStartTrial, href: null };
  if (!entitled) return { text: t.home.nextChoosePlan, href: null };
  if (!configured) return { text: t.home.nextConfigure, href: "/app/rules" };
  if (!data.validationEnabled) return { text: t.home.nextActivate, href: null };
  return { text: t.home.nextTestOrder, href: null };
}

function statusPresentation(data: HomeData, firstRun: boolean, entitled: boolean) {
  const t = texts(data.locale);
  const status = validationStatus(data.validationEnabled, entitled);
  const tone = status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral";
  const badge = data.validationEnabled
    ? t.home.badgeActive
    : firstRun
      ? t.home.badgeNotStarted
      : t.home.badgeInactive;
  const heading =
    status === "active"
      ? t.home.titleActive
      : status === "lapsed"
        ? t.home.titleLapsed
        : firstRun
          ? t.home.titleNotStarted
          : t.home.titleDisabled;
  return { status, tone, badge, heading } as const;
}

function HomeRuleSummary({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  return (
    <div className="cf-data-list">
      <div className="cf-data-row">
        <s-text>{t.rules.taxCodeLabel}</s-text>
        <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
      </div>
      <div className="cf-data-row">
        <s-text>{t.rules.pecLabel}</s-text>
        <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
      </div>
      <div className="cf-data-row">
        <s-text>{t.home.messagesLabel}</s-text>
        <s-badge>{data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}</s-badge>
      </div>
      <s-box background="subdued" borderRadius="base" padding="small-200">
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-icon type="location" color="subdued" />
          <s-text color="subdued">{t.rules.exceptions[0]}</s-text>
        </s-stack>
      </s-box>
    </div>
  );
}

function HomeStatusActions({
  data,
  entitled,
  busy,
  pendingIntent,
  pendingSource,
  submit,
}: Omit<Parameters<typeof HomeStatus>[0], "firstRun">) {
  const t = texts(data.locale);
  return (
    <s-stack direction="inline" gap="base">
      <s-button href="/app/rules" variant="primary">
        {t.home.editRules}
      </s-button>
      {data.validationEnabled ? (
        <s-button commandFor="deactivate" command="--show">
          {t.home.deactivate}
        </s-button>
      ) : (
        <s-button
          disabled={!entitled || busy}
          loading={pendingIntent === "enable" && pendingSource === "status"}
          onClick={() => submit("enable", "status")}
        >
          {t.home.activate}
        </s-button>
      )}
    </s-stack>
  );
}

function HomeStatus({
  data,
  entitled,
  firstRun,
  busy,
  pendingIntent,
  pendingSource,
  submit,
}: {
  data: HomeData;
  entitled: boolean;
  firstRun: boolean;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: SubmitHomeAction;
}) {
  const presentation = statusPresentation(data, firstRun, entitled);

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-badge tone={presentation.tone}>{presentation.badge}</s-badge>
        <s-heading>{presentation.heading}</s-heading>
        {firstRun ? null : (
          <s-paragraph>
            {homeCheckoutSummary({ rules: data.rules, status: presentation.status }, data.locale)}
          </s-paragraph>
        )}
        <s-divider />
        <HomeRuleSummary data={data} />
        <HomeStatusActions
          data={data}
          entitled={entitled}
          busy={busy}
          pendingIntent={pendingIntent}
          pendingSource={pendingSource}
          submit={submit}
        />
      </s-stack>
    </s-section>
  );
}

function HomeAside({
  data,
  firstRun,
  entitled,
}: {
  data: HomeData;
  firstRun: boolean;
  entitled: boolean;
}) {
  const t = texts(data.locale);
  const upcoming = nextStep(data, firstRun, entitled);
  return (
    <>
      <s-section slot="aside" heading={t.home.nextHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{upcoming.text}</s-paragraph>
          {upcoming.href ? <s-link href={upcoming.href}>{t.nav.rules}</s-link> : null}
          {data.address2Declared ? (
            <>
              <s-paragraph>{t.home.nextAddress2}</s-paragraph>
              <s-link href="/app/rules">{t.nav.rules}</s-link>
            </>
          ) : null}
        </s-stack>
      </s-section>
      <s-section slot="aside" heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-stack>
      </s-section>
      <s-stack
        slot="aside"
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="center"
      >
        <s-box maxInlineSize="130px">
          <s-image src="/cf-ready-lockup.svg" alt="" aspectRatio="16/3" objectFit="contain" />
        </s-box>
      </s-stack>
    </>
  );
}

function DeactivateModal({
  data,
  pendingIntent,
  submit,
}: {
  data: HomeData;
  pendingIntent: string | null;
  submit: SubmitHomeAction;
}) {
  const t = texts(data.locale);
  return (
    <s-modal
      id="deactivate"
      heading={t.home.deactivate}
      accessibilityLabel={t.home.deactivateConfirm}
    >
      <s-paragraph>{t.home.deactivateConfirm}</s-paragraph>
      <s-button slot="secondary-actions" commandFor="deactivate" command="--hide">
        {t.common.cancel}
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        loading={pendingIntent === "disable"}
        commandFor="deactivate"
        command="--hide"
        onClick={() => submit("disable")}
      >
        {t.home.deactivate}
      </s-button>
    </s-modal>
  );
}

export default function HomePage() {
  const data = useLoaderData<HomeData>();
  const location = useLocation();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const result = fetcher.data as
    | { ok: boolean; errorCode?: string; confirmationUrl?: string }
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

  if (!data.eligible) {
    return <UnsupportedHome data={data} />;
  }

  const currentCommercialState = commercialState(data);
  const entitled = currentCommercialState === "entitled";
  const firstRun = currentCommercialState === "first_run";
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const pendingSource = pendingFetcherSource(fetcher.formData);
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;

  return (
    <s-page heading={t.home.heading}>
      <HomeNotices
        data={data}
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

      <HomeStatus
        data={data}
        entitled={entitled}
        firstRun={firstRun}
        busy={busy}
        pendingIntent={pendingIntent}
        pendingSource={pendingSource}
        submit={submit}
      />

      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />

      <PlanStatus data={data} />

      <HomeAside data={data} firstRun={firstRun} entitled={entitled} />

      <s-app-window id={ONBOARDING_WINDOW_ID} src="/app/onboarding" />

      <DeactivateModal data={data} pendingIntent={pendingIntent} submit={submit} />
    </s-page>
  );
}
