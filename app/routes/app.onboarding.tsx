import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { address2Declaration, readConfig, RULE_MODES } from "../config";
import type { RuleMode } from "../config";
import { recordEvent } from "../events.server";
import { describeCheckout, resolveLocale, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  findValidation,
  queryContext,
  readAddress2Declaration,
  readOnboarding,
  saveAddress2Declaration,
  saveOnboarding,
  writeValidation,
} from "../validation.server";

const STEPS = 4;

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const validation = findValidation((await queryContext(admin)).validations.nodes);
  const config = readConfig(validation?.metafield?.jsonValue);
  const onboarding = await readOnboarding(db, session.shop);

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
    enabled: validation?.enabled ?? false,
    address2Declared: (await readAddress2Declaration(db, session.shop)) !== null,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = form.get("intent");
  const step = Number(form.get("step") ?? 1);

  if (intent === "back") {
    await saveOnboarding(db, session.shop, { status: "in_progress", step: Math.max(1, step - 1) });
    return { ok: true as const };
  }

  const current = readConfig(
    findValidation((await queryContext(admin)).validations.nodes)?.metafield?.jsonValue,
  );

  // Le regole scelte al passo due si salvano subito, così sopravvivono a una ricarica e la
  // procedura può essere ripresa. La Validation nasce disattivata: attivare resta il gesto
  // finale ed esplicito di FR-051.
  if (intent === "rules") {
    const taxCode = pick(form.get("taxCode"));
    const pec = pick(form.get("pec"));
    if (!taxCode || !pec) return { ok: false as const, errorCode: "generic" };

    const result = await writeValidation(
      admin,
      db,
      session.shop,
      { rules: { taxCode, pec }, errorDisplay: current.errorDisplay, messages: current.messages },
      null,
    );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };

    await saveOnboarding(db, session.shop, { status: "in_progress", step: 3 });
    return { ok: true as const };
  }

  if (intent === "next") {
    await saveOnboarding(db, session.shop, {
      status: "in_progress",
      step: Math.min(STEPS, step + 1),
    });
    return { ok: true as const };
  }

  if (intent !== "finish" && intent !== "activate") {
    return { ok: false as const, errorCode: "generic" };
  }

  const declared = address2Declaration(form);
  if (declared !== null) await saveAddress2Declaration(db, session.shop, declared);

  if (intent === "activate") {
    const result = await writeValidation(
      admin,
      db,
      session.shop,
      { rules: current.rules, errorDisplay: current.errorDisplay, messages: current.messages },
      true,
    );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };

    await recordEvent(db, {
      shopDomain: session.shop,
      name: "validation_enabled",
      class: "validation",
      metadata: { enabled: true, schema_version: 2 },
    });
  }

  // FR-052 resta separato: completare senza attivare conserva la configurazione.
  await saveOnboarding(db, session.shop, { status: "completed", step: 1 });
  await recordEvent(db, {
    shopDomain: session.shop,
    name: "onboarding_completed",
    class: "onboarding",
    metadata: { enabled: intent === "activate" },
  });
  return { ok: true as const };
};

function pick(value: unknown): RuleMode | null {
  return typeof value === "string" && (RULE_MODES as readonly string[]).includes(value)
    ? (value as RuleMode)
    : null;
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Onboarding() {
  const saved = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(saved.locale);
  const [rules, setRules] = useState(saved.rules);
  const [step, setStep] = useState(saved.step);
  const form = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  const esito = fetcher.data as { ok: boolean; errorCode?: string } | undefined;

  const go = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit({ intent, step: String(step), ...extra }, { method: "post" });

  // Il passo due scrive su Shopify: avanza solo quando quella scrittura è andata a buon fine.
  // Il flag distingue l'esito del salvataggio delle regole da quello di un semplice
  // `Indietro`, che altrimenti rispedirebbe avanti chi torna sui suoi passi.
  const savingRules = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle" || !savingRules.current) return;
    savingRules.current = false;
    if (esito?.ok) setStep(3);
  }, [fetcher.state, esito]);

  const move = (next: number) => {
    setStep(next);
    go(next > step ? "next" : "back");
  };

  if (saved.completed && step === 1 && !busy && esito?.ok) {
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
    const data = form.current ? new FormData(form.current) : null;
    const shown = data?.has("address2Shown") ?? false;
    go(intent, {
      ...(shown ? { address2Shown: "1" } : {}),
      ...(shown && data?.get("address2") ? { address2: "declared" } : {}),
    });
  };

  return (
    <form ref={form}>
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
                {(["taxCode", "pec"] as const).map((field) => (
                  <s-choice-list
                    key={field}
                    label={field === "taxCode" ? t.rules.taxCodeLabel : t.rules.pecLabel}
                    name={field}
                    values={[rules[field]]}
                    onChange={(event: { currentTarget: { values: string[] } }) => {
                      const value = pick(event.currentTarget.values[0]);
                      if (value) setRules((current) => ({ ...current, [field]: value }));
                    }}
                  >
                    {RULE_MODES.map((mode) => (
                      <s-choice key={mode} value={mode}>
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
                  { rules: saved.rules, errorDisplay: saved.errorDisplay, status: "disabled" },
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
                  <>
                    <input type="hidden" name="address2Shown" value="1" />
                    <s-banner tone="warning">{t.rules.address2Body}</s-banner>
                    <s-checkbox
                      label={t.rules.address2Checkbox}
                      name="address2"
                      value="declared"
                      defaultChecked={saved.address2Declared}
                    />
                  </>
                )}
                <s-paragraph>{t.onboarding.step4Body}</s-paragraph>
              </>
            ) : null}

            <s-stack direction="inline" gap="base">
              {step > 1 ? (
                <s-button disabled={busy} onClick={() => move(step - 1)}>
                  {t.onboarding.back}
                </s-button>
              ) : null}
              {step === 4 ? (
                <>
                  <s-button variant="primary" disabled={busy} onClick={() => close("activate")}>
                    {t.onboarding.activate}
                  </s-button>
                  <s-button disabled={busy} onClick={() => close("finish")}>
                    {t.onboarding.finishWithout}
                  </s-button>
                </>
              ) : (
                <s-button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    step === 2 ? go("rules", { taxCode: rules.taxCode, pec: rules.pec }) : move(3)
                  }
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
