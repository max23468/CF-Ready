import { useEffect } from "react";
import { useRevalidator } from "react-router";

import { localizedError } from "../../app-error";
import { TAX_CODE_LABEL_FAQ_HREF } from "../../app-routes";
import type { TaxCodeLabelReview } from "../../checkout-labels/tax-code-label-review";
import { TaxCodeLabelIssueText } from "../../checkout-labels/TaxCodeLabelIssueText";
import { texts, type Locale } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { StatusList } from "../../ui/ui-status-list";
import { pecModeBadgeText } from "../rules/checkout-summary";
import { useCheckoutLabelScopeRequest } from "../rules/use-checkout-label-scopes";
import { ONBOARDING_STEP_COUNT, type OnboardingCloseIntent } from "./onboarding-contract";
import type { OnboardingData } from "./onboarding.server";
import type { onboardingStep4State } from "./step4-state";

type CompletionProps = {
  saved: Pick<
    OnboardingData,
    | "locale"
    | "enabled"
    | "entitled"
    | "entitlementKind"
    | "trialStatus"
    | "trialEndsAt"
    | "errorCode"
  >;
  goHome: () => void;
  showPlans: () => void;
};

export function OnboardingCompletion({ saved, goHome, showPlans }: CompletionProps) {
  const t = texts(saved.locale);
  const continuity = t.trialContinuity;
  const active = saved.enabled && saved.entitled && !saved.errorCode;
  const trialEndsAt =
    active && saved.entitlementKind === "trial" && saved.trialStatus === "active"
      ? saved.trialEndsAt
      : null;

  return (
    <s-page heading={t.onboarding.heading} inlineSize="small">
      <s-section heading={active ? continuity.activeHeading : t.onboarding.doneHeading}>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            {trialEndsAt
              ? continuity.onboardingTrial(formatDate(trialEndsAt, saved.locale))
              : t.onboarding.doneBody}
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={goHome}>
              {continuity.goHome}
            </s-button>
            {trialEndsAt ? <s-button onClick={showPlans}>{continuity.choosePlan}</s-button> : null}
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export function OnboardingListBlock({ items }: { items: readonly string[] }) {
  return (
    <s-unordered-list>
      {items.map((line) => (
        <s-list-item key={line}>{line}</s-list-item>
      ))}
    </s-unordered-list>
  );
}

export function OnboardingStep4Content({
  saved,
  t,
  state,
  openPage,
}: {
  saved: OnboardingData;
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  openPage: (href: string) => void;
}) {
  const plan = onboardingAccessCopy(state, t);
  return (
    <>
      <OnboardingConfigurationSummary saved={saved} t={t} openPage={openPage} />
      <s-divider />
      <s-paragraph>{plan}</s-paragraph>
    </>
  );
}

function onboardingAccessCopy(
  state: ReturnType<typeof onboardingStep4State>,
  t: ReturnType<typeof texts>,
) {
  if (state.access === "lapsed") {
    return state.summary === "review" ? t.onboarding.step4Suspended : t.plan.trialOver;
  }
  if (state.access === "first_run") return t.onboarding.step4TrialBody;
  if (state.summary === "review") return t.onboarding.reviewStep4Body;
  const entitlement =
    state.access === "plan" ? t.onboarding.step4PlanActive : t.onboarding.step4TrialActive;
  return `${t.onboarding.step4Body} ${entitlement}`;
}

function OnboardingConfigurationSummary({
  saved,
  t,
  openPage,
}: {
  saved: OnboardingData;
  t: ReturnType<typeof texts>;
  openPage: (href: string) => void;
}) {
  const rows = [
    [t.rules.taxCodeLabel, t.rules.taxCode[saved.rules.taxCode]],
    [t.rules.pecLabel, pecModeBadgeText(saved.rules.pec, t)],
    [t.onboarding.labelsSummary, t.rules.labels.modeValues[saved.labelState.mode]],
    [
      t.onboarding.address2Summary,
      t.rules.labels.addressStatus[saved.labelState.address2Classification],
    ],
  ].map(([label, value]) => ({
    key: label,
    label: <s-text>{label}</s-text>,
    value: <s-badge tone="neutral">{value}</s-badge>,
  }));
  const review = saved.taxCodeLabelReview;
  if (review) {
    const copy = t.taxCodeLabelReview;
    const status = {
      current: copy.current,
      needs_review: copy.pending,
      permissions_required: copy.unavailable,
      unavailable: copy.unavailable,
    }[review.status];
    rows.push({
      key: "tax-code-label",
      label: <s-text>{copy.heading}</s-text>,
      value: (
        <span role="status">
          <s-badge tone={review.status === "current" ? "success" : "warning"}>{status}</s-badge>
        </span>
      ),
    });
  }
  return (
    <s-stack direction="block" gap="base">
      <StatusList rows={rows} />
      {review ? (
        <TaxCodeLabelSummary review={review} locale={saved.locale} openPage={openPage} />
      ) : null}
      {saved.labelState.mode === "partial" ? (
        <s-paragraph color="subdued">{t.onboarding.labelsMixedDescription}</s-paragraph>
      ) : null}
    </s-stack>
  );
}

function TaxCodeLabelSummary({
  review,
  locale,
  openPage,
}: {
  review: TaxCodeLabelReview;
  locale: Locale;
  openPage: (href: string) => void;
}) {
  const copy = texts(locale).taxCodeLabelReview;
  const issue = review.status === "needs_review" ? review.issue : null;
  const body = {
    current: copy.currentBody,
    needs_review: null,
    permissions_required: copy.permissionsBody,
    unavailable: copy.unavailableBody,
  }[review.status];
  return (
    <s-stack direction="block" gap="small-100">
      {issue ? (
        <TaxCodeLabelIssueText issue={issue} locale={locale} />
      ) : (
        <s-paragraph>{body}</s-paragraph>
      )}
      <OnboardingLabelAction review={review} locale={locale} openPage={openPage} />
    </s-stack>
  );
}

function OnboardingLabelAction({
  review,
  locale,
  openPage,
}: {
  review: TaxCodeLabelReview;
  locale: Locale;
  openPage: (href: string) => void;
}) {
  const t = texts(locale);
  const copy = t.taxCodeLabelReview;
  const revalidator = useRevalidator();
  const refresh = () => void revalidator.revalidate();
  const { requestPermissions, revalidationBusy, scopeRequestBusy, scopeRequestError } =
    useCheckoutLabelScopeRequest(refresh);
  const editorUrl = review.status === "needs_review" ? review.issue.editorUrl : undefined;
  useEffect(() => {
    if (!editorUrl) return;
    const checkAfterReturn = () => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") {
        void revalidator.revalidate();
      }
    };
    document.addEventListener("visibilitychange", checkAfterReturn);
    return () => document.removeEventListener("visibilitychange", checkAfterReturn);
  }, [editorUrl, revalidator]);
  if (review.status === "current") return null;
  if (review.status === "needs_review" && review.issue.manual && review.issue.kind !== "custom") {
    return editorUrl ? (
      <s-link href={editorUrl} target="_blank">
        {copy.edit}
      </s-link>
    ) : (
      <s-link
        href={TAX_CODE_LABEL_FAQ_HREF}
        onClick={(event) => {
          event.preventDefault();
          openPage(TAX_CODE_LABEL_FAQ_HREF);
        }}
      >
        {copy.fix}
      </s-link>
    );
  }
  const needsPermissions = review.status === "permissions_required";
  return (
    <>
      {scopeRequestError ? (
        <s-banner tone="critical">{localizedError(t.errors, scopeRequestError)}</s-banner>
      ) : null}
      <div>
        <s-button
          variant="tertiary"
          loading={scopeRequestBusy || revalidationBusy}
          onClick={needsPermissions ? requestPermissions : refresh}
        >
          {needsPermissions ? t.rules.labels.requestPermissions : copy.check}
        </s-button>
      </div>
    </>
  );
}

export function OnboardingProgress({ step, t }: { step: number; t: ReturnType<typeof texts> }) {
  const label = t.onboarding.stepOf(step, ONBOARDING_STEP_COUNT);
  return (
    <s-stack direction="block" gap="small-100">
      <s-text color="subdued">{label}</s-text>
      <s-progress value={step} max={ONBOARDING_STEP_COUNT} accessibilityLabel={label} />
    </s-stack>
  );
}

export function OnboardingStep4Actions({
  t,
  state,
  busy,
  pendingIntent,
  close,
  goHome,
  startTrial,
  showPlans,
}: {
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  close: (intent: OnboardingCloseIntent) => void;
  goHome: () => void;
  startTrial: () => void;
  showPlans: () => void;
}) {
  if (state.access === "lapsed" || state.access === "first_run") {
    return (
      <>
        <s-button
          disabled={busy}
          loading={pendingIntent === "finish"}
          onClick={state.summary === "review" ? goHome : () => close("finish")}
        >
          {state.summary === "review" ? t.onboarding.goHome : t.onboarding.finishWithout}
        </s-button>
        {state.access === "first_run" ? (
          <>
            <s-button variant="tertiary" disabled={busy} onClick={showPlans}>
              {t.onboarding.step4SeePlans}
            </s-button>
            <s-button
              variant="primary"
              disabled={busy}
              loading={pendingIntent === "start_trial"}
              onClick={startTrial}
            >
              {t.onboarding.step4StartTrial}
            </s-button>
          </>
        ) : (
          <s-button variant="primary" disabled={busy} onClick={showPlans}>
            {t.onboarding.step4SeePlans}
          </s-button>
        )}
      </>
    );
  }
  if (state.summary === "review") {
    return (
      <s-button variant="primary" disabled={busy} onClick={goHome}>
        {t.onboarding.goHome}
      </s-button>
    );
  }

  return (
    <>
      <s-button
        disabled={busy}
        loading={pendingIntent === "finish"}
        onClick={() => close("finish")}
      >
        {t.onboarding.finishWithout}
      </s-button>
      {state.canActivate ? (
        <s-button
          variant="primary"
          disabled={busy}
          loading={pendingIntent === "activate"}
          onClick={() => close("activate")}
        >
          {t.onboarding.activate}
        </s-button>
      ) : null}
    </>
  );
}
