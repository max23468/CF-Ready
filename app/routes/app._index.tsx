import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  cancelSubscription,
  createCharge,
  entitlementFor,
  returnUrlFor,
  localDate,
  readBilling,
  remainingTrialDays,
  syncTrial,
} from "../billing.server";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import type { Entitlement } from "../billing.server";
import { recordEvent } from "../events.server";
import { BILLING_IS_TEST } from "../env.server";
import { authenticate } from "../shopify.server";
import {
  acquireValidationLock,
  configWithEntitlement,
  CREATE_VALIDATION,
  DEFAULT_CONFIG,
  ELIGIBLE_COUNTRY,
  METAFIELD_KEY,
  METAFIELD_NAMESPACE,
  findValidation,
  FUNCTION_HANDLE,
  mutationError,
  persistValidationState,
  queryContext,
  reconcile,
  releaseValidationLockBestEffort,
  startValidationLockHeartbeat,
  UPDATE_VALIDATION,
  VALIDATION_TITLE,
} from "../validation.server";
import type { Admin, MutationResult } from "../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const state = await reconcile(admin, context.cloudflare.env.DB, session.shop);

  return {
    shopName: state.shopName,
    countryCode: state.countryCode,
    eligible: state.eligible,
    validationEnabled: state.validation?.enabled ?? false,
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
    return { ok: false, error: "Azione non valida." };
  }

  const lockToken = await acquireValidationLock(db, session.shop);
  if (!lockToken) {
    return { ok: false, error: "Un’altra operazione sulla Validation è già in corso." };
  }
  const heartbeat = startValidationLockHeartbeat(db, session.shop, lockToken);

  try {
    const data = await queryContext(admin);
    const countryCode = data.shop.shopAddress.countryCodeV2;
    const eligible = countryCode === ELIGIBLE_COUNTRY;
    const enable = intent === "enable";
    if (enable && !eligible) {
      return {
        ok: false,
        error: "CF Ready è disponibile solo per store con indirizzo in Italia.",
      };
    }

    const existing = findValidation(data.validations.nodes);
    const today = localDate(data.shop.ianaTimezone);
    const entitlement = entitlementFor(
      await syncTrial(db, session.shop, { eligible, today }),
      today,
    );
    const metafields = [
      {
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: "json",
        // `enabled` nella configurazione è la volontà operativa del merchant e la Function
        // la richiede vera: va allineata all'intento, non lasciata al valore precedente.
        value: JSON.stringify({
          ...configWithEntitlement(existing?.metafield?.jsonValue, entitlement),
          enabled: enable,
        }),
      },
    ];
    const variables = existing
      ? {
          id: existing.id,
          validation: { title: VALIDATION_TITLE, enable, blockOnFailure: false, metafields },
        }
      : {
          validation: {
            title: VALIDATION_TITLE,
            functionHandle: FUNCTION_HANDLE,
            enable,
            blockOnFailure: false,
            metafields,
          },
        };
    if (!(await heartbeat.isHeld())) {
      return { ok: false, error: "Il coordinamento della Validation non è più valido." };
    }
    const response = await admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
      variables,
    });
    const result = (await response.json()) as MutationResult;
    const operation = existing ? "validationUpdate" : "validationCreate";
    const error = mutationError(result, operation);
    if (error) {
      await persistValidationState(db, session.shop, {
        countryCode,
        eligible,
        validation: existing,
        errorCode: "validation_write_failed",
      });
      return { ok: false, error };
    }

    const readback = findValidation((await queryContext(admin)).validations.nodes);
    const consistent = Boolean(
      readback && readback.enabled === enable && readback.blockOnFailure === false,
    );
    await persistValidationState(db, session.shop, {
      countryCode,
      eligible,
      validation: readback,
      errorCode: consistent ? null : "validation_readback_failed",
    });
    if (!consistent) {
      return { ok: false, error: "Readback Shopify non riuscito." };
    }

    await recordEvent(db, {
      shopDomain: session.shop,
      name: enable ? "validation_enabled" : "validation_disabled",
      class: "validation",
      metadata: { enabled: enable, schema_version: DEFAULT_CONFIG.schemaVersion },
    });
    return { ok: true };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, session.shop, lockToken);
  }
};

const euro = (amount: number) => amount.toFixed(2).replace(".", ",");

function planSummary({
  entitlement,
  trialStatus,
  trialEndsAt,
}: {
  entitlement: Entitlement;
  trialStatus: string | null;
  trialEndsAt: string | null;
}) {
  if (entitlement.kind === "trial") return `Prova attiva fino al ${trialEndsAt}.`;
  if (entitlement.kind === "one_time") return "Pagamento unico attivo, senza rinnovi.";
  if (entitlement.kind === "subscription") {
    return `Abbonamento attivo fino al ${entitlement.validThrough}.`;
  }
  return trialStatus === "expired"
    ? "Prova terminata: scegli una modalità per riattivare le regole."
    : "Nessun piano attivo.";
}

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
    return { ok: false, error: "CF Ready è disponibile solo per store con indirizzo in Italia." };
  }

  // Un pagamento unico copre lo store per sempre: nessun altro addebito va creato sopra,
  // né un secondo acquisto né un abbonamento.
  if ((await readBilling(admin, BILLING_IS_TEST)).oneTime) {
    return {
      ok: false,
      error:
        kind === "one_time"
          ? "Il pagamento unico per questo store risulta già attivo."
          : "Questo store ha già il pagamento unico: un abbonamento aggiungerebbe un addebito.",
    };
  }

  const today = localDate(shop.ianaTimezone);
  const trial = await syncTrial(db, shopDomain, { eligible: true, today });
  const plan = planFor(trial?.pricing_generation ?? "launch", kind);
  if (!plan) {
    return { ok: false, error: "Piano non disponibile per questo store." };
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
    return { ok: false, error: "Non è stato possibile avviare il pagamento. Riprova fra poco." };
  }

  return { ok: true, confirmationUrl };
}

// Cancellazione ordinaria: nessuna proratazione, l'accesso resta fino a fine periodo pagato.
async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  const state = await readBilling(admin, BILLING_IS_TEST);
  if (!state.subscription) {
    return { ok: false, error: "Non risulta alcuna sottoscrizione attiva da cancellare." };
  }

  // Cancellazione ordinaria: nessuna proratazione, l'accesso resta fino a fine periodo.
  const error = await cancelSubscription(admin, state.subscription.id, { prorate: false });
  if (error) {
    return { ok: false, error: "Cancellazione non riuscita. Riprova fra poco." };
  }

  await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
  return { ok: true };
}

// Con un URL di conferma la pagina sta per essere sostituita da Shopify: rivalidare
// significa solo lanciare richieste che verranno interrotte a metà.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) => (actionResult && "confirmationUrl" in actionResult ? false : defaultShouldRevalidate);

export default function Home() {
  const {
    shopName,
    countryCode,
    eligible,
    validationEnabled,
    trialStatus,
    trialEndsAt,
    entitlement,
    plan,
    creditEstimate,
    errorCode,
    planKind,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  // L'azione restituisce forme diverse a seconda dell'intento: qui interessa solo l'URL.
  const esito = fetcher.data as
    | { ok: boolean; error?: string; confirmationUrl?: string }
    | undefined;
  const confirmationUrl = esito?.confirmationUrl;

  // L'approvazione di un addebito vive fuori dall'iframe: va aperta a livello superiore,
  // altrimenti Shopify rifiuta di caricarla.
  useEffect(() => {
    if (confirmationUrl) open(confirmationUrl, "_top");
  }, [confirmationUrl]);

  return (
    <s-page heading="CF Ready">
      <s-section heading="Validation">
        <s-paragraph>
          {shopName} ({countryCode}) · Validation {validationEnabled ? "attiva" : "disattivata"}.
        </s-paragraph>
        {eligible ? null : (
          <s-banner tone="warning">
            CF Ready è disponibile solo per store con indirizzo in Italia. La Validation resta
            disattivata e il checkout non viene bloccato.
          </s-banner>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value={validationEnabled ? "disable" : "enable"} />
          <s-button
            variant={validationEnabled ? "secondary" : "primary"}
            type="submit"
            disabled={fetcher.state !== "idle" || (!eligible && !validationEnabled)}
          >
            {validationEnabled ? "Disattiva nel checkout" : "Attiva nel checkout"}
          </s-button>
        </fetcher.Form>
        {esito && !esito.ok ? <s-banner tone="critical">{esito.error}</s-banner> : null}
      </s-section>
      {eligible ? (
        <s-section heading="Piano">
          <s-paragraph>{planSummary({ entitlement, trialStatus, trialEndsAt })}</s-paragraph>
          {entitlement.kind === "none" ? (
            <s-banner tone="warning">
              Senza un piano attivo il checkout non viene bloccato. Regole e messaggi restano
              salvati e tornano attivi con il pagamento.
            </s-banner>
          ) : null}
          {plan ? (
            <s-paragraph>
              Prezzo {plan.generation === "launch" ? "di lancio" : "standard"}: {euro(plan.monthly)}{" "}
              € ogni 30 giorni oppure {euro(plan.annual)} € all’anno.
            </s-paragraph>
          ) : null}
          {errorCode ? (
            <s-banner tone="warning">
              Alcune informazioni sul piano non sono aggiornate ({errorCode}). Il checkout non viene
              bloccato: riapri la pagina fra qualche minuto o scrivici se il problema resta.
            </s-banner>
          ) : null}
          {/* Il piano già attivo non si ripropone: premerlo creerebbe un addebito che
              sostituisce sé stesso, un'azione senza alcun effetto utile. */}
          {entitlement.kind === "one_time" || planKind === "monthly" ? null : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="subscribe_monthly" />
              <s-button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
                {planKind === "annual" ? "Passa al mensile" : "Attiva il mensile"}
              </s-button>
            </fetcher.Form>
          )}
          {entitlement.kind === "one_time" || planKind === "annual" ? null : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="subscribe_annual" />
              <s-button type="submit" disabled={fetcher.state !== "idle"}>
                {planKind === "monthly" ? "Passa all’annuale" : "Attiva l’annuale"}
              </s-button>
            </fetcher.Form>
          )}
          {entitlement.kind === "one_time" ? null : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="buy_one_time" />
              <s-button type="submit" disabled={fetcher.state !== "idle"}>
                {plan ? `Un solo pagamento: ${euro(plan.one_time)} €` : "Passa a un solo pagamento"}
              </s-button>
            </fetcher.Form>
          )}
          {entitlement.kind === "subscription" && creditEstimate ? (
            <s-paragraph>
              Credito stimato sul periodo non usufruito: {euro(creditEstimate)} €. È una stima:
              nella fattura Shopify l’acquisto può comparire a prezzo pieno e il credito
              separatamente, e l’importo effettivo è quello calcolato da Shopify.
            </s-paragraph>
          ) : null}
          {entitlement.kind === "subscription" ? (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <s-button type="submit" variant="secondary" disabled={fetcher.state !== "idle"}>
                Cancella il rinnovo
              </s-button>
            </fetcher.Form>
          ) : null}
        </s-section>
      ) : null}
    </s-page>
  );
}
