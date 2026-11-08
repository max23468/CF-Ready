import { useEffect, useRef, useState } from "react";
import type { HeadersFunction } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError, type AppErrorCode } from "../app-error";
import { APP_ROUTES } from "../app-routes";
import { requestAppWindowNavigation } from "../app-window-navigation";
import {
  oneOf,
  MESSAGE_KEYS,
  messageAppears,
  PEC_RULE_MODES,
  TAX_CODE_RULE_MODES,
} from "../config";
import { pendingFetcherIntent } from "../form-state";
import { rulesSaveFields } from "../features/rules/rules-form";
import { onboardingStep4State } from "../features/onboarding/step4-state";
import {
  OnboardingCompletion,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Actions,
  OnboardingStep4Content,
} from "../features/onboarding/OnboardingSections";
import {
  ONBOARDING_STEPS,
  type OnboardingCloseIntent,
  type OnboardingIntent,
} from "../features/onboarding/onboarding-contract";
import { CheckoutErrorPreview } from "../features/messages/CustomerMessagesPreview";
import { messageField, proposedFieldLabel } from "../features/messages/message-fields";
import {
  planComparisonLocationState,
  requestPlanComparisonFromFrame,
} from "../features/onboarding/plan-comparison";
import { describeCheckout } from "../features/rules/checkout-summary";
import { RuleModeChoiceList } from "../features/rules/rule-mode-ui";
import { texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { action, loader } from "../features/onboarding/onboarding.server";
import { BrandMark } from "../ui/ui-brand";
import "./app.onboarding.css";

export { action, loader };
export const headers: HeadersFunction = (args) => boundary.headers(args);

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Onboarding() {
  const saved = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const t = texts(saved.locale);
  const [step, setStepState] = useState(saved.step);
  const [finished, setFinished] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const progress = useFetcher();
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const esito = fetcher.data as { ok: boolean; errorCode?: AppErrorCode } | undefined;
  const step4State = onboardingStep4State(saved);

  const go = (intent: OnboardingIntent, extra: Record<string, string> = {}) => {
    fetcher.submit({ intent, ...extra }, { method: "post" });
  };

  const showStep = (next: number) => {
    setStepState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(next));
    window.history.replaceState(window.history.state, "", url);
  };

  const setStep = (next: number) => {
    showStep(next);
    if (!saved.completed) {
      progress.submit(
        { intent: "progress" satisfies OnboardingIntent, step: String(next) },
        { method: "post" },
      );
    }
  };

  useEffect(() => {
    const content = form.current?.querySelector<HTMLElement>(".onboarding-step");
    content?.focus({ preventScroll: true });
    form.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const savingRules = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (savingRules.current) {
      savingRules.current = false;
      if (esito?.ok) showStep(ONBOARDING_STEPS.preview);
    }
    if (closing.current) {
      closing.current = false;
      if (esito?.ok) setFinished(true);
    }
  }, [fetcher.state, esito]);

  const showPlans = () =>
    requestPlanComparisonFromFrame(window, () =>
      navigate(APP_ROUTES.home, {
        state: planComparisonLocationState(),
        viewTransition: true,
      }),
    );

  const goHome = () =>
    requestAppWindowNavigation(window, APP_ROUTES.home, (href) =>
      navigate(href, { viewTransition: true }),
    );

  if (finished) {
    return <OnboardingCompletion saved={saved} goHome={goHome} showPlans={showPlans} />;
  }

  const close = (intent: OnboardingCloseIntent) => {
    closing.current = true;
    go(intent);
  };

  const saveRules = () => {
    const data = form.current ? new FormData(form.current) : null;
    const taxCode = oneOf(TAX_CODE_RULE_MODES, data?.get("taxCode"));
    const pec = oneOf(PEC_RULE_MODES, data?.get("pec"));
    if (!taxCode || !pec) return;
    if (saved.completed && taxCode === saved.rules.taxCode && pec === saved.rules.pec) {
      setStep(ONBOARDING_STEPS.preview);
      return;
    }
    savingRules.current = true;
    go(
      "rules",
      rulesSaveFields({
        configHash: saved.configHash,
        rules: { taxCode, pec },
        labelsEnabled: saved.labelState.mode !== "off",
        labelsConfirmed: false,
        labelsRevision: saved.labelSnapshot?.revision,
      }),
    );
  };

  return (
    <form ref={form}>
      <s-page heading={t.onboarding.heading} inlineSize="small">
        {esito && !esito.ok ? (
          <div className="cf-motion-reveal">
            <s-banner tone="critical">{localizedError(t.errors, esito.errorCode)}</s-banner>
          </div>
        ) : null}

        <s-section heading={onboardingStepHeading(step, t)}>
          <s-stack direction="block" gap="base">
            <OnboardingProgress step={step} t={t} />

            <OnboardingCurrentStep
              step={step}
              saved={saved}
              t={t}
              state={step4State}
              busy={busy}
              pendingIntent={pendingIntent}
              go={go}
              showPlans={showPlans}
            />

            <s-stack direction="inline" gap="base">
              {step === ONBOARDING_STEPS.activation ? (
                <OnboardingStep4Actions
                  t={t}
                  state={step4State}
                  busy={busy}
                  pendingIntent={pendingIntent}
                  close={close}
                  goHome={goHome}
                />
              ) : (
                <s-button
                  variant="primary"
                  disabled={busy}
                  loading={pendingIntent === "rules"}
                  onClick={() => {
                    if (step !== ONBOARDING_STEPS.rules) return setStep(step + 1);
                    saveRules();
                  }}
                >
                  {t.onboarding.next}
                </s-button>
              )}
              {step > ONBOARDING_STEPS.welcome ? (
                <s-button disabled={busy} onClick={() => setStep(step - 1)}>
                  {t.onboarding.back}
                </s-button>
              ) : null}
            </s-stack>
          </s-stack>
        </s-section>
      </s-page>
    </form>
  );
}

type OnboardingData = ReturnType<typeof useLoaderData<typeof loader>>;
type OnboardingCopy = ReturnType<typeof texts>;

type CurrentStepProps = {
  step: number;
  saved: OnboardingData;
  t: OnboardingCopy;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  go: (intent: OnboardingIntent, extra?: Record<string, string>) => void;
  showPlans: () => void;
};

function onboardingStepHeading(step: number, t: OnboardingCopy) {
  if (step === ONBOARDING_STEPS.welcome) return t.onboarding.welcomeHeading;
  if (step === ONBOARDING_STEPS.rules) return t.onboarding.step2Heading;
  if (step === ONBOARDING_STEPS.preview) return t.onboarding.step3Heading;
  return t.onboarding.step4Heading;
}

function OnboardingCurrentStep(props: CurrentStepProps) {
  let content = null;
  if (props.step === ONBOARDING_STEPS.welcome) content = <OnboardingIntroduction t={props.t} />;
  if (props.step === ONBOARDING_STEPS.rules) content = <OnboardingRules {...props} />;
  if (props.step === ONBOARDING_STEPS.preview) {
    content = <OnboardingPreview saved={props.saved} t={props.t} />;
  }
  if (props.step === ONBOARDING_STEPS.activation) {
    content = (
      <OnboardingStep4Content
        saved={props.saved}
        t={props.t}
        state={props.state}
        busy={props.busy}
        pendingIntent={props.pendingIntent}
        startTrial={() => props.go("start_trial")}
        showPlans={props.showPlans}
      />
    );
  }
  return (
    <div className="onboarding-step" key={props.step} tabIndex={-1}>
      {content}
    </div>
  );
}

function OnboardingIntroduction({ t }: { t: OnboardingCopy }) {
  return (
    <>
      <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
        <BrandMark />
        <s-paragraph>{t.onboarding.step1Body}</s-paragraph>
      </s-grid>
      <s-divider />
      <s-stack direction="block" gap="small-100">
        <OnboardingListBlock items={t.onboarding.step1Limits} />
      </s-stack>
    </>
  );
}

function OnboardingRules(props: CurrentStepProps) {
  const { saved, t } = props;
  return (
    <>
      <s-paragraph>{t.onboarding.step2Body}</s-paragraph>
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small-300">
          <s-heading>{t.rules.taxCodeLabel}</s-heading>
          <RuleModeChoiceList
            name="taxCode"
            label={t.rules.taxCodeLabel}
            modes={TAX_CODE_RULE_MODES}
            selected={saved.rules.taxCode}
            copy={t.rules.taxCode}
          />
        </s-stack>
        <s-stack direction="block" gap="small-300">
          <s-heading>{t.rules.pecLabel}</s-heading>
          <RuleModeChoiceList
            name="pec"
            label={t.rules.pecLabel}
            modes={PEC_RULE_MODES}
            selected={saved.rules.pec}
            copy={t.rules.pec}
          />
        </s-stack>
      </s-stack>
    </>
  );
}

function OnboardingPreview({ saved, t }: { saved: OnboardingData; t: OnboardingCopy }) {
  const messages = MESSAGE_KEYS.filter((key) => messageAppears(saved.rules, key));
  return (
    <>
      <s-paragraph>{t.onboarding.step3Body}</s-paragraph>
      {describeCheckout({ rules: saved.rules, status: "active" }, saved.locale).map((line) => (
        <s-paragraph key={line}>{line}</s-paragraph>
      ))}
      <s-stack direction="block" gap="small-100">
        <s-heading>{t.onboarding.step3Messages}</s-heading>
        <s-paragraph>
          {messages.length ? t.onboarding.step3MessagesBody : t.onboarding.step3NoMessages}
        </s-paragraph>
        {messages.length ? <s-text color="subdued">{t.messages.previewHint}</s-text> : null}
      </s-stack>
      <s-stack direction="block" gap="large">
        {messages.map((key) => (
          <div className="onboarding-message" key={key}>
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">{t.messages[key]}</s-text>
              <CheckoutErrorPreview
                locale={saved.locale}
                label={proposedFieldLabel(t, saved.rules, saved.locale, messageField(key))}
                message={saved.messages[saved.locale][key]}
              />
            </s-stack>
          </div>
        ))}
      </s-stack>
    </>
  );
}
