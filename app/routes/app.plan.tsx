import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  addDays,
  cancelSubscription,
  createCharge,
  localDate,
  readBilling,
  remainingTrialDays,
  returnUrlFor,
  syncTrial,
} from "../billing.server";
import { ELIGIBLE_COUNTRY } from "../config";
import { BILLING_IS_TEST } from "../env.server";
import { recordEvent } from "../events.server";
import { formatDate, formatMoney, resolveLocale, texts, trialNotice } from "../i18n";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import { queryContext, reconcile } from "../validation.server";
import type { Admin } from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // §11.6: Piano e fatturazione riconcilia a ogni apertura, come la Home. Lo stato commerciale
  // non viene mai presentato come certo senza aver riletto Shopify.
  const state = await reconcile(admin, context.cloudflare.env.DB, session.shop);
  const remaining = remainingTrialDays(state.trial, state.today);

  return {
    locale: resolveLocale(request),
    eligible: state.eligible,
    entitlement: state.entitlement,
    trialStatus: state.trial?.status ?? null,
    trialEndsAt: state.trial?.ends_at ?? null,
    remaining,
    // §14.6: la data del primo addebito è il giorno dopo la fine dei giorni di prova ceduti a
    // Shopify. Senza giorni residui l'addebito parte all'approvazione.
    firstChargeAt: remaining > 0 ? addDays(state.today, remaining) : null,
    plan: planPrices(state.trial?.pricing_generation ?? "launch"),
    planKind: state.account?.plan_kind ?? "none",
    periodEnd: state.account?.current_period_end ?? null,
    accountStatus: state.account?.entitlement_status ?? "none",
    creditEstimate: state.creditEstimate,
    errorCode: state.errorCode,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const intent = (await request.formData()).get("intent");

  if (intent === "cancel") return cancelPlan(admin, db, session.shop);
  if (intent !== "monthly" && intent !== "annual" && intent !== "one_time") {
    return { ok: false, errorCode: "generic" };
  }
  return subscribe(admin, db, session.shop, request, intent);
};

// L'approvazione avviene su Shopify: qui si crea l'addebito e si restituisce l'URL di conferma,
// che il client apre a livello superiore. Il diritto non viene mai concesso dal ritorno.
async function subscribe(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  request: Request,
  kind: PlanKind,
) {
  const { shop } = await queryContext(admin);
  if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
    return { ok: false, errorCode: "country_not_eligible" };
  }

  // Un pagamento unico copre lo store per sempre: nessun altro addebito va creato sopra.
  if ((await readBilling(admin, BILLING_IS_TEST)).oneTime) {
    return { ok: false, errorCode: "one_time_already_active" };
  }

  const today = localDate(shop.ianaTimezone);
  const trial = await syncTrial(db, shopDomain, { eligible: true, today });
  const plan = planFor(trial?.pricing_generation ?? "launch", kind);
  if (!plan) return { ok: false, errorCode: "generic" };

  const { confirmationUrl, error } = await createCharge(admin, {
    name: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    // L'acquisto una tantum viene addebitato all'approvazione e rinuncia ai giorni residui;
    // le sottoscrizioni ricevono invece solo i giorni di prova che restano (FR-074).
    trialDays: kind === "one_time" ? 0 : remainingTrialDays(trial, today),
    test: BILLING_IS_TEST,
    returnUrl: returnUrlFor(request, shopDomain),
  });

  if (error || !confirmationUrl) return { ok: false, errorCode: "charge_failed" };
  return { ok: true, confirmationUrl };
}

// FR-080: cancellazione ordinaria, nessuna proratazione, accesso fino a fine periodo pagato.
async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  const state = await readBilling(admin, BILLING_IS_TEST);
  if (!state.subscription) return { ok: false, errorCode: "no_subscription" };

  if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
    return { ok: false, errorCode: "cancel_failed" };
  }

  await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
  return { ok: true };
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Plan() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const esito = fetcher.data as
    | { ok: boolean; errorCode?: string; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = esito?.confirmationUrl;
  const submit = (intent: string) => fetcher.submit({ intent }, { method: "post" });

  // L'approvazione di un addebito vive fuori dall'iframe: va aperta a livello superiore.
  useEffect(() => {
    if (confirmationUrl) open(confirmationUrl, "_top");
  }, [confirmationUrl]);

  if (!data.eligible) {
    return (
      <s-page heading={t.nav.plan}>
        <s-section heading={t.home.unsupported}>
          <s-paragraph>{t.home.unsupportedBody}</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);
  const onOneTime = data.entitlement.kind === "one_time";
  const busy = fetcher.state !== "idle";
  // §14.6: la data del primo addebito accanto alla scelta, non in un riepilogo che nessuno legge.
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;

  return (
    <s-page heading={t.nav.plan}>
      {/* §8.6: un solo banner in cima, e vince quello che blocca l'operatività. */}
      {data.errorCode ? (
        <s-banner tone="warning">{t.plan.lastAttempt}</s-banner>
      ) : data.entitlement.kind === "none" ? (
        <s-banner tone="warning">{t.home.noEntitlement}</s-banner>
      ) : notice ? (
        <s-banner tone={notice.tone}>{notice.text}</s-banner>
      ) : null}
      {esito && !esito.ok ? (
        <s-banner tone="critical">
          {t.errors[esito.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>
            {data.entitlement.kind === "trial"
              ? t.plan.trial(formatDate(data.trialEndsAt, data.locale))
              : onOneTime
                ? t.plan.oneTime
                : data.entitlement.kind === "subscription"
                  ? t.plan.subscription(formatDate(data.entitlement.validThrough, data.locale))
                  : data.trialStatus === "expired"
                    ? t.plan.trialOver
                    : t.plan.none}
          </s-heading>
          {/* §15.6: periodo corrente e prossimo addebito quando disponibili. */}
          {data.periodEnd && data.planKind !== "one_time" ? (
            <s-paragraph>
              {data.accountStatus === "ending"
                ? t.plan.periodEnds(formatDate(data.periodEnd, data.locale))
                : t.plan.nextCharge(formatDate(data.periodEnd, data.locale))}
            </s-paragraph>
          ) : null}
          {data.plan ? (
            <s-paragraph>
              {data.plan.generation === "launch"
                ? t.plan.generationLaunch
                : t.plan.generationStandard}
            </s-paragraph>
          ) : null}
        </s-stack>
      </s-section>

      {/* Le tre modalità restano visibili anche dopo l'acquisto: §15.6 chiede di mostrare le
          alternative consentite, non di nasconderle. */}
      {data.plan && !onOneTime ? (
        <>
          <s-section heading={t.plan.monthlyName}>
            <s-stack direction="block" gap="small-100">
              <s-heading>{formatMoney(data.plan.monthly, data.locale)}</s-heading>
              <s-paragraph>{firstCharge}</s-paragraph>
              {data.planKind === "monthly" ? null : (
                <s-stack direction="inline" gap="base">
                  <s-button disabled={busy} onClick={() => submit("monthly")}>
                    {data.planKind === "annual" ? t.plan.monthlySwitch : t.plan.monthlyStart}
                  </s-button>
                </s-stack>
              )}
            </s-stack>
          </s-section>

          <s-section heading={t.plan.annualName}>
            <s-stack direction="block" gap="small-100">
              {/* D-070: l'annuale è etichettato `Consigliato`, senza percentuali di risparmio. */}
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-heading>{formatMoney(data.plan.annual, data.locale)}</s-heading>
                <s-badge>{t.plan.recommended}</s-badge>
              </s-stack>
              <s-paragraph>{firstCharge}</s-paragraph>
              {data.planKind === "annual" ? null : (
                <s-stack direction="inline" gap="base">
                  <s-button variant="primary" disabled={busy} onClick={() => submit("annual")}>
                    {data.planKind === "monthly" ? t.plan.annualSwitch : t.plan.annualStart}
                  </s-button>
                </s-stack>
              )}
            </s-stack>
          </s-section>

          <s-section heading={t.plan.oneTimeName}>
            <s-stack direction="block" gap="small-100">
              <s-heading>{formatMoney(data.plan.one_time, data.locale)}</s-heading>
              <s-paragraph>{t.plan.oneTimeCharge}</s-paragraph>
              {/* FR-081: il credito stimato si mostra prima di creare l'acquisto. */}
              {data.entitlement.kind === "subscription" && data.creditEstimate ? (
                <s-paragraph>
                  {t.plan.creditEstimate(formatMoney(data.creditEstimate, data.locale))}
                </s-paragraph>
              ) : null}
              <s-stack direction="inline" gap="base">
                <s-button disabled={busy} onClick={() => submit("one_time")}>
                  {t.plan.oneTimeSwitch}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </>
      ) : null}

      {data.entitlement.kind === "subscription" ? (
        <s-section slot="aside" heading={t.plan.cancelRenewal}>
          <s-stack direction="block" gap="small-100">
            <s-paragraph>{t.plan.cancelBody}</s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button disabled={busy} onClick={() => submit("cancel")}>
                {t.plan.cancelRenewal}
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}
