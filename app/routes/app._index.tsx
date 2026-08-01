import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
  addDays,
  cancelSubscription,
  createCharge,
  localDate,
  readBilling,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  syncTrial,
} from "../billing.server";
import { ELIGIBLE_COUNTRY, messagesAreDefault, readConfig, reviewIsDue } from "../config";
import { BILLING_IS_TEST } from "../env.server";
import { recordEvent } from "../events.server";
import {
  formatDate,
  formatMoney,
  resolveLocale,
  summariseCheckout,
  texts,
  trialNotice,
} from "../i18n";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  queryContext,
  readAddress2Declaration,
  readOnboarding,
  reconcile,
  validationEnabledSince,
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
  const onboarding = await readOnboarding(db, session.shop);

  return {
    locale: resolveLocale(request),
    shopName: state.shopName,
    countryCode: state.countryCode,
    eligible: state.eligible,
    validationEnabled: state.validation?.enabled ?? false,
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    messagesDefault: messagesAreDefault(config.messages),
    address2Declared: (await readAddress2Declaration(db, session.shop)) !== null,
    trialEndsAt: state.trial?.ends_at ?? null,
    remaining: remainingTrialDays(state.trial, state.today),
    entitlement: state.entitlement,
    // §14.6: il primo addebito cade il giorno dopo i giorni di prova ceduti a Shopify.
    firstChargeAt:
      remainingTrialDays(state.trial, state.today) > 0
        ? addDays(state.today, remainingTrialDays(state.trial, state.today))
        : null,
    trialStatus: state.trial?.status ?? null,
    plan: planPrices(state.trial?.pricing_generation ?? "launch"),
    planKind: state.account?.plan_kind ?? "none",
    periodEnd: state.account?.current_period_end ?? null,
    accountStatus: state.account?.entitlement_status ?? "none",
    creditEstimate: state.creditEstimate,
    errorCode: state.errorCode,
    onboarding: onboarding.status,
    // §15.10: la decisione si prende qui, non a un clic del merchant.
    reviewDue: reviewIsDue(
      {
        onboarding: onboarding.status,
        validationEnabled: state.validation?.enabled ?? false,
        errorCode: state.errorCode,
        enabledSince: await validationEnabledSince(db, session.shop),
      },
      Date.now(),
    ),
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const intent = (await request.formData()).get("intent");

  if (intent === "cancel") return cancelPlan(admin, db, session.shop);
  if (intent === "monthly" || intent === "annual" || intent === "one_time") {
    return subscribe(admin, db, session.shop, request, intent);
  }
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, errorCode: "generic" };
  }

  // Attivazione e disattivazione non toccano la configurazione: si riscrive quella osservata
  // cambiando solo lo stato della Validation (FR-052, FR-053).
  const result = await writeValidation(admin, db, session.shop, null, intent === "enable");

  if (!result.ok) return { ok: false, errorCode: result.errorCode };

  await recordEvent(db, {
    shopDomain: session.shop,
    name: result.enabled ? "validation_enabled" : "validation_disabled",
    class: "validation",
    metadata: { enabled: result.enabled, schema_version: 2 },
  });
  return { ok: true };
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
  try {
    const { shop } = await queryContext(admin);
    if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
      return { ok: false, errorCode: "country_not_eligible" };
    }

    const billing = await readBilling(admin, BILLING_IS_TEST);
    // Un pagamento unico copre lo store per sempre: nessun altro addebito va creato sopra.
    if (billing.oneTime) {
      return { ok: false, errorCode: "one_time_already_active" };
    }
    if (requestedRecurringPlanIsActive(billing, kind)) {
      return { ok: false, errorCode: "generic" };
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
  } catch {
    return { ok: false, errorCode: "charge_failed" };
  }
}

// FR-080: cancellazione ordinaria, nessuna proratazione, accesso fino a fine periodo pagato.
async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  try {
    const state = await readBilling(admin, BILLING_IS_TEST);
    if (!state.subscription) return { ok: false, errorCode: "no_subscription" };

    if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
      return { ok: false, errorCode: "cancel_failed" };
    }

    await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "cancel_failed" };
  }
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const esito = fetcher.data as { ok: boolean; errorCode?: string } | undefined;
  const submit = (intent: string) => fetcher.submit({ intent }, { method: "post" });

  // La modale è di Shopify, che decide da sé idoneità, frequenza e rifiuti: qui si sceglie solo
  // il momento, e non deve essere un'azione del merchant.
  useEffect(() => {
    if (!data.reviewDue || typeof shopify === "undefined") return;
    void shopify.reviews.request().catch(() => undefined);
  }, [data.reviewDue]);

  if (!data.eligible) {
    return (
      <s-page heading={t.home.heading}>
        <s-section heading={t.home.unsupported}>
          {/* A-16: unica eccezione approvata al divieto di colore di brand nell'app. Il colore
              vive dentro un'illustrazione, mai su un controllo o su uno stato, e solo su
              superfici senza azioni operative. */}
          <s-box maxInlineSize="180px">
            <s-image
              src="/cf-ready-lockup.svg"
              alt="CF Ready"
              aspectRatio="16/3"
              objectFit="contain"
            />
          </s-box>
          <s-paragraph>{t.home.unsupportedBody}</s-paragraph>
          <s-paragraph>
            {data.shopName} · {data.countryCode} → {ELIGIBLE_COUNTRY}
          </s-paragraph>
          <s-paragraph>{t.home.unsupportedCheckAddress}</s-paragraph>
          <s-paragraph>{t.home.unsupportedGuide}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-section>
      </s-page>
    );
  }

  const entitled = data.entitlement.kind !== "none";
  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);
  const busy = fetcher.state !== "idle";
  // §14.6: la data del primo addebito accanto alla scelta, non in un riepilogo.
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;
  const status = !data.validationEnabled ? "disabled" : entitled ? "active" : "lapsed";
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  // §15.3: il prossimo passo è l'elemento guidato della Home, quindi porta dove si compie.
  const nextStep = !entitled
    ? { text: t.home.nextChoosePlan, href: null }
    : !configured
      ? { text: t.home.nextConfigure, href: "/app/rules" }
      : !data.validationEnabled
        ? { text: t.home.nextActivate, href: null }
        : { text: t.home.nextTestOrder, href: null };

  return (
    <s-page heading={t.home.heading}>
      {/* §8.6: un solo banner in cima, e vince quello che blocca l'operatività. */}
      {data.errorCode ? (
        <s-banner tone="warning">
          {data.errorCode === "billing_read_failed" ? t.plan.lastAttempt : t.home.syncNeeded}
        </s-banner>
      ) : !entitled ? (
        <s-banner tone="warning">{t.home.noEntitlement}</s-banner>
      ) : notice ? (
        // FR-077: l'avviso di prova compare anche qui, che è la pagina che il merchant apre.
        <s-banner tone={notice.tone}>{notice.text}</s-banner>
      ) : null}
      {esito && !esito.ok ? (
        <s-banner tone="critical">
          {t.errors[esito.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      {/* D-063: la guida di configurazione apre la colonna principale finché serve, poi
          sparisce per sempre. `Prossimo passo` è indipendente e resta. */}
      {data.onboarding === "completed" ? null : (
        <SetupGuide data={data} busy={busy} submit={submit} />
      )}

      {/* §15.3: stato e configurazione corrente sono i primi due contenuti e stanno nello
          stesso riquadro. È il primo blocco che il merchant vede a ogni apertura: deve dire
          cosa succede, su cosa, e cosa può farci, senza costringerlo a scorrere. */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-badge
            tone={status === "active" ? "success" : status === "lapsed" ? "warning" : "neutral"}
          >
            {data.validationEnabled ? t.home.badgeActive : t.home.badgeInactive}
          </s-badge>
          <s-heading>
            {status === "active"
              ? t.home.titleActive
              : status === "lapsed"
                ? t.home.titleLapsed
                : t.home.titleDisabled}
          </s-heading>
          {/* Il titolo dichiara lo stato, la riga sotto dice cosa vive un cliente. */}
          <s-paragraph>
            {summariseCheckout({ rules: data.rules, status: "active" }, data.locale)[0]}
          </s-paragraph>

          <s-divider />

          {/* Dati, non prosa: etichetta a sinistra, stato a destra. */}
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.taxCodeLabel}</s-text>
              <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.pecLabel}</s-text>
              <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.home.messagesLabel}</s-text>
              <s-badge>
                {data.messagesDefault ? t.home.messagesDefault : t.home.messagesCustom}
              </s-badge>
            </s-stack>
          </s-stack>

          <s-stack direction="inline" gap="base">
            <s-button href="/app/rules" variant="primary">
              {t.home.editRules}
            </s-button>
            {data.validationEnabled ? (
              <s-button commandFor="deactivate" command="--show">
                {t.home.deactivate}
              </s-button>
            ) : (
              <s-button
                disabled={!entitled || fetcher.state !== "idle"}
                onClick={() => submit("enable")}
              >
                {t.home.activate}
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      {/* §15.6 vive qui: la pagina dedicata è stata assorbita e la navigazione è passata a
          quattro voci. Stato e scelta stanno in due blocchi diversi perché fanno due lavori
          diversi: qui si decide, nella colonna laterale si legge come si sta messi. Con un
          pagamento unico attivo il blocco resta e spiega perché non c'è nulla da scegliere. */}
      <PlanChoice data={data} busy={busy} submit={submit} firstCharge={firstCharge} />

      {/* D-067: le eccezioni automatiche restano visibili anche in Home. */}
      <s-section heading={t.home.howHeading}>
        <s-unordered-list>
          {t.rules.exceptions.map((line) => (
            <s-list-item key={line}>{line}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <PlanStatus data={data} />

      <s-section slot="aside" heading={t.home.nextHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{nextStep.text}</s-paragraph>
          {nextStep.href ? <s-link href={nextStep.href}>{t.nav.rules}</s-link> : null}
          {data.address2Declared ? (
            <>
              <s-paragraph>{t.home.nextAddress2}</s-paragraph>
              <s-link href="/app/rules">{t.nav.rules}</s-link>
            </>
          ) : null}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-stack>
      </s-section>

      {/* A-16, estesa alla Home: il marchio chiude la colonna di riferimento come una firma,
          senza cornice e senza competere con i blocchi operativi. */}
      <s-stack
        slot="aside"
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="center"
      >
        <s-box maxInlineSize="130px">
          <s-image src="/cf-ready-lockup.svg" alt="" aspectRatio="16/3" objectFit="contain" />
        </s-box>
      </s-stack>

      <s-app-window id="onboarding-window" src="/app/onboarding" />

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

type HomeData = Awaited<ReturnType<typeof loader>>;

// Lo stato commerciale è informazione: sta nella colonna laterale e non ha bottoni.
function PlanStatus({ data }: { data: HomeData }) {
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";

  return (
    <s-section slot="aside" heading={t.plan.heading}>
      <s-stack direction="block" gap="small-100">
        <s-paragraph>
          {data.entitlement.kind === "trial"
            ? t.plan.trial(formatDate(data.trialEndsAt, data.locale))
            : onOneTime
              ? t.plan.oneTime
              : data.entitlement.kind === "subscription"
                ? t.plan.subscription(formatDate(data.entitlement.validThrough, data.locale))
                : data.trialStatus === "expired"
                  ? t.plan.trialOver
                  : t.plan.none}
        </s-paragraph>
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
  );
}

// La scelta è una decisione: sta nella colonna principale, con le sue azioni.
function PlanChoice({
  data,
  busy,
  submit,
  firstCharge,
}: {
  data: HomeData;
  busy: boolean;
  submit: (intent: string) => void;
  firstCharge: string;
}) {
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";

  return (
    <s-section heading={onOneTime ? t.plan.oneTimeName : t.plan.chooseHeading}>
      {onOneTime || !data.plan ? (
        <s-paragraph>{onOneTime ? t.plan.oneTimeSettled : t.plan.none}</s-paragraph>
      ) : (
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.monthlyName}</s-text>
              <s-text>{formatMoney(data.plan.monthly, data.locale)}</s-text>
            </s-stack>
            <s-paragraph>{firstCharge}</s-paragraph>
            {data.planKind === "monthly" ? null : (
              <s-stack direction="inline" gap="base">
                <s-button disabled={busy} onClick={() => submit("monthly")}>
                  {data.planKind === "annual" ? t.plan.monthlySwitch : t.plan.monthlyStart}
                </s-button>
              </s-stack>
            )}
          </s-stack>

          <s-divider />

          <s-stack direction="block" gap="small-100">
            {/* D-070: `Consigliato`, senza percentuali di risparmio. */}
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.annualName}</s-text>
              <s-text>{formatMoney(data.plan.annual, data.locale)}</s-text>
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

          <s-divider />

          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.oneTimeName}</s-text>
              <s-text>{formatMoney(data.plan.one_time, data.locale)}</s-text>
            </s-stack>
            <s-paragraph>{t.plan.oneTimeCharge}</s-paragraph>
            {/* FR-081: prezzo, credito e costo netto prima di creare l'acquisto. */}
            {data.entitlement.kind === "subscription" && data.creditEstimate ? (
              <>
                <s-paragraph>
                  {t.plan.netCost(
                    formatMoney(Math.max(0, data.plan.one_time - data.creditEstimate), data.locale),
                  )}
                </s-paragraph>
                <s-paragraph>
                  {t.plan.creditEstimate(formatMoney(data.creditEstimate, data.locale))}
                </s-paragraph>
              </>
            ) : null}
            <s-stack direction="inline" gap="base">
              <s-button disabled={busy} onClick={() => submit("one_time")}>
                {t.plan.oneTimeSwitch}
              </s-button>
            </s-stack>
          </s-stack>

          {data.entitlement.kind === "subscription" ? (
            <>
              <s-divider />
              <s-stack direction="block" gap="small-100">
                <s-paragraph>
                  {data.accountStatus === "ending" ? t.plan.endingAlready : t.plan.cancelBody}
                </s-paragraph>
                {data.accountStatus === "ending" ? null : (
                  <s-stack direction="inline" gap="base">
                    <s-button disabled={busy} onClick={() => submit("cancel")}>
                      {t.plan.cancelRenewal}
                    </s-button>
                  </s-stack>
                )}
              </s-stack>
            </>
          ) : null}
        </s-stack>
      )}
    </s-section>
  );
}

// Composizione `Setup guide` di Polaris: passi con stato reale, spunta di completamento e
// contatore. I passi hanno un completamento oggettivo — «fai un ordine di prova» resterebbe
// fuori, perché CF Ready non legge gli ordini e non è nel suo perimetro.
function SetupGuide({
  data,
  busy,
  submit,
}: {
  data: HomeData;
  busy: boolean;
  submit: (intent: string) => void;
}) {
  const t = texts(data.locale);
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  const steps = [
    {
      done: configured,
      title: t.setup.rulesTitle,
      body: t.setup.rulesBody,
      action: <s-link href="/app/rules">{t.nav.rules}</s-link>,
    },
    {
      done: data.validationEnabled,
      title: t.setup.activateTitle,
      body: t.setup.activateBody,
      action:
        data.validationEnabled || !configured ? null : (
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={busy || data.entitlement.kind === "none"}
              onClick={() => submit("enable")}
            >
              {t.home.activate}
            </s-button>
          </s-stack>
        ),
    },
    {
      done: data.planKind !== "none",
      title: t.setup.planTitle,
      body: t.setup.planBody,
      action: null,
    },
    // FR-058: compare solo se la dichiarazione è attiva, e sparisce quando viene revocata.
    ...(data.address2Declared
      ? [
          {
            done: false,
            title: t.setup.address2Title,
            body: t.home.nextAddress2,
            action: <s-link href="/app/rules">{t.nav.rules}</s-link>,
          },
        ]
      : []),
  ];
  const done = steps.filter((step) => step.done).length;

  // Solo il primo passo ancora da fare è aperto: i passi conclusi si riducono a una riga, che
  // è ciò che serve sapere di loro. Nessuna cornice per passo — erano riquadri dentro un
  // riquadro, alti e con il fianco vuoto.
  const active = steps.findIndex((step) => !step.done);

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-100">
          <s-heading>{t.setup.heading}</s-heading>
          <s-text color="subdued">{t.setup.progress(done, steps.length)}</s-text>
        </s-stack>

        {/* I passi stanno in riga: incolonnati lasciavano vuota tutta la larghezza della card.
            La spiegazione del passo in corso sta sotto, così una colonna più alta non deforma
            le altre. */}
        <s-grid gridTemplateColumns={steps.map(() => "1fr").join(" ")} gap="base">
          {steps.map((step, index) => (
            <s-stack key={step.title} direction="inline" gap="small-100" alignItems="center">
              {/* La spunta è un token semantico: dice fatto o da fare, non decora. */}
              <s-icon type="check-circle" tone={step.done ? "success" : "auto"} />
              <s-text
                type={index === active ? "strong" : undefined}
                color={step.done ? "subdued" : "base"}
              >
                {step.title}
              </s-text>
            </s-stack>
          ))}
        </s-grid>

        {active >= 0 ? (
          <s-stack direction="block" gap="small-100">
            <s-paragraph>{steps[active].body}</s-paragraph>
            {steps[active].action}
          </s-stack>
        ) : null}

        <s-stack direction="inline" gap="base">
          <s-button commandFor="onboarding-window" command="--show" variant="primary">
            {t.setup.guided}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
