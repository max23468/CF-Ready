import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { describeCheckout, resolveLocale, texts } from "../i18n";
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

const euro = (amount: number) => amount.toFixed(2).replace(".", ",");

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

      <s-section heading={t.home.stateHeading}>
        <s-badge
          tone={status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral"}
        >
          {data.validationEnabled ? t.home.active : t.home.inactive}
        </s-badge>
        {/* Lo stato si legge come conseguenza, non come etichetta: la prima riga dice cosa
            succede davvero a un cliente. */}
        {describeCheckout(
          { rules: data.rules, errorDisplay: data.errorDisplay, status },
          data.locale,
        ).map((line) => (
          <s-paragraph key={line}>{line}</s-paragraph>
        ))}
        {data.validationEnabled ? null : <s-paragraph>{t.home.inactiveBody}</s-paragraph>}

        <s-button href="/app/rules" variant="primary">
          {t.home.editRules}
        </s-button>
        {data.validationEnabled ? (
          <s-button commandFor="deactivate" command="--show">
            {t.home.deactivate}
          </s-button>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="enable" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              {t.home.activate}
            </s-button>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading={t.home.configHeading}>
        <s-paragraph>
          {t.rules.taxCodeLabel}: {t.rules.taxCode[data.rules.taxCode]}
        </s-paragraph>
        <s-paragraph>
          {t.rules.pecLabel}: {t.rules.pec[data.rules.pec]}
        </s-paragraph>
      </s-section>

      {/* D-067: le eccezioni automatiche restano visibili anche in Home. */}
      <s-section heading={t.home.howHeading}>
        <s-unordered-list>
          {t.rules.exceptions.map((line) => (
            <s-list-item key={line}>{line}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      {/* §15.3: un solo prossimo passo, più il promemoria FR-058 finché la dichiarazione resta. */}
      <s-section heading={t.home.nextHeading}>
        <s-paragraph>{nextStep}</s-paragraph>
        {data.address2Declared ? <s-paragraph>{t.home.nextAddress2}</s-paragraph> : null}
      </s-section>

      {/* Il piano resta qui finché la pagina “Piano e fatturazione” non lo accoglie: spostarlo
          adesso toglierebbe al merchant l'unico percorso di pagamento esistente. */}
      <s-section heading="Piano">
        <s-paragraph>
          {data.entitlement.kind === "trial"
            ? `Prova attiva fino al ${data.trialEndsAt}.`
            : data.entitlement.kind === "one_time"
              ? "Pagamento unico attivo, senza rinnovi."
              : data.entitlement.kind === "subscription"
                ? `Abbonamento attivo fino al ${data.entitlement.validThrough}.`
                : data.trialStatus === "expired"
                  ? "Prova terminata: scegli una modalità per riattivare le regole."
                  : "Nessun piano attivo."}
        </s-paragraph>
        {data.plan ? (
          <s-paragraph>
            Prezzo {data.plan.generation === "launch" ? "di lancio" : "standard"}:{" "}
            {euro(data.plan.monthly)} € ogni 30 giorni oppure {euro(data.plan.annual)} € all’anno.
          </s-paragraph>
        ) : null}
        {data.entitlement.kind === "one_time" || data.planKind === "monthly" ? null : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="subscribe_monthly" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              {data.planKind === "annual" ? "Passa al mensile" : "Attiva il mensile"}
            </s-button>
          </fetcher.Form>
        )}
        {data.entitlement.kind === "one_time" || data.planKind === "annual" ? null : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="subscribe_annual" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              {data.planKind === "monthly" ? "Passa all’annuale" : "Attiva l’annuale"}
            </s-button>
          </fetcher.Form>
        )}
        {data.entitlement.kind === "one_time" ? null : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="buy_one_time" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              {data.plan
                ? `Un solo pagamento: ${euro(data.plan.one_time)} €`
                : "Passa a un solo pagamento"}
            </s-button>
          </fetcher.Form>
        )}
        {data.entitlement.kind === "subscription" && data.creditEstimate ? (
          <s-paragraph>
            Credito stimato sul periodo non usufruito: {euro(data.creditEstimate)} €. È una stima:
            nella fattura Shopify l’acquisto può comparire a prezzo pieno e il credito
            separatamente, e l’importo effettivo è quello calcolato da Shopify.
          </s-paragraph>
        ) : null}
        {data.entitlement.kind === "subscription" ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="cancel" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              Cancella il rinnovo
            </s-button>
          </fetcher.Form>
        ) : null}
      </s-section>

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
          onClick={() => fetcher.submit({ intent: "disable" }, { method: "post" })}
        >
          {t.home.deactivate}
        </s-button>
      </s-modal>
    </s-page>
  );
}
