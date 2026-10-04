import { useEffect, useRef, useState } from "react";
import type { HeadersFunction } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError, type AppErrorCode } from "../app-error";
import { requestAppWindowNavigation } from "../app-window-navigation";
import { checkoutLabelCopy } from "../checkout-labels/domain";
import {
  oneOf,
  MESSAGE_KEYS,
  messageAppears,
  PEC_RULE_MODES,
  pendingFetcherIntent,
  TAX_CODE_RULE_MODES,
} from "../config";
import { onboardingStep4State } from "../features/onboarding/step4-state";
import {
  OnboardingCompletion,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Actions,
  OnboardingStep4Content,
} from "../features/onboarding/OnboardingSections";
import { CheckoutErrorPreview } from "../features/messages/CustomerMessagesPreview";
import {
  planComparisonLocationState,
  requestPlanComparisonFromFrame,
} from "../features/home/plan-comparison";
import { describeCheckout, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { action, loader } from "../features/onboarding/onboarding.server";
import { BrandMark } from "../ui-brand";
import "./app.onboarding.css";

export { action, loader };
export const headers: HeadersFunction = (args) => boundary.headers(args);
export { OnboardingListBlock, OnboardingProgress, OnboardingStep4Content };

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Onboarding() {
  const saved = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const t = texts(saved.locale);
  const [step, setStepState] = useState(saved.step);
  const [finished, setFinished] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // Un secondo canale per la sola memoria del passo: la scrittura non tocca lo stato del
  // pulsante principale e non viene mai riletta, quindi non può far rimbalzare la pagina.
  const progress = useFetcher();
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const esito = fetcher.data as { ok: boolean; errorCode?: AppErrorCode } | undefined;
  const step4State = onboardingStep4State(saved);

  const go = (intent: string, extra: Record<string, string> = {}) => {
    fetcher.submit({ intent, step: String(step), ...extra }, { method: "post" });
  };

  // §15.9: riaprendo la procedura si torna dove si era rimasti. Il passo si ricorda scrivendolo,
  // mai rileggendolo: il valore letto all'apertura serve solo come punto di partenza.
  // Il passo va anche nell'URL: ricaricando una revisione già completata si resta dove si era.
  const showStep = (next: number) => {
    setStepState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(next));
    window.history.replaceState(window.history.state, "", url);
  };

  const setStep = (next: number) => {
    showStep(next);
    if (!saved.completed) {
      progress.submit({ intent: "progress", step: String(next) }, { method: "post" });
    }
  };

  useEffect(() => {
    const content = form.current?.querySelector<HTMLElement>(".onboarding-step");
    content?.focus({ preventScroll: true });
    form.current?.scrollIntoView({ block: "start" });
  }, [step]);

  // Il passo vive solo qui. Mescolarlo con lo stato del server produceva salti e blocchi: il
  // server lo riceve quando la procedura si chiude, che è l'unico momento in cui serve
  // ricordarlo. Il secondo passo resta l'eccezione perché scrive le regole su Shopify.
  const savingRules = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (savingRules.current) {
      savingRules.current = false;
      if (esito?.ok) showStep(3);
    }
    // La chiusura va riconosciuta esplicitamente: prima la schermata finale dipendeva dal
    // passo locale, che dopo l'attivazione resta il quarto, quindi non compariva mai e
    // premere `Attiva nel checkout` sembrava non fare nulla.
    if (closing.current) {
      closing.current = false;
      if (esito?.ok) setFinished(true);
    }
  }, [fetcher.state, esito]);

  const showPlans = () =>
    requestPlanComparisonFromFrame(window, () =>
      navigate("/app", {
        state: planComparisonLocationState(),
        viewTransition: true,
      }),
    );

  const goHome = () =>
    requestAppWindowNavigation(window, "/app", (href) => navigate(href, { viewTransition: true }));

  if (finished) {
    return <OnboardingCompletion saved={saved} goHome={goHome} showPlans={showPlans} />;
  }

  const close = (intent: "activate" | "finish") => {
    closing.current = true;
    go(intent);
  };

  const saveRules = () => {
    const data = form.current ? new FormData(form.current) : null;
    const taxCode = oneOf(TAX_CODE_RULE_MODES, data?.get("taxCode"));
    const pec = oneOf(PEC_RULE_MODES, data?.get("pec"));
    if (!taxCode || !pec) return;
    if (saved.completed && taxCode === saved.rules.taxCode && pec === saved.rules.pec) {
      setStep(3);
      return;
    }
    savingRules.current = true;
    go("rules", {
      taxCode,
      pec,
      configHash: saved.configHash ?? "",
      labelsEnabled: saved.labelState.mode !== "off" ? "1" : "0",
      labelsConfirmed: "0",
      labelsRevision: saved.labelSnapshot?.revision ?? "",
    });
  };

  return (
    <form ref={form}>
      {/* O1: pagina stretta nativa, così testo e select non corrono a tutta larghezza. */}
      <s-page heading={t.onboarding.heading} inlineSize="small">
        {esito && !esito.ok ? (
          <div className="cf-motion-reveal">
            <s-banner tone="critical">{localizedError(t.errors, esito.errorCode)}</s-banner>
          </div>
        ) : null}

        {/* P2-T3: il titolo del passo sta fuori dalla card, come nelle altre pagine; i titoli
            di gruppo dentro la card gli restano subordinati. */}
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
              {step === 4 ? (
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
                    if (step !== 2) return setStep(step + 1);
                    saveRules();
                  }}
                >
                  {t.onboarding.next}
                </s-button>
              )}
              {step > 1 ? (
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
  go: (intent: string, extra?: Record<string, string>) => void;
  showPlans: () => void;
};

function onboardingStepHeading(step: number, t: OnboardingCopy) {
  if (step === 1) return t.onboarding.welcomeHeading;
  if (step === 2) return t.onboarding.step2Heading;
  if (step === 3) return t.onboarding.step3Heading;
  return t.onboarding.step4Heading;
}

function OnboardingCurrentStep(props: CurrentStepProps) {
  let content = null;
  if (props.step === 1) content = <OnboardingIntroduction t={props.t} />;
  if (props.step === 2) content = <OnboardingRules {...props} />;
  if (props.step === 3) content = <OnboardingPreview saved={props.saved} t={props.t} />;
  if (props.step === 4) {
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
      {/* O4: icona piccola accanto all'introduzione; il titolo è quello della sezione. */}
      <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200" alignItems="center">
        <BrandMark />
        <s-paragraph>{t.onboarding.welcomeBody}</s-paragraph>
      </s-grid>
      <s-divider />
      <s-stack direction="block" gap="small-100">
        <s-heading>{t.onboarding.step1Heading}</s-heading>
        <OnboardingListBlock
          lead={<s-paragraph>{t.onboarding.step1Body}</s-paragraph>}
          items={t.onboarding.step1Limits}
        />
      </s-stack>
    </>
  );
}

function OnboardingRules(props: CurrentStepProps) {
  const { saved, t } = props;
  return (
    <>
      <s-paragraph>{t.onboarding.step2Body}</s-paragraph>
      {/* P2-T8: titolo e opzioni restano vicini, i due gruppi più distanti tra loro. */}
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small-300">
          <s-heading>{t.rules.taxCodeLabel}</s-heading>
          <s-choice-list
            label={t.rules.taxCodeLabel}
            labelAccessibilityVisibility="exclusive"
            name="taxCode"
          >
            {TAX_CODE_RULE_MODES.map((mode) => (
              <s-choice key={mode} value={mode} selected={mode === saved.rules.taxCode}>
                {t.rules.taxCode[mode]}
                <s-text slot="details">{t.rules.taxCode[`${mode}Help`]}</s-text>
              </s-choice>
            ))}
          </s-choice-list>
        </s-stack>
        <s-stack direction="block" gap="small-300">
          <s-heading>{t.rules.pecLabel}</s-heading>
          <s-choice-list
            label={t.rules.pecLabel}
            labelAccessibilityVisibility="exclusive"
            name="pec"
          >
            {PEC_RULE_MODES.map((mode) => (
              <s-choice key={mode} value={mode} selected={mode === saved.rules.pec}>
                {t.rules.pec[mode]}
                <s-text slot="details">{t.rules.pec[`${mode}Help`]}</s-text>
              </s-choice>
            ))}
          </s-choice-list>
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
      {/* P2-T7: il limite alle consegne in Italia sta già nel passo 1. */}
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
      {/* O2, O3: ogni messaggio è un blocco con etichetta e lo stesso campo d'esempio
          dell'anteprima in Messaggi; i blocchi sono più distanti tra loro che al loro interno. */}
      <s-stack direction="block" gap="large">
        {messages.map((key) => {
          const field = key.startsWith("taxCode") ? "taxCode" : "pec";
          return (
            <div className="onboarding-message" key={key}>
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">{t.messages[key]}</s-text>
                <CheckoutErrorPreview
                  locale={saved.locale}
                  label={
                    checkoutLabelCopy(field, saved.locale, saved.rules[field]) ??
                    t.rules[`${field}Label`]
                  }
                  message={saved.messages[saved.locale][key]}
                />
              </s-stack>
            </div>
          );
        })}
      </s-stack>
    </>
  );
}
