import type { ReactNode } from "react";
import type { texts } from "../../i18n";
import type { OnboardingData } from "./onboarding.server";
import type { onboardingStep4State } from "./step4-state";

const STEPS = 4;

export function OnboardingListBlock({
  lead,
  items,
}: {
  lead: ReactNode;
  items: readonly string[];
}) {
  return (
    <s-grid gridTemplateColumns="1fr" gap="none">
      {lead}
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
  declared,
  t,
  state,
  busy,
  pendingIntent,
  startTrial,
  showPlans,
}: {
  saved: OnboardingData;
  declared: boolean;
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  startTrial: () => void;
  showPlans: () => void;
}) {
  return (
    <>
      <s-heading>{t.onboarding.step4Heading}</s-heading>
      <div className="cf-data-list">
        <div className="cf-data-row">
          <s-text>{t.rules.taxCodeLabel}</s-text>
          <s-badge>{t.rules.taxCode[saved.rules.taxCode]}</s-badge>
        </div>
        <div className="cf-data-row">
          <s-text>{t.rules.pecLabel}</s-text>
          <s-badge>{t.rules.pec[saved.rules.pec]}</s-badge>
        </div>
      </div>
      {saved.rules.taxCode === "unmanaged" ? null : (
        <Address2DeclarationPrompt declared={declared} t={t} />
      )}
      <s-paragraph>
        {state.summary === "review"
          ? t.onboarding.reviewStep4Body
          : state.summary === "ready"
            ? t.onboarding.step4BodyReady
            : t.onboarding.step4BodyNeedsEntitlement}
      </s-paragraph>
      <s-divider />
      <s-heading>{t.onboarding.step4TrialHeading}</s-heading>
      {state.access === "trial" ? (
        <s-paragraph>{t.onboarding.step4TrialActive}</s-paragraph>
      ) : state.access === "plan" ? (
        <s-paragraph>{t.onboarding.step4PlanActive}</s-paragraph>
      ) : state.access === "first_run" ? (
        <>
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
        </>
      ) : (
        <>
          <s-paragraph>{t.plan.trialOver}</s-paragraph>
          <s-button onClick={showPlans}>{t.onboarding.step4SeePlans}</s-button>
        </>
      )}
    </>
  );
}

export function OnboardingProgress({ step, t }: { step: number; t: ReturnType<typeof texts> }) {
  return <s-text color="subdued">{t.onboarding.stepOf(step, STEPS)}</s-text>;
}

export function OnboardingStep4Actions({
  t,
  state,
  busy,
  pendingIntent,
  close,
}: {
  t: ReturnType<typeof texts>;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  close: (intent: "activate" | "finish") => void;
}) {
  if (state.summary === "review") {
    return (
      <s-button
        variant="primary"
        disabled={busy}
        loading={pendingIntent === "finish"}
        onClick={() => close("finish")}
      >
        {t.onboarding.completeReview}
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

export function Address2DeclarationPrompt({
  declared,
  t,
}: {
  declared: boolean;
  t: ReturnType<typeof texts>;
}) {
  return (
    <>
      <input type="hidden" name="address2Shown" value="1" />
      <s-banner tone="warning">{t.rules.address2Body}</s-banner>
      <s-checkbox
        label={t.rules.address2Checkbox}
        name="address2"
        value="declared"
        checked={declared}
      />
      {declared ? (
        <div className="cf-motion-reveal">
          <s-paragraph>{t.rules.address2Instructions}</s-paragraph>
        </div>
      ) : null}
    </>
  );
}
