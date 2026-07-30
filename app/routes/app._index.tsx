import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { entitlementFor, localDate, syncTrial } from "../billing.server";
import { recordEvent } from "../events.server";
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
import type { MutationResult } from "../validation.server";

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
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const intent = (await request.formData()).get("intent");
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, error: "Azione non valida." };
  }

  const db = context.cloudflare.env.DB;
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
        value: JSON.stringify(configWithEntitlement(existing?.metafield?.jsonValue, entitlement)),
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

export default function Home() {
  const {
    shopName,
    countryCode,
    eligible,
    validationEnabled,
    trialStatus,
    trialEndsAt,
    entitlement,
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
      {trialStatus ? (
        <s-section heading="Prova">
          <s-paragraph>
            {trialStatus === "active"
              ? `Prova attiva fino al ${trialEndsAt}.`
              : "Prova terminata: le regole non vengono più applicate al checkout."}
          </s-paragraph>
          {entitlement.kind === "none" ? (
            <s-banner tone="warning">
              Senza un piano attivo il checkout non viene bloccato. Regole e messaggi restano
              salvati.
            </s-banner>
          ) : null}
        </s-section>
      ) : null}
    </s-page>
  );
}
