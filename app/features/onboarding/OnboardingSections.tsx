import { RULES_CHECKOUT_LABELS_HREF, TAX_CODE_LABEL_FAQ_HREF } from "../../app-routes";
import type { TaxCodeLabelReview } from "../../checkout-labels/tax-code-label-review";
import { TaxCodeLabelIssueText } from "../../checkout-labels/TaxCodeLabelIssueText";
import { texts, type Locale } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { StatusList } from "../../ui/ui-status-list";
import { pecModeBadgeText } from "../rules/checkout-summary";
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
  busy,
  pendingIntent,
  startTrial,
  showPlans,
  openPage,
}: {
  saved: OnboardingData;
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  startTrial: () => void;
  showPlans: () => void;
  openPage: (href: string) => void;
}) {
  return (
    <>
      <s-stack direction="block" gap="small-100">
        <StatusList
          rows={[
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
          }))}
        />
      </s-stack>
      {saved.taxCodeLabelReview ? (
        <TaxCodeLabelSummary
          review={saved.taxCodeLabelReview}
          locale={saved.locale}
          openPage={openPage}
        />
      ) : null}
      {saved.labelState.mode === "partial" ? (
        <s-paragraph color="subdued">{t.onboarding.labelsMixedDescription}</s-paragraph>
      ) : null}
      <s-paragraph>
        {state.summary === "review" ? t.onboarding.reviewStep4Body : t.onboarding.step4Body}
      </s-paragraph>
      <s-divider />
      <s-stack direction="block" gap="small-100">
        <s-heading>
          {state.access === "plan" ? t.plan.heading : t.onboarding.step4TrialHeading}
        </s-heading>
        {state.access === "trial" ? (
          <s-paragraph>{t.onboarding.step4TrialActive}</s-paragraph>
        ) : state.access === "plan" ? (
          <s-paragraph>{t.onboarding.step4PlanActive}</s-paragraph>
        ) : state.access === "first_run" ? (
          <s-stack direction="block" gap="base">
            <s-paragraph>{t.onboarding.step4TrialBody}</s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                disabled={busy}
                loading={pendingIntent === "start_trial"}
                onClick={startTrial}
              >
                {t.onboarding.step4StartTrial}
              </s-button>
              <s-button onClick={showPlans}>{t.onboarding.step4SeePlans}</s-button>
            </s-stack>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>{t.plan.trialOver}</s-paragraph>
            <s-button onClick={showPlans}>{t.onboarding.step4SeePlans}</s-button>
          </s-stack>
        )}
      </s-stack>
    </>
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
  const current = review.status === "current";
  const issue = review.status === "needs_review" ? review.issue : null;
  const status = {
    current: copy.current,
    needs_review: copy.pending,
    permissions_required: copy.unavailable,
    unavailable: copy.unavailable,
  }[review.status];
  const body = {
    current: copy.currentBody,
    needs_review: null,
    permissions_required: copy.permissionsBody,
    unavailable: copy.unavailableBody,
  }[review.status];
  const action = taxCodeLabelSummaryAction(review, copy);
  return (
    <s-stack direction="block" gap="small-100">
      <s-stack direction="inline" alignItems="center" gap="small-100">
        <s-text>{copy.heading}</s-text>
        <s-badge tone={current ? "success" : "warning"}>{status}</s-badge>
      </s-stack>
      {issue ? (
        <TaxCodeLabelIssueText issue={issue} locale={locale} />
      ) : (
        <s-paragraph>{body}</s-paragraph>
      )}
      {action ? (
        <s-link
          href={action.href}
          onClick={(event) => {
            event.preventDefault();
            openPage(action.href);
          }}
        >
          {action.text}
        </s-link>
      ) : null}
    </s-stack>
  );
}

function taxCodeLabelSummaryAction(
  review: TaxCodeLabelReview,
  copy: ReturnType<typeof texts>["taxCodeLabelReview"],
) {
  if (review.status === "current") return null;
  if (review.status === "needs_review" && review.issue.manual && review.issue.kind !== "custom") {
    return { href: TAX_CODE_LABEL_FAQ_HREF, text: copy.fix };
  }
  return { href: RULES_CHECKOUT_LABELS_HREF, text: copy.check };
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
}: {
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  close: (intent: OnboardingCloseIntent) => void;
  goHome: () => void;
}) {
  if (state.summary === "review") {
    return (
      <s-button variant="primary" disabled={busy} onClick={goHome}>
        {t.onboarding.goHome}
      </s-button>
    );
  }

  return (
    <>
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
      <s-button
        disabled={busy}
        loading={pendingIntent === "finish"}
        onClick={() => close("finish")}
      >
        {t.onboarding.finishWithout}
      </s-button>
    </>
  );
}
