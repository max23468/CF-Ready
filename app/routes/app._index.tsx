import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { remainingTrialDays } from "../billing.server";
import { ELIGIBLE_COUNTRY, readConfig } from "../config";
import { recordEvent } from "../events.server";
import { resolveLocale, summariseCheckout, texts, trialNotice } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";
import {
  findValidation,
  queryContext,
  readAddress2Declaration,
  reconcile,
  writeValidation,
} from "../validation.server";

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
    trialEndsAt: state.trial?.ends_at ?? null,
    remaining: remainingTrialDays(state.trial, state.today),
    entitlement: state.entitlement,
    errorCode: state.errorCode,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const intent = (await request.formData()).get("intent");

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

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const t = texts(data.locale);
  const esito = fetcher.data as { ok: boolean; errorCode?: string } | undefined;
  const submit = (intent: string) => fetcher.submit({ intent }, { method: "post" });

  if (!data.eligible) {
    return (
      <s-page heading={t.home.heading}>
        <s-section heading={t.home.unsupported}>
          {/* A-16: unica eccezione approvata al divieto di colore di brand nell'app. Il colore
              vive dentro un'illustrazione, mai su un controllo o su uno stato, e solo su
              superfici senza azioni operative. */}
          <s-box maxInlineSize="180px">
            <s-image src="/cf-ready-lockup.svg" alt="CF Ready" />
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
      ) : notice ? (
        // FR-077: l'avviso di prova compare anche qui, che è la pagina che il merchant apre.
        <s-banner tone={notice.tone}>{notice.text}</s-banner>
      ) : null}
      {esito && !esito.ok ? (
        <s-banner tone="critical">
          {t.errors[esito.errorCode as keyof typeof t.errors] ?? t.errors.generic}
        </s-banner>
      ) : null}

      {/* La distanza fra i blocchi è dichiarata qui invece di essere lasciata alle regole
          implicite della pagina: così è identica fra tutte le sezioni, comprese quelle che
          compaiono e spariscono. */}
      {/* Nessuno stack attorno alle sezioni: la spaziatura la dà `s-page`, che è la sola
          costruzione identica fra colonna principale e colonna laterale. */}
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

          {/* Due dati, non prosa: etichetta a sinistra, modalità a destra. */}
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.taxCodeLabel}</s-text>
              <s-badge>{t.rules.taxCode[data.rules.taxCode]}</s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text>{t.rules.pecLabel}</s-text>
              <s-badge>{t.rules.pec[data.rules.pec]}</s-badge>
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
              <s-button disabled={fetcher.state !== "idle"} onClick={() => submit("enable")}>
                {t.home.activate}
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      {/* D-067: le eccezioni automatiche restano visibili anche in Home. */}
      <s-section heading={t.home.howHeading}>
        <s-unordered-list>
          {t.rules.exceptions.map((line) => (
            <s-list-item key={line}>{line}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading={t.home.nextHeading}>
        <s-paragraph>{nextStep}</s-paragraph>
        {data.address2Declared ? <s-paragraph>{t.home.nextAddress2}</s-paragraph> : null}
      </s-section>

      <s-section slot="aside" heading={t.home.helpHeading}>
        <s-stack direction="block" gap="small-100">
          <s-paragraph>{t.home.helpBody}</s-paragraph>
          <s-link href="/app/guide">{t.nav.guide}</s-link>
        </s-stack>
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
          onClick={() => submit("disable")}
        >
          {t.home.deactivate}
        </s-button>
      </s-modal>
    </s-page>
  );
}
