import { useEffect, useRef, useState } from "react";
import type { HeadersFunction } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError, type AppErrorCode } from "../app-error";
import { checkoutLabelCopy } from "../checkout-labels/domain";
import {
  oneOf,
  PEC_RULE_MODES,
  pendingFetcherIntent,
  TAX_CODE_RULE_MODES,
  type Rules,
} from "../config";
import { onboardingStep4State } from "../features/onboarding/step4-state";
import {
  Address2DeclarationPrompt,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Actions,
  OnboardingStep4Content,
} from "../features/onboarding/OnboardingSections";
import { CheckoutSimulator } from "../features/rules/CheckoutSimulator";
import {
  planComparisonLocationState,
  requestPlanComparisonFromFrame,
} from "../features/home/plan-comparison";
import { describeCheckout, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { action, loader } from "../features/onboarding/onboarding.server";
import "./app.onboarding.css";

export { action, loader };
export const headers: HeadersFunction = (args) => boundary.headers(args);
export {
  Address2DeclarationPrompt,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Content,
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Onboarding() {
  const saved = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const t = texts(saved.locale);
  const [step, setStepState] = useState(saved.step);
  const [declared, setDeclared] = useState(saved.address2Declared);
  const [draftRules, setDraftRules] = useState<Rules>(saved.rules);
  const [labelsEnabled, setLabelsEnabled] = useState(saved.labelState.mode !== "off");
  const [labelsConfirmed, setLabelsConfirmed] = useState(false);
  const [finished, setFinished] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // Un secondo canale per la sola memoria del passo: la scrittura non tocca lo stato del
  // pulsante principale e non viene mai riletta, quindi non può far rimbalzare la pagina.
  const progress = useFetcher();
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const esito = fetcher.data as { ok: boolean; errorCode?: AppErrorCode } | undefined;
  const step4State = onboardingStep4State(saved);

  const go = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ intent, step: String(step), ...extra }, { method: "post" });

  // §15.9: riaprendo la procedura si torna dove si era rimasti. Il passo si ricorda scrivendolo,
  // mai rileggendolo: il valore letto all'apertura serve solo come punto di partenza.
  const setStep = (next: number) => {
    setStepState(next);
    if (!saved.completed) {
      progress.submit({ intent: "progress", step: String(next) }, { method: "post" });
    }
  };

  // Il passo vive solo qui. Mescolarlo con lo stato del server produceva salti e blocchi: il
  // server lo riceve quando la procedura si chiude, che è l'unico momento in cui serve
  // ricordarlo. Il secondo passo resta l'eccezione perché scrive le regole su Shopify.
  const savingRules = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (savingRules.current) {
      savingRules.current = false;
      if (esito?.ok) setStepState(3);
    }
    // La chiusura va riconosciuta esplicitamente: prima la schermata finale dipendeva dal
    // passo locale, che dopo l'attivazione resta il quarto, quindi non compariva mai e
    // premere `Attiva nel checkout` sembrava non fare nulla.
    if (closing.current) {
      closing.current = false;
      if (esito?.ok) setFinished(true);
    }
  }, [fetcher.state, esito]);

  if (finished) {
    return (
      <s-page heading={t.onboarding.heading}>
        <s-section heading={t.onboarding.doneHeading}>
          <s-stack direction="block" gap="base">
            <s-paragraph>{t.onboarding.doneBody}</s-paragraph>
            <s-link href="/app">{t.nav.home}</s-link>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  // FR-058: la dichiarazione si legge dal modulo, dove i componenti Polaris partecipano
  // davvero, e non dalla proprietà dell'elemento, che nello shadow DOM può non esserci.
  const close = (intent: "activate" | "finish") => {
    closing.current = true;
    const data = form.current ? new FormData(form.current) : null;
    const shown = data?.has("address2Shown") ?? false;
    go(intent, {
      ...(shown ? { address2Shown: "1" } : {}),
      ...(shown && data?.get("address2") ? { address2: "declared" } : {}),
    });
  };

  const readForm = () => {
    const data = form.current ? new FormData(form.current) : null;
    setDeclared(Boolean(data?.get("address2")));
    const taxCode = oneOf(TAX_CODE_RULE_MODES, data?.get("taxCode"));
    const pec = oneOf(PEC_RULE_MODES, data?.get("pec"));
    if (taxCode && pec) setDraftRules({ taxCode, pec });
  };

  const automaticLabelsAvailable = Boolean(
    saved.labelSnapshot?.slots.some(
      (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
    ),
  );

  return (
    <form ref={form} onChange={readForm}>
      <s-page heading={t.onboarding.heading}>
        {esito && !esito.ok ? (
          <div className="cf-motion-reveal">
            <s-banner tone="critical">{localizedError(t.errors, esito.errorCode)}</s-banner>
          </div>
        ) : null}

        <s-section>
          <s-stack direction="block" gap="base">
            <OnboardingProgress step={step} t={t} />

            <OnboardingCurrentStep
              step={step}
              saved={saved}
              t={t}
              draftRules={draftRules}
              labelsEnabled={labelsEnabled}
              labelsConfirmed={labelsConfirmed}
              automaticLabelsAvailable={automaticLabelsAvailable}
              setLabelsEnabled={setLabelsEnabled}
              setLabelsConfirmed={setLabelsConfirmed}
              declared={declared}
              state={step4State}
              busy={busy}
              pendingIntent={pendingIntent}
              go={go}
              showPlans={() =>
                requestPlanComparisonFromFrame(window, () =>
                  navigate("/app", {
                    state: planComparisonLocationState(),
                    viewTransition: true,
                  }),
                )
              }
            />

            <s-stack direction="inline" gap="base">
              {step > 1 ? (
                <s-button disabled={busy} onClick={() => setStep(step - 1)}>
                  {t.onboarding.back}
                </s-button>
              ) : null}
              {step === 4 ? (
                <OnboardingStep4Actions
                  t={t}
                  state={step4State}
                  busy={busy}
                  pendingIntent={pendingIntent}
                  close={close}
                />
              ) : (
                <s-button
                  variant="primary"
                  disabled={busy}
                  loading={pendingIntent === "rules"}
                  onClick={() => {
                    if (step !== 2) return setStep(step + 1);
                    const data = form.current ? new FormData(form.current) : null;
                    const taxCode = oneOf(TAX_CODE_RULE_MODES, data?.get("taxCode"));
                    const pec = oneOf(PEC_RULE_MODES, data?.get("pec"));
                    if (!taxCode || !pec) return;
                    if (
                      saved.completed &&
                      taxCode === saved.rules.taxCode &&
                      pec === saved.rules.pec &&
                      labelsEnabled === (saved.labelState.mode !== "off")
                    ) {
                      return setStep(3);
                    }
                    savingRules.current = true;
                    go("rules", {
                      taxCode,
                      pec,
                      configHash: saved.configHash ?? "",
                      labelsEnabled: labelsEnabled ? "1" : "0",
                      labelsConfirmed: labelsConfirmed ? "1" : "0",
                      labelsRevision: saved.labelSnapshot?.revision ?? "",
                    });
                  }}
                >
                  {t.onboarding.next}
                </s-button>
              )}
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
  draftRules: Rules;
  labelsEnabled: boolean;
  labelsConfirmed: boolean;
  automaticLabelsAvailable: boolean;
  setLabelsEnabled: (enabled: boolean) => void;
  setLabelsConfirmed: (confirmed: boolean) => void;
  declared: boolean;
  state: ReturnType<typeof onboardingStep4State>;
  busy: boolean;
  pendingIntent: string | null;
  go: (intent: string, extra?: Record<string, string>) => void;
  showPlans: () => void;
};

function OnboardingCurrentStep(props: CurrentStepProps) {
  let content = null;
  if (props.step === 1) content = <OnboardingIntroduction t={props.t} />;
  if (props.step === 2) content = <OnboardingRules {...props} />;
  if (props.step === 3) content = <OnboardingPreview saved={props.saved} t={props.t} />;
  if (props.step === 4) {
    content = (
      <OnboardingStep4Content
        saved={props.saved}
        declared={props.declared}
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
    <div className="onboarding-step" key={props.step}>
      {content}
    </div>
  );
}

function OnboardingIntroduction({ t }: { t: OnboardingCopy }) {
  return (
    <>
      <s-box maxInlineSize="150px">
        <s-image src="/cf-ready-lockup.svg" alt="CF Ready" aspectRatio="16/3" objectFit="contain" />
      </s-box>
      <s-heading>{t.onboarding.welcomeHeading}</s-heading>
      <s-paragraph>{t.onboarding.welcomeBody}</s-paragraph>
      <s-divider />
      <s-heading>{t.onboarding.step1Heading}</s-heading>
      <OnboardingListBlock
        lead={<s-paragraph>{t.onboarding.step1Body}</s-paragraph>}
        items={t.onboarding.step1Limits}
      />
    </>
  );
}

function OnboardingRules(props: CurrentStepProps) {
  const { saved, t } = props;
  return (
    <>
      <s-heading>{t.onboarding.step2Heading}</s-heading>
      <s-paragraph>{t.onboarding.step2Body}</s-paragraph>
      <s-choice-list label={t.rules.taxCodeLabel} name="taxCode">
        {TAX_CODE_RULE_MODES.map((mode) => (
          <s-choice key={mode} value={mode} selected={mode === saved.rules.taxCode}>
            {t.rules.taxCode[mode]}
            <s-text slot="details">{t.rules.taxCode[`${mode}Help`]}</s-text>
          </s-choice>
        ))}
      </s-choice-list>
      <s-choice-list label={t.rules.pecLabel} name="pec">
        {PEC_RULE_MODES.map((mode) => (
          <s-choice key={mode} value={mode} selected={mode === saved.rules.pec}>
            {t.rules.pec[mode]}
            <s-text slot="details">{t.rules.pec[`${mode}Help`]}</s-text>
          </s-choice>
        ))}
      </s-choice-list>
      <s-box background="subdued" borderRadius="base" padding="base">
        <s-stack direction="block" gap="small-100">
          <s-heading>{t.onboarding.labelsPreviewHeading}</s-heading>
          {(["it", "en"] as const).map((locale) => (
            <s-text key={locale}>
              {locale.toUpperCase()} ·{" "}
              {checkoutLabelCopy("taxCode", locale, props.draftRules.taxCode) ??
                t.rules.labels.unchanged}
              {" · "}
              {checkoutLabelCopy("pec", locale, props.draftRules.pec) ?? t.rules.labels.unchanged}
            </s-text>
          ))}
        </s-stack>
      </s-box>
      <OnboardingLabelControls {...props} />
    </>
  );
}

function OnboardingLabelControls(props: CurrentStepProps) {
  const { saved, t } = props;
  if (!saved.labelScopesGranted) {
    return (
      <s-stack direction="block" gap="small-100">
        <s-paragraph>{t.onboarding.labelsPermissionsOptional}</s-paragraph>
        <s-button
          disabled={props.busy}
          loading={props.pendingIntent === "request_label_scopes"}
          onClick={() => props.go("request_label_scopes")}
        >
          {t.rules.labels.requestPermissions}
        </s-button>
      </s-stack>
    );
  }
  return (
    <s-stack direction="block" gap="small-100">
      <s-text color="subdued">{t.onboarding.labelsPermissionsGranted}</s-text>
      <s-checkbox
        label={props.automaticLabelsAvailable ? t.rules.labels.enable : t.rules.labels.enableGuided}
        checked={props.labelsEnabled}
        onChange={(event) => props.setLabelsEnabled(event.currentTarget.checked)}
      />
      {props.labelsEnabled && props.automaticLabelsAvailable ? (
        <s-checkbox
          label={t.rules.labels.enableConfirm}
          checked={props.labelsConfirmed}
          onChange={(event) => props.setLabelsConfirmed(event.currentTarget.checked)}
        />
      ) : null}
    </s-stack>
  );
}

function OnboardingPreview({ saved, t }: { saved: OnboardingData; t: OnboardingCopy }) {
  return (
    <>
      <s-heading>{t.onboarding.step3Heading}</s-heading>
      <s-paragraph>{t.onboarding.step3Body}</s-paragraph>
      {describeCheckout({ rules: saved.rules, status: "active" }, saved.locale).map((line) => (
        <s-paragraph key={line}>{line}</s-paragraph>
      ))}
      <CheckoutSimulator
        locale={saved.locale}
        rules={saved.rules}
        messages={saved.messages}
        labelSnapshot={saved.labelSnapshot}
      />
      <OnboardingListBlock
        lead={<s-heading>{t.rules.exceptionsHeading}</s-heading>}
        items={t.rules.exceptions}
      />
      <s-heading>{t.onboarding.step3Messages}</s-heading>
      <OnboardingListBlock
        lead={<s-paragraph>{t.onboarding.step3MessagesBody}</s-paragraph>}
        items={Object.values(saved.messages[saved.locale])}
      />
    </>
  );
}
