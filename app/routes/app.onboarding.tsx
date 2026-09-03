import { useEffect, useRef, useState } from "react";
import type { HeadersFunction } from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { localizedError, type AppErrorCode } from "../app-error";
import { oneOf, pendingFetcherIntent, RULE_MODES } from "../config";
import { onboardingStep4State } from "../features/onboarding/step4-state";
import {
  Address2DeclarationPrompt,
  OnboardingListBlock,
  OnboardingProgress,
  OnboardingStep4Actions,
  OnboardingStep4Content,
} from "../features/onboarding/OnboardingSections";
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

  const readDeclaration = () => {
    const data = form.current ? new FormData(form.current) : null;
    setDeclared(Boolean(data?.get("address2")));
  };

  return (
    <form ref={form} onChange={readDeclaration}>
      <s-page heading={t.onboarding.heading}>
        {esito && !esito.ok ? (
          <div className="cf-motion-reveal">
            <s-banner tone="critical">{localizedError(t.errors, esito.errorCode)}</s-banner>
          </div>
        ) : null}

        <s-section>
          <s-stack direction="block" gap="base">
            <OnboardingProgress step={step} t={t} />

            <div className="onboarding-step" key={step}>
              {step === 1 ? (
                <>
                  {/* A-16: il primo passo è il momento in cui il merchant incontra il prodotto. */}
                  <s-box maxInlineSize="150px">
                    <s-image
                      src="/cf-ready-lockup.svg"
                      alt="CF Ready"
                      aspectRatio="16/3"
                      objectFit="contain"
                    />
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
              ) : null}

              {step === 2 ? (
                <>
                  <s-heading>{t.onboarding.step2Heading}</s-heading>
                  <s-paragraph>{t.onboarding.step2Body}</s-paragraph>
                  {/* Non controllati, come in Regole checkout: i valori appartengono al modulo e
                    si leggono al salvataggio. Riscriverli a ogni render li faceva sfarfallare e
                    poteva far fallire il gestore dell'evento. */}
                  {(["taxCode", "pec"] as const).map((field) => (
                    <s-choice-list
                      key={field}
                      label={field === "taxCode" ? t.rules.taxCodeLabel : t.rules.pecLabel}
                      name={field}
                    >
                      {RULE_MODES.map((mode) => (
                        <s-choice key={mode} value={mode} selected={mode === saved.rules[field]}>
                          {t.rules[field][mode]}
                          <s-text slot="details">{t.rules[field][`${mode}Help`]}</s-text>
                        </s-choice>
                      ))}
                    </s-choice-list>
                  ))}
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <s-heading>{t.onboarding.step3Heading}</s-heading>
                  <s-paragraph>{t.onboarding.step3Body}</s-paragraph>
                  {describeCheckout(
                    {
                      rules: saved.rules,
                      errorDisplay: saved.errorDisplay,
                      status: "active",
                    },
                    saved.locale,
                  ).map((line) => (
                    <s-paragraph key={line}>{line}</s-paragraph>
                  ))}
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
              ) : null}

              {step === 4 ? (
                <OnboardingStep4Content
                  saved={saved}
                  declared={declared}
                  t={t}
                  state={step4State}
                  busy={busy}
                  pendingIntent={pendingIntent}
                  startTrial={() => go("start_trial")}
                  showPlans={() =>
                    requestPlanComparisonFromFrame(window, () =>
                      navigate("/app", {
                        state: planComparisonLocationState(),
                        viewTransition: true,
                      }),
                    )
                  }
                />
              ) : null}
            </div>

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
                    const taxCode = oneOf(RULE_MODES, data?.get("taxCode"));
                    const pec = oneOf(RULE_MODES, data?.get("pec"));
                    if (!taxCode || !pec) return;
                    if (
                      saved.completed &&
                      taxCode === saved.rules.taxCode &&
                      pec === saved.rules.pec
                    ) {
                      return setStep(3);
                    }
                    savingRules.current = true;
                    go("rules", { taxCode, pec });
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
