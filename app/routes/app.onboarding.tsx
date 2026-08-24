import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { localDate, startTrial } from "../billing.server";
import {
  address2Declaration,
  ELIGIBLE_COUNTRY,
  oneOf,
  parseOnboardingStep,
  pendingFetcherIntent,
  readConfig,
  RULE_MODES,
} from "../config";
import { databaseContext } from "../context.server";
import { recordEvent } from "../events.server";
import { describeCheckout, resolveLocale, texts, validationStatus } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  queryContext,
  readAddress2Declaration,
  readOnboarding,
  reconcile,
  saveAddress2Declaration,
  saveOnboarding,
  writeValidation,
} from "../validation.server";

const STEPS = 4;

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop);
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const [onboarding, address2Declaration] = await Promise.all([
    readOnboarding(db, session.shop),
    readAddress2Declaration(db, session.shop),
  ]);

  return {
    locale: resolveLocale(request),
    // Il passo arriva da D1 così la procedura si riprende dove era rimasta. Chiuderla riporta
    // il contatore a uno: riaprirla dalla Guida riparte dall'inizio, senza azzerare nulla
    // (§15.9), e senza restare incastrata sul riepilogo.
    step: onboarding.step,
    completed: onboarding.status === "completed",
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    messages: config.messages,
    enabled: state.validationEnabled,
    entitlementKind: state.entitlement.kind,
    entitled: state.entitlement.kind !== "none",
    trialStatus: state.trial?.status ?? null,
    address2Declared: address2Declaration !== null,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const form = await request.formData();
  const intent = form.get("intent");

  // La sola memoria del passo, senza altri effetti: serve a riprendere la procedura dove era.
  if (intent === "progress" || intent === "back" || intent === "next") {
    const step = parseOnboardingStep(form.get("step"));
    if (step === null) return { ok: false as const, errorCode: "generic" };
    await saveOnboarding(db, session.shop, {
      status: "in_progress",
      step,
    });
    return { ok: true as const };
  }

  // Le regole scelte al passo due si salvano subito, così sopravvivono a una ricarica e la
  // procedura può essere ripresa. La Validation nasce disattivata: attivare resta il gesto
  // finale ed esplicito di FR-051.
  if (intent === "rules") {
    const taxCode = oneOf(RULE_MODES, form.get("taxCode"));
    const pec = oneOf(RULE_MODES, form.get("pec"));
    if (!taxCode || !pec) return { ok: false as const, errorCode: "generic" };

    const result = await writeValidation(
      admin,
      db,
      session.shop,
      { rules: { taxCode, pec } },
      null,
    );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };

    await saveOnboarding(db, session.shop, { status: "in_progress", step: 3 });
    return { ok: true as const };
  }

  // La prova parte da una scelta esplicita, qui come in Home: nessun giorno si consuma
  // finché il merchant non la chiede.
  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    const trial = await startTrial(db, session.shop, {
      eligible: shop.shopAddress.countryCodeV2 === ELIGIBLE_COUNTRY,
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false as const, errorCode: "store_not_supported" as const };
    if (trial.status !== "active") {
      return { ok: false as const, errorCode: "trial_unavailable" as const };
    }
    return { ok: true as const };
  }

  if (intent !== "finish" && intent !== "activate") {
    return { ok: false as const, errorCode: "generic" };
  }

  const declared = address2Declaration(form);

  if (intent === "activate") {
    const result = await writeValidation(admin, db, session.shop, null, true, undefined, declared);
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };

    await recordEvent(db, {
      shopDomain: session.shop,
      name: "validation_enabled",
      class: "validation",
      metadata: { enabled: true, schema_version: 2 },
    });
  } else if (declared !== null) {
    await saveAddress2Declaration(db, session.shop, declared);
  }

  // FR-052 resta separato: completare senza attivare conserva la configurazione.
  const enabled =
    intent === "activate" ? true : (await readOnboarding(db, session.shop)).validationEnabled;
  await saveOnboarding(db, session.shop, { status: "completed", step: 1 });
  await recordEvent(db, {
    shopDomain: session.shop,
    name: "onboarding_completed",
    class: "onboarding",
    metadata: { enabled },
  });
  return { ok: true as const };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Onboarding() {
  const saved = useLoaderData<typeof loader>();
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
  const esito = fetcher.data as { ok: boolean; errorCode?: string } | undefined;
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
          <s-banner tone="critical">
            {t.errors[esito.errorCode as keyof typeof t.errors] ?? t.errors.generic}
          </s-banner>
        ) : null}

        <s-section>
          <s-stack direction="block" gap="base">
            {/* Avanzamento con le spunte dei passi già fatti, come nella guida di configurazione. */}
            <s-stack direction="block" gap="small-100">
              <s-text color="subdued">{t.onboarding.stepOf(step, STEPS)}</s-text>
              <s-stack direction="inline" gap="base">
                {t.onboarding.stepNames.map((name, index) => (
                  <s-stack key={name} direction="inline" gap="small-100" alignItems="center">
                    {index + 1 < step ? <s-icon type="check-circle" tone="success" /> : null}
                    <s-text type={index + 1 === step ? "strong" : undefined} color="subdued">
                      {name}
                    </s-text>
                  </s-stack>
                ))}
              </s-stack>
            </s-stack>

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
                <s-paragraph>{t.onboarding.step1Body}</s-paragraph>
                <s-unordered-list>
                  {t.onboarding.step1Limits.map((line) => (
                    <s-list-item key={line}>{line}</s-list-item>
                  ))}
                </s-unordered-list>
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
                {describeCheckout(
                  {
                    rules: saved.rules,
                    errorDisplay: saved.errorDisplay,
                    status: validationStatus(saved.enabled, saved.entitled),
                  },
                  saved.locale,
                ).map((line) => (
                  <s-paragraph key={line}>{line}</s-paragraph>
                ))}
                <s-heading>{t.rules.exceptionsHeading}</s-heading>
                <s-unordered-list>
                  {t.rules.exceptions.map((line) => (
                    <s-list-item key={line}>{line}</s-list-item>
                  ))}
                </s-unordered-list>
                <s-heading>{t.onboarding.step3Messages}</s-heading>
                <s-paragraph>{t.onboarding.step3MessagesBody}</s-paragraph>
                <s-unordered-list>
                  {Object.values(saved.messages[saved.locale]).map((line) => (
                    <s-list-item key={line}>{line}</s-list-item>
                  ))}
                </s-unordered-list>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <s-heading>{t.onboarding.step4Heading}</s-heading>
                <s-stack direction="block" gap="small-100">
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-text>{t.rules.taxCodeLabel}</s-text>
                    <s-badge>{t.rules.taxCode[saved.rules.taxCode]}</s-badge>
                  </s-stack>
                  <s-stack direction="inline" gap="small-100" alignItems="center">
                    <s-text>{t.rules.pecLabel}</s-text>
                    <s-badge>{t.rules.pec[saved.rules.pec]}</s-badge>
                  </s-stack>
                </s-stack>
                {/* FR-058: l'avviso sul campo “Interno” compare prima dell'attivazione. */}
                {saved.rules.taxCode === "unmanaged" ? null : (
                  <Address2DeclarationPrompt declared={declared} t={t} />
                )}
                <s-paragraph>
                  {step4State.summary === "review"
                    ? t.onboarding.reviewStep4Body
                    : step4State.summary === "ready"
                      ? t.onboarding.step4BodyReady
                      : t.onboarding.step4BodyNeedsEntitlement}
                </s-paragraph>

                {/* La prova non è mai partita da sola: qui il merchant decide se cominciarla
                    o passare direttamente ai piani. Chi ha già un diritto valido non vede
                    nulla di tutto questo. */}
                <s-divider />
                <s-heading>{t.onboarding.step4TrialHeading}</s-heading>
                {step4State.access === "trial" ? (
                  <s-paragraph>{t.onboarding.step4TrialActive}</s-paragraph>
                ) : step4State.access === "plan" ? (
                  <s-paragraph>{t.onboarding.step4PlanActive}</s-paragraph>
                ) : step4State.access === "first_run" ? (
                  <>
                    <s-paragraph>{t.onboarding.step4TrialBody}</s-paragraph>
                    <s-stack direction="inline" gap="base">
                      <s-button
                        variant="primary"
                        disabled={busy}
                        loading={pendingIntent === "start_trial"}
                        onClick={() => go("start_trial")}
                      >
                        {t.onboarding.step4StartTrial}
                      </s-button>
                      <s-link href="/app">{t.onboarding.step4SeePlans}</s-link>
                    </s-stack>
                  </>
                ) : (
                  <>
                    <s-paragraph>{t.plan.trialOver}</s-paragraph>
                    <s-link href="/app">{t.onboarding.step4SeePlans}</s-link>
                  </>
                )}
              </>
            ) : null}

            <s-stack direction="inline" gap="base">
              {step > 1 ? (
                <s-button disabled={busy} onClick={() => setStep(step - 1)}>
                  {t.onboarding.back}
                </s-button>
              ) : null}
              {step === 4 ? (
                saved.enabled ? (
                  <s-button
                    variant="primary"
                    disabled={busy}
                    loading={pendingIntent === "finish"}
                    onClick={() => close("finish")}
                  >
                    {t.onboarding.completeReview}
                  </s-button>
                ) : step4State.canActivate ? (
                  <>
                    <s-button
                      variant="primary"
                      disabled={busy}
                      loading={pendingIntent === "activate"}
                      onClick={() => close("activate")}
                    >
                      {t.onboarding.activate}
                    </s-button>
                    <s-button
                      disabled={busy}
                      loading={pendingIntent === "finish"}
                      onClick={() => close("finish")}
                    >
                      {t.onboarding.finishWithout}
                    </s-button>
                  </>
                ) : (
                  <s-button
                    disabled={busy}
                    loading={pendingIntent === "finish"}
                    onClick={() => close("finish")}
                  >
                    {t.onboarding.finishWithout}
                  </s-button>
                )
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

export function onboardingStep4State({
  enabled,
  entitled,
  entitlementKind,
  trialStatus,
}: {
  enabled: boolean;
  entitled: boolean;
  entitlementKind: "none" | "trial" | "subscription" | "one_time";
  trialStatus: string | null;
}) {
  return {
    summary: enabled ? ("review" as const) : entitled ? ("ready" as const) : ("needs" as const),
    access: entitled
      ? entitlementKind === "trial"
        ? ("trial" as const)
        : ("plan" as const)
      : trialStatus === null
        ? ("first_run" as const)
        : ("lapsed" as const),
    canActivate: !enabled && entitled,
  };
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
      {declared ? <s-paragraph>{t.rules.address2Instructions}</s-paragraph> : null}
    </>
  );
}
