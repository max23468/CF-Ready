import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
  addDays,
  cancelSubscription,
  createCharge,
  currentPricingGeneration,
  localDate,
  readBilling,
  readBillingAccount,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  startTrial,
  syncBillingAccount,
  syncTrial,
} from "../billing.server";
import {
  ELIGIBLE_COUNTRY,
  messagesAreDefault,
  pendingFetcherIntent,
  pendingFetcherSource,
  readConfig,
  reviewIsDue,
} from "../config";
import { databaseContext } from "../context.server";
import { APP_VERSION, BILLING_IS_TEST } from "../env.server";
import { recordEvent } from "../events.server";
import {
  formatDate,
  formatMoney,
  homeCheckoutSummary,
  supportMailto,
  resolveLocale,
  texts,
  trialNotice,
  validationStatus,
} from "../i18n";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import { openBillingApproval, skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  queryContext,
  readAddress2Declaration,
  readOnboarding,
  reconcile,
  validationEnabledSince,
  withValidationLock,
  writeValidation,
} from "../validation.server";
import type { Admin } from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  // §11.6: la Home riconcilia a ogni apertura. Lo stato locale non viene mai presentato come
  // certo senza aver riletto Shopify.
  const state = await reconcile(admin, db, session.shop);
  const config = readConfig(state.validation?.metafield?.jsonValue);
  const onboarding = await readOnboarding(db, session.shop);

  return {
    locale: resolveLocale(request),
    shopName: state.shopName,
    shopDomain: session.shop,
    version: APP_VERSION,
    countryCode: state.countryCode,
    eligible: state.eligible,
    validationEnabled: state.validationEnabled,
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
    plan: planPrices(currentPricingGeneration(state.trial, state.account, state.today)),
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
        validationEnabled: state.validationEnabled,
        errorCode: state.errorCode,
        enabledSince: await validationEnabledSince(db, session.shop),
      },
      Date.now(),
    ),
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const intent = (await request.formData()).get("intent");

  if (intent === "repair") {
    try {
      const state = await reconcile(admin, db, session.shop);
      return state.errorCode ? { ok: false, errorCode: state.errorCode } : { ok: true };
    } catch {
      return { ok: false, errorCode: "validation_write_failed" };
    }
  }
  // La prova parte solo da qui: è il merchant a decidere quando cominciare a consumarla.
  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    const trial = await startTrial(db, session.shop, {
      eligible: shop.shopAddress.countryCodeV2 === "IT",
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false, errorCode: "store_not_supported" };
    return { ok: true };
  }
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
    const mutation = await withValidationLock(db, shopDomain, async () => {
      const { shop } = await queryContext(admin);
      if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
        return { ok: false, errorCode: "country_not_eligible" };
      }

      const billing = await readBilling(admin, BILLING_IS_TEST);
      // Un pagamento unico copre lo store per sempre: nessun altro addebito va creato sopra.
      if (billing.oneTime) {
        return { ok: false, errorCode: "one_time_already_active" };
      }
      if (kind === "one_time" && billing.pendingOneTime) {
        return { ok: false, errorCode: "charge_pending" };
      }
      if (requestedRecurringPlanIsActive(billing, kind)) {
        return { ok: false, errorCode: "generic" };
      }

      const today = localDate(shop.ianaTimezone);
      const [trial, storedAccount] = await Promise.all([
        syncTrial(db, shopDomain, { today }),
        readBillingAccount(db, shopDomain),
      ]);
      let account = storedAccount;
      account = await syncBillingAccount(db, shopDomain, billing, {
        today,
        timeZone: shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, account, today),
      });
      const plan = planFor(currentPricingGeneration(trial, account, today), kind);
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
    });

    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: "charge_failed" };
  }
}

// FR-080: cancellazione ordinaria, nessuna proratazione, accesso fino a fine periodo pagato.
async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  try {
    const mutation = await withValidationLock(db, shopDomain, async () => {
      const state = await readBilling(admin, BILLING_IS_TEST);
      if (state.oneTime) return { ok: false, errorCode: "one_time_already_active" };
      if (state.pendingOneTime) return { ok: false, errorCode: "charge_pending" };
      if (!state.subscription) return { ok: false, errorCode: "no_subscription" };

      if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
        return { ok: false, errorCode: "cancel_failed" };
      }

      await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
      return { ok: true };
    });
    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: "cancel_failed" };
  }
}

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const esito = fetcher.data as
    | { ok: boolean; errorCode?: string; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = esito?.confirmationUrl;
  const submit = (intent: string, source?: string) =>
    fetcher.submit(source ? { intent, source } : { intent }, { method: "post" });

  // La modale è di Shopify, che decide da sé idoneità, frequenza e rifiuti: qui si sceglie solo
  // il momento, e non deve essere un'azione del merchant.
  useEffect(() => {
    if (!data.reviewDue || typeof shopify === "undefined") return;
    void shopify.reviews.request().catch(() => undefined);
  }, [data.reviewDue]);

  useEffect(() => {
    openBillingApproval(confirmationUrl);
  }, [confirmationUrl]);

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
          {/* FR-003 e D-043: l'assistenza resta raggiungibile anche da uno store non idoneo,
              che è proprio il caso in cui il merchant ha bisogno di un chiarimento. */}
          <s-paragraph>{t.support.chooseCategory}</s-paragraph>
          {Object.entries(t.support.categories).map(([category, label]) => (
            <s-link
              key={category}
              href={supportMailto(
                {
                  shopDomain: data.shopDomain,
                  version: data.version,
                  countryCode: data.countryCode,
                },
                data.locale,
                category as keyof typeof t.support.categories,
              )}
            >
              {label}
            </s-link>
          ))}
        </s-section>
      </s-page>
    );
  }

  const entitled = data.entitlement.kind !== "none";
  const notice = trialNotice({ remaining: data.remaining, endsAt: data.trialEndsAt }, data.locale);
  const busy = fetcher.state !== "idle";
  const pendingIntent = pendingFetcherIntent(fetcher.formData);
  const pendingSource = pendingFetcherSource(fetcher.formData);
  // §14.6: la data del primo addebito accanto alla scelta, non in un riepilogo.
  const firstCharge = data.firstChargeAt
    ? t.plan.firstCharge(formatDate(data.firstChargeAt, data.locale))
    : t.plan.firstChargeNow;
  const status = validationStatus(data.validationEnabled, entitled);
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
          <s-stack direction="block" gap="small-100">
            <s-paragraph>
              {data.errorCode === "billing_read_failed"
                ? t.plan.lastAttempt
                : data.errorCode === "duplicate_validations" ||
                    data.errorCode === "duplicate_validations_active"
                  ? t.errors[data.errorCode]
                  : t.home.syncNeeded}
            </s-paragraph>
            <s-button
              disabled={busy}
              loading={pendingIntent === "repair"}
              onClick={() => submit("repair")}
            >
              {t.home.repair}
            </s-button>
          </s-stack>
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
        <SetupGuide
          data={data}
          busy={busy}
          pendingIntent={pendingIntent}
          pendingSource={pendingSource}
          submit={submit}
        />
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
            {homeCheckoutSummary({ rules: data.rules, status }, data.locale)}
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
                loading={pendingIntent === "enable" && pendingSource === "status"}
                onClick={() => submit("enable", "status")}
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
      <PlanChoice
        data={data}
        busy={busy}
        pendingIntent={pendingIntent}
        submit={submit}
        firstCharge={firstCharge}
      />

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
      <s-modal
        id="deactivate"
        heading={t.home.deactivate}
        accessibilityLabel={t.home.deactivateConfirm}
      >
        <s-paragraph>{t.home.deactivateConfirm}</s-paragraph>
        <s-button slot="secondary-actions" commandFor="deactivate" command="--hide">
          {t.common.cancel}
        </s-button>
        {/* §7.7: nella conferma il bottone ripete l'azione, non dice “OK”. */}
        <s-button
          slot="primary-action"
          variant="primary"
          loading={pendingIntent === "disable"}
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
export function PlanChoice({
  data,
  busy,
  pendingIntent,
  submit,
  firstCharge,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  submit: (intent: string) => void;
  firstCharge: string;
}) {
  const t = texts(data.locale);
  const onOneTime = data.entitlement.kind === "one_time";

  // La prova non è mai partita: la prima decisione è se cominciarla o pagare subito.
  const trialNeverStarted = data.trialStatus === null && data.entitlement.kind === "none";

  const startTrialSection = trialNeverStarted ? (
    <s-section heading={t.plan.notStartedHeading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.plan.notStartedBody}</s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            disabled={busy || !data.eligible}
            loading={pendingIntent === "start_trial"}
            onClick={() => submit("start_trial")}
          >
            {t.plan.startTrial}
          </s-button>
        </s-stack>
        <s-paragraph>{t.plan.orChoose}</s-paragraph>
      </s-stack>
    </s-section>
  ) : null;

  const choice = (
    <s-section heading={onOneTime ? t.plan.oneTimeName : t.plan.chooseHeading}>
      {onOneTime || !data.plan ? (
        <s-paragraph>{onOneTime ? t.plan.oneTimeSettled : t.plan.none}</s-paragraph>
      ) : (
        <s-stack direction="block" gap="base">
          <s-paragraph>{t.plan.chooseBody}</s-paragraph>
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text type="strong">{t.plan.monthlyName}</s-text>
              <s-text>{formatMoney(data.plan.monthly, data.locale)}</s-text>
            </s-stack>
            <s-paragraph>{firstCharge}</s-paragraph>
            {data.planKind === "monthly" ? null : (
              <s-stack direction="inline" gap="base">
                <s-button
                  disabled={busy}
                  loading={pendingIntent === "monthly"}
                  onClick={() => submit("monthly")}
                >
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
                <s-button
                  variant="primary"
                  disabled={busy}
                  loading={pendingIntent === "annual"}
                  onClick={() => submit("annual")}
                >
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
              <s-button
                disabled={busy}
                loading={pendingIntent === "one_time"}
                onClick={() => submit("one_time")}
              >
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
                    <s-button
                      disabled={busy}
                      loading={pendingIntent === "cancel"}
                      commandFor="cancel-renewal"
                      command="--show"
                    >
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

  return (
    <>
      {startTrialSection}
      {choice}
      <s-modal
        id="cancel-renewal"
        heading={t.plan.cancelRenewal}
        accessibilityLabel={t.plan.cancelBody}
      >
        <s-paragraph>{t.plan.cancelBody}</s-paragraph>
        <s-button slot="secondary-actions" commandFor="cancel-renewal" command="--hide">
          {t.common.cancel}
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          loading={pendingIntent === "cancel"}
          commandFor="cancel-renewal"
          command="--hide"
          onClick={() => submit("cancel")}
        >
          {t.plan.cancelRenewal}
        </s-button>
      </s-modal>
    </>
  );
}

// Composizione `Setup guide` di Polaris: passi con stato reale, spunta di completamento e
// contatore. I passi hanno un completamento oggettivo — «fai un ordine di prova» resterebbe
// fuori, perché CF Ready non legge gli ordini e non è nel suo perimetro.
export function SetupGuide({
  data,
  busy,
  pendingIntent,
  pendingSource,
  submit,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  pendingSource: string | null;
  submit: (intent: string, source?: string) => void;
}) {
  const t = texts(data.locale);
  const configured = data.rules.taxCode !== "unmanaged" || data.rules.pec !== "unmanaged";
  // Un'icona per passo, non solo sui completati: senza, i passi da fare erano testo nudo
  // e la scheda si leggeva come un elenco puntato senza punti.
  const steps = [
    {
      done: configured,
      icon: "forms" as const,
      title: t.setup.rulesTitle,
      body: t.setup.rulesBody,
      action: <s-link href="/app/rules">{t.nav.rules}</s-link>,
    },
    {
      // Prima dell'attivazione, non dopo: senza un diritto valido «Attiva nel checkout»
      // resta disabilitato, e chi seguisse l'ordine si fermerebbe su un passo che non
      // può completare.
      done: data.entitlement.kind !== "none",
      icon: "credit-card" as const,
      title: t.setup.planTitle,
      body: data.trialStatus === null ? t.setup.planBody : t.setup.planBodyEntitled,
      action:
        data.trialStatus === null && data.entitlement.kind === "none" ? (
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={busy || !data.eligible}
              loading={pendingIntent === "start_trial"}
              onClick={() => submit("start_trial", "setup")}
            >
              {t.setup.startTrial}
            </s-button>
          </s-stack>
        ) : null,
    },
    {
      done: data.validationEnabled,
      icon: "toggle-on" as const,
      title: t.setup.activateTitle,
      body: t.setup.activateBody,
      action:
        data.validationEnabled || !configured ? null : (
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={busy || data.entitlement.kind === "none"}
              loading={pendingIntent === "enable" && pendingSource === "setup"}
              onClick={() => submit("enable", "setup")}
            >
              {t.home.activate}
            </s-button>
          </s-stack>
        ),
    },
    // FR-058: compare solo se la dichiarazione è attiva, e sparisce quando viene revocata.
    ...(data.address2Declared
      ? [
          {
            done: false,
            icon: "location" as const,
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
          {/* Il contatore sta accanto al titolo come badge: era una riga grigia sotto, e
              di un progresso interessa vederlo, non leggerlo. */}
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-heading>{t.setup.heading}</s-heading>
            <s-badge tone={done === steps.length ? "success" : "info"}>
              {t.setup.progress(done, steps.length)}
            </s-badge>
          </s-stack>
          {/* Il benvenuto vale solo la prima volta: a chi è già a metà strada
              interessa il contatore, non la presentazione. */}
          {done === 0 ? <s-paragraph>{t.setup.welcome}</s-paragraph> : null}
        </s-stack>

        {/* I passi stanno in riga: incolonnati lasciavano vuota tutta la larghezza della card.
            La spiegazione del passo in corso sta sotto, così una colonna più alta non deforma
            le altre. */}
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(12rem, 1fr))" gap="base">
          {steps.map((step, index) => (
            <s-stack key={step.title} direction="inline" gap="small-100" alignItems="center">
              {step.done ? (
                <s-icon type="check-circle" tone="success" />
              ) : (
                <s-icon type={step.icon} color={index === active ? "base" : "subdued"} />
              )}
              <s-text
                type={index === active ? "strong" : undefined}
                color={step.done ? "subdued" : "base"}
              >
                {step.title}
              </s-text>
            </s-stack>
          ))}
        </s-grid>

        {/* Il passo in corso dentro un riquadro suo: distingue ciò che c'è da fare adesso dal
            resto della scheda. Resta l'unico riquadro — uno per passo erano cornici dentro una
            cornice, alte e con il fianco vuoto. */}
        {active >= 0 ? (
          <s-box background="subdued" borderRadius="base" padding="base">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-icon type={steps[active].icon} color="base" />
                <s-text type="strong">{steps[active].title}</s-text>
              </s-stack>
              <s-paragraph>{steps[active].body}</s-paragraph>
              {steps[active].action}
            </s-stack>
          </s-box>
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
