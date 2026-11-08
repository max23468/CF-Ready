import { texts } from "../../i18n";
import { formatDate } from "../../i18n/format";
import { pecModeBadgeText } from "../rules/checkout-summary";
import { ONBOARDING_STEP_COUNT, type OnboardingCloseIntent } from "./onboarding-contract";
import type { OnboardingData } from "./onboarding.server";
import type { onboardingStep4State } from "./step4-state";
import { StatusList } from "../../ui/ui-status-list";

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
    <s-grid gridTemplateColumns="1fr" gap="none">
      <s-grid gridTemplateColumns="1fr" gap="none" accessibilityRole="unordered-list">
        {items.map((line) => (
          <s-grid
            key={line}
            gridTemplateColumns="auto 1fr"
            gap="small-100"
            accessibilityRole="list-item"
          >
            <s-text>•</s-text>
            <s-text>{line}</s-text>
          </s-grid>
        ))}
      </s-grid>
    </s-grid>
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
}: {
  saved: OnboardingData;
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  startTrial: () => void;
  showPlans: () => void;
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
      {saved.labelState.mode === "partial" ? (
        <s-paragraph color="subdued">{t.onboarding.labelsMixedDescription}</s-paragraph>
      ) : null}
      <s-paragraph>
        {state.summary === "review"
          ? t.onboarding.reviewStep4Body
          : state.summary === "ready"
            ? t.onboarding.step4BodyReady
            : t.onboarding.step4BodyNeedsEntitlement}
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
