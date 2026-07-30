import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  entitlementFor,
  localDate,
  readBilling,
  remainingTrialDays,
  syncTrial,
} from "../billing.server";
import { planFor, planPrices } from "../plans.server";
import type { PlanKind } from "../plans.server";
import type { Entitlement } from "../billing.server";
import { recordEvent } from "../events.server";
import { APP_URL, BILLING_IS_TEST } from "../env.server";
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
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const db = context.cloudflare.env.DB;
  const intent = (await request.formData()).get("intent");

  if (intent === "subscribe_monthly" || intent === "subscribe_annual") {
    return subscribe(billing, admin, db, session.shop, {
      kind: intent === "subscribe_monthly" ? "monthly" : "annual",
    });
  }
  if (intent === "cancel") {
    return cancelSubscription(billing, admin, db, session.shop);
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

type BillingApi = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

// L'approvazione avviene su Shopify: qui si crea solo la richiesta e si restituisce l'URL,
// che il client apre a livello superiore. Il diritto non viene mai concesso dal ritorno.
async function subscribe(
  billing: BillingApi,
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  { kind }: { kind: PlanKind },
) {
  const { shop } = await queryContext(admin);
  if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
    return { ok: false, error: "CF Ready è disponibile solo per store con indirizzo in Italia." };
  }

  const today = localDate(shop.ianaTimezone);
  const trial = await syncTrial(db, shopDomain, { eligible: true, today });
  const plan = planFor(trial?.pricing_generation ?? "launch", kind);
  if (!plan) {
    return { ok: false, error: "Piano non disponibile per questo store." };
  }

  // La richiesta non ritorna: la libreria interrompe con il redirect verso l'approvazione
  // Shopify, gestendo da sé il caso embedded.
  await billing.request({
    plan: plan.name,
    isTest: BILLING_IS_TEST,
    // Solo i giorni di prova residui: la sottoscrizione non riavvia i quattordici giorni.
    trialDays: remainingTrialDays(trial, today),
    returnUrl: new URL("/app", APP_URL).toString(),
  });

  return { ok: true };
}

// Cancellazione ordinaria: nessuna proratazione, l'accesso resta fino a fine periodo pagato.
async function cancelSubscription(
  billing: BillingApi,
  admin: Admin,
  db: D1Database,
  shopDomain: string,
) {
  const state = await readBilling(admin, BILLING_IS_TEST);
  if (!state.subscription) {
    return { ok: false, error: "Non risulta alcuna sottoscrizione attiva da cancellare." };
  }

  await billing.cancel({
    subscriptionId: state.subscription.id,
    isTest: BILLING_IS_TEST,
    prorate: false,
  });
  await recordEvent(db, {
    shopDomain,
    name: "subscription_cancelled",
    class: "billing",
  });

  return { ok: true };
}

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
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

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
        {fetcher.data && !fetcher.data.ok ? (
          <s-banner tone="critical">{fetcher.data.error}</s-banner>
        ) : null}
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
              Prezzo {plan.generation === "launch" ? "di lancio" : "standard"}:{" "}
              {plan.monthly.toFixed(2).replace(".", ",")} € ogni 30 giorni oppure{" "}
              {plan.annual.toFixed(2).replace(".", ",")} € all’anno.
            </s-paragraph>
          ) : null}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="subscribe_monthly" />
            <s-button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
              Passa al mensile
            </s-button>
          </fetcher.Form>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="subscribe_annual" />
            <s-button type="submit" disabled={fetcher.state !== "idle"}>
              Passa all’annuale
            </s-button>
          </fetcher.Form>
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
