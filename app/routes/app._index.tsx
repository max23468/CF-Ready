import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { formatDate, formatMoney, resolveLocale, summariseCheckout, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import {
  cancelSubscription,
  createCharge,
  returnUrlFor,
  localDate,
  readBilling,
  remainingTrialDays,
  syncTrial,
} from "../billing.server";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import { recordEvent } from "../events.server";
import { BILLING_IS_TEST } from "../env.server";
import { authenticate } from "../shopify.server";
import { ELIGIBLE_COUNTRY, readConfig } from "../config";
import {
  findValidation,
  queryContext,
  readAddress2Declaration,
  reconcile,
  writeValidation,
} from "../validation.server";
import type { Admin } from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  // §11.6: la Home riconcilia a ogni apertura. Lo stato locale non viene mai presentato come
  // certo senza aver riletto Shopify.
  const state = await reconcile(admin, db, session.shop);
  const config = readConfig(state.validation?.metafield?.jsonValue);

  return {
    locale: resolveLocale(request),
    shopName: state.shopName,
    countryCode: state.countryCode,
    eligible: state.eligible,
    validationEnabled: state.validation?.enabled ?? false,
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    address2Declared: (await readAddress2Declaration(db, session.shop)) !== null,
    trialStatus: state.trial?.status ?? null,
    trialEndsAt: state.trial?.ends_at ?? null,
    entitlement: state.entitlement,
    plan: planPrices(state.trial?.pricing_generation ?? "launch"),
    creditEstimate: state.creditEstimate,
    errorCode: state.errorCode,
    planKind: state.account?.plan_kind ?? "none",
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const intent = (await request.formData()).get("intent");

  if (
    intent === "subscribe_monthly" ||
    intent === "subscribe_annual" ||
    intent === "buy_one_time"
  ) {
    return subscribe(admin, db, session.shop, request, {
      kind:
        intent === "subscribe_monthly"
          ? "monthly"
          : intent === "subscribe_annual"
            ? "annual"
            : "one_time",
    });
  }
  if (intent === "cancel") {
    return cancelPlan(admin, db, session.shop);
  }
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, errorCode: "generic" };
  }

  // Attivazione e disattivazione non toccano la configurazione: si riscrive quella osservata
  // cambiando solo lo stato della Validation (FR-052, FR-053).
  const current = readConfig(
    findValidation((await queryContext(admin)).validations.nodes)?.metafield?.jsonValue,
  );
  const result = await writeValidation(
    admin,
    db,
    session.shop,
    { rules: current.rules, errorDisplay: current.errorDisplay, messages: current.messages },
    intent === "enable",
  );

  if (!result.ok) return { ok: false, errorCode: result.errorCode };

  await recordEvent(db, {
    shopDomain: session.shop,
    name: result.enabled ? "validation_enabled" : "validation_disabled",
    class: "validation",
    metadata: { enabled: result.enabled, schema_version: 2 },
  });
  return { ok: true };
};

// L'approvazione avviene su Shopify: qui si crea l'addebito e si restituisce l'URL di
// conferma, che il client apre a livello superiore. Il diritto non viene mai concesso dal
// ritorno: lo stato si rilegge sempre da Shopify.
async function subscribe(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  request: Request,
  { kind }: { kind: PlanKind },
) {
  const { shop } = await queryContext(admin);
  if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
    return { ok: false, errorCode: "country_not_eligible" };
  }

  // Un pagamento unico copre lo store per sempre: nessun altro addebito va creato sopra,
  // né un secondo acquisto né un abbonamento.
  if ((await readBilling(admin, BILLING_IS_TEST)).oneTime) {
    return { ok: false, errorCode: "one_time_already_active" };
  }

  const today = localDate(shop.ianaTimezone);
  const trial = await syncTrial(db, shopDomain, { eligible: true, today });
  const plan = planFor(trial?.pricing_generation ?? "launch", kind);
  if (!plan) {
    return { ok: false, errorCode: "generic" };
  }

  const { confirmationUrl, error } = await createCharge(admin, {
    name: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    // L'acquisto una tantum viene addebitato all'approvazione e rinuncia ai giorni residui;
    // le sottoscrizioni ricevono invece solo i giorni di prova che restano.
    trialDays: kind === "one_time" ? 0 : remainingTrialDays(trial, today),
    test: BILLING_IS_TEST,
    returnUrl: returnUrlFor(request, shopDomain),
  });

  if (error || !confirmationUrl) {
    return { ok: false, errorCode: "charge_failed" };
  }

  return { ok: true, confirmationUrl };
}

// Cancellazione ordinaria: nessuna proratazione, l'accesso resta fino a fine periodo pagato.
async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  const state = await readBilling(admin, BILLING_IS_TEST);
  if (!state.subscription) {
    return { ok: false, errorCode: "no_subscription" };
  }

  const error = await cancelSubscription(admin, state.subscription.id, { prorate: false });
  if (error) {
    return { ok: false, errorCode: "cancel_failed" };
  }

  await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
  return { ok: true };
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  // L'azione restituisce forme diverse a seconda dell'intento: qui interessa solo l'URL.
  const esito = fetcher.data as
    | { ok: boolean; errorCode?: string; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = esito?.confirmationUrl;
  const submit = (intent: string) => fetcher.submit({ intent }, { method: "post" });

  // L'approvazione di un addebito vive fuori dall'iframe: va aperta a livello superiore,
  // altrimenti Shopify rifiuta di caricarla.
  useEffect(() => {
    if (confirmationUrl) open(confirmationUrl, "_top");
  }, [confirmationUrl]);

  if (!data.eligible) {
    return (
      <s-page heading={t.home.heading}>
        <s-section heading={t.home.unsupported}>
          {/* A-16: unica eccezione approvata al divieto di colore di brand nell'app. Il colore
              vive dentro un'illustrazione, mai su un controllo o su uno stato, e solo su
              superfici senza azioni operative. */}
          <s-box maxInlineSize="80px">
            <s-image src="/cf-ready-mark.svg" alt="" />
          </s-box>
          <s-paragraph>{t.home.unsupportedBody}</s-paragraph>
          <s-paragraph>
            {data.shopName} · {data.countryCode} → {ELIGIBLE_COUNTRY}
          </s-paragraph>
          <s-paragraph>{t.home.unsupportedCheckAddress}</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const entitled = data.entitlement.kind !== "none";
  const status = !data.validationEnabled ? "disabled" : entitled ? "active" : "lapsed";
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  const nextStep = !entitled
    ? t.home.nextChoosePlan
    : !configured
      ? t.home.nextConfigure
      : !data.validationEnabled
        ? t.home.nextActivate
        : t.home.nextTestOrder;

  return (
    <s-page heading={t.home.heading}>
      {/* §8.6: un solo banner in cima, e vince quello che blocca l'operatività. */}
      {data.errorCode ? (
        <s-banner tone="warning">{t.home.syncNeeded}</s-banner>
      ) : !entitled ? (
        <s-banner tone="warning">{t.home.noEntitlement}</s-banner>
      ) : null}
      {esito && !esito.ok ? (
        <s-banner tone="critical">
          {t.errors[esito.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      {/* §8.2: una sola idea dominante, dichiarata dal titolo. La frase di esito è il titolo
          della schermata, non un paragrafo in mezzo ad altri quattro uguali. */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-badge
            tone={status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral"}
          >
            {data.validationEnabled ? t.home.active : t.home.inactive}
          </s-badge>
          {summariseCheckout({ rules: data.rules, status }, data.locale).map((line, index) =>
            index === 0 ? (
              <s-heading key={line}>{line}</s-heading>
            ) : (
              <s-paragraph key={line}>{line}</s-paragraph>
            ),
          )}
          {/* I bottoni stanno in un gruppo, non uno accanto all'altro come fratelli nudi: un
              `<form>` per bottone li isolava anche dalla spaziatura. */}
          <s-button-group>
            <s-button href="/app/rules" variant="primary">
              {t.home.editRules}
            </s-button>
            {data.validationEnabled ? (
              <s-button commandFor="deactivate" command="--show">
                {t.home.deactivate}
              </s-button>
            ) : (
              <s-button disabled={fetcher.state !== "idle"} onClick={() => submit("enable")}>
                {t.home.activate}
              </s-button>
            )}
          </s-button-group>
        </s-stack>
      </s-section>

      {/* Riferimento, non impostazioni: contenitore più leggero delle card operative, così le
          sezioni smettono di pesare tutte uguali. */}
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small-100">
          <s-heading>{t.home.configHeading}</s-heading>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text>{t.rules.taxCodeLabel}</s-text>
            <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
          </s-stack>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text>{t.rules.pecLabel}</s-text>
            <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
          </s-stack>
        </s-stack>
      </s-box>

      {/* D-067: le eccezioni automatiche restano visibili anche in Home. */}
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small-100">
          <s-heading>{t.home.howHeading}</s-heading>
          <s-unordered-list>
            {t.rules.exceptions.map((line) => (
              <s-list-item key={line}>{line}</s-list-item>
            ))}
          </s-unordered-list>
        </s-stack>
      </s-box>

      {/* §15.3: un solo prossimo passo, più il promemoria FR-058 finché la dichiarazione resta. */}
      <s-section heading={t.home.nextHeading}>
        <s-paragraph>{nextStep}</s-paragraph>
        {data.address2Declared ? <s-paragraph>{t.home.nextAddress2}</s-paragraph> : null}
      </s-section>

      {/* Il piano resta qui finché la pagina “Piano e fatturazione” non lo accoglie: spostarlo
          adesso toglierebbe al merchant l'unico percorso di pagamento esistente. */}
      <s-box slot="aside">
        <s-section heading={t.plan.heading}>
          <s-paragraph>
            {data.entitlement.kind === "trial"
              ? t.plan.trial(formatDate(data.trialEndsAt, data.locale))
              : data.entitlement.kind === "one_time"
                ? t.plan.oneTime
                : data.entitlement.kind === "subscription"
                  ? t.plan.subscription(formatDate(data.entitlement.validThrough, data.locale))
                  : data.trialStatus === "expired"
                    ? t.plan.trialOver
                    : t.plan.none}
          </s-paragraph>
          {data.plan ? (
            <s-paragraph>
              {(data.plan.generation === "launch" ? t.plan.pricesLaunch : t.plan.pricesStandard)(
                formatMoney(data.plan.monthly, data.locale),
                formatMoney(data.plan.annual, data.locale),
              )}
            </s-paragraph>
          ) : null}
          <s-button-group>
            {data.entitlement.kind === "one_time" || data.planKind === "monthly" ? null : (
              <s-button
                disabled={fetcher.state !== "idle"}
                onClick={() => submit("subscribe_monthly")}
              >
                {data.planKind === "annual" ? t.plan.monthlySwitch : t.plan.monthlyStart}
              </s-button>
            )}
            {data.entitlement.kind === "one_time" || data.planKind === "annual" ? null : (
              <s-button
                disabled={fetcher.state !== "idle"}
                onClick={() => submit("subscribe_annual")}
              >
                {data.planKind === "monthly" ? t.plan.annualSwitch : t.plan.annualStart}
              </s-button>
            )}
            {data.entitlement.kind === "one_time" ? null : (
              <s-button disabled={fetcher.state !== "idle"} onClick={() => submit("buy_one_time")}>
                {data.plan
                  ? t.plan.oneTimeBuy(formatMoney(data.plan.one_time, data.locale))
                  : t.plan.oneTimeSwitch}
              </s-button>
            )}
          </s-button-group>
          {data.entitlement.kind === "subscription" && data.creditEstimate ? (
            <s-paragraph>
              {t.plan.creditEstimate(formatMoney(data.creditEstimate, data.locale))}
            </s-paragraph>
          ) : null}
          {data.entitlement.kind === "subscription" ? (
            <s-button disabled={fetcher.state !== "idle"} onClick={() => submit("cancel")}>
              {t.plan.cancelRenewal}
            </s-button>
          ) : null}
        </s-section>
      </s-box>

      {/* §15.1: le azioni ad alto impatto dichiarano la conseguenza concreta, non “sei sicuro?”. */}
      <s-modal id="deactivate" heading={t.home.deactivate}>
        <s-paragraph>{t.home.deactivateConfirm}</s-paragraph>
        <s-button slot="secondary-actions" commandFor="deactivate" command="--hide">
          {t.common.cancel}
        </s-button>
        {/* §7.7: nella conferma il bottone ripete l'azione, non dice “OK”. */}
        <s-button
          slot="primary-action"
          variant="primary"
          commandFor="deactivate"
          command="--hide"
          onClick={() => submit("disable")}
        >
          {t.home.deactivate}
        </s-button>
      </s-modal>
    </s-page>
  );
}
