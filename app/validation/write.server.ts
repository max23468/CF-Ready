import {
  currentPricingGeneration,
  entitlementFor,
  localDate,
  markTrialConverted,
  readBilling,
  readBillingAccount,
  readComplimentaryEntitlement,
  syncBillingAccount,
  syncTrial,
} from "../billing.server";
import { ELIGIBLE_COUNTRY, readConfig } from "../config";
import type { CheckoutConfig, Entitlement } from "../config";
import { configHash, observedConfigHash } from "./domain";
import {
  acquireValidationLock,
  releaseValidationLockBestEffort,
  startValidationLockHeartbeat,
} from "./lock.server";
import { persistValidationState, saveAddress2Declaration } from "./repository.server";
import {
  CREATE_VALIDATION,
  UPDATE_VALIDATION,
  findValidation,
  mutationError,
  queryContext,
} from "./shopify.server";
import {
  FUNCTION_HANDLE,
  METAFIELD_KEY,
  METAFIELD_NAMESPACE,
  VALIDATION_TITLE,
  type Admin,
  type MutationResult,
} from "./types";

export type ValidationWriteResult =
  | { ok: true; enabled: boolean }
  | { ok: false; errorCode: string };

type ValidationConfigUpdate = Partial<Pick<CheckoutConfig, "rules" | "errorDisplay" | "messages">>;

// Percorso unico di scrittura verso Shopify, condiviso da salvataggio delle regole e
// attivazione: lease per store, configurazione intera, readback e stato persistito.
export async function writeValidation(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  next: ValidationConfigUpdate | null,
  enable: boolean | null,
  expectedHash?: string | null,
  declared?: boolean | null,
): Promise<ValidationWriteResult> {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return { ok: false, errorCode: "validation_locked" };
  const heartbeat = startValidationLockHeartbeat(db, shopDomain, lockToken);

  try {
    const data = await queryContext(admin);
    const countryCode = data.shop.shopAddress.countryCodeV2;
    const eligible = countryCode === ELIGIBLE_COUNTRY;
    if (enable && !eligible) return { ok: false, errorCode: "country_not_eligible" };

    const existing = findValidation(data.validations.nodes);

    // Controllo ottimistico: una configurazione cambiata da un'altra sessione non viene
    // sovrascritta. Attivazione e disattivazione non modificano la configurazione.
    if (expectedHash !== undefined && (await observedConfigHash(existing)) !== expectedHash) {
      return { ok: false, errorCode: "config_conflict" };
    }

    const enabled = enable ?? existing?.enabled ?? false;
    const today = localDate(data.shop.ianaTimezone);
    const [trial, complimentary] = await Promise.all([
      syncTrial(db, shopDomain, { today }),
      readComplimentaryEntitlement(db, shopDomain),
    ]);
    let account = await readBillingAccount(db, shopDomain);
    let billing: Awaited<ReturnType<typeof readBilling>> | null = null;
    try {
      billing = await readBilling(admin);
    } catch {
      // Shopify non raggiungibile: conserva lo stato operativo noto senza concedere diritti.
    }
    if (!billing && complimentary?.status === "active" && enable === true) {
      return { ok: false, errorCode: "billing_read_failed" };
    }
    const complimentaryOperational =
      complimentary?.status === "active" && billing?.subscription == null;
    if (billing) {
      account = await syncBillingAccount(db, shopDomain, billing, {
        today,
        timeZone: data.shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, account, today),
        storedAccount: account,
      });
      if (account.entitlement_status === "active" || complimentaryOperational) {
        await markTrialConverted(db, shopDomain);
      }
    }
    const entitlement: Entitlement = billing
      ? entitlementFor(trial, today, account, complimentaryOperational ? complimentary : null)
      : { kind: "none", validThrough: null };
    if (enable === true && !existing?.enabled && entitlement.kind === "none") {
      return { ok: false, errorCode: "entitlement_required" };
    }
    if (enable === null && !next) return { ok: false, errorCode: "validation_write_failed" };

    const source = {
      ...readConfig(existing?.metafield?.jsonValue),
      ...(enable === null ? next : null),
    };
    const config: CheckoutConfig = {
      schemaVersion: 2,
      enabled,
      errorDisplay: source.errorDisplay,
      entitlement,
      rules: source.rules,
      messages: source.messages,
    };
    const metafields = [
      {
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(config),
      },
    ];
    const variables = existing
      ? {
          id: existing.id,
          validation: {
            title: VALIDATION_TITLE,
            enable: enabled,
            blockOnFailure: false,
            metafields,
          },
        }
      : {
          validation: {
            title: VALIDATION_TITLE,
            functionHandle: FUNCTION_HANDLE,
            enable: enabled,
            blockOnFailure: false,
            metafields,
          },
        };

    if (!(await heartbeat.isHeld())) return { ok: false, errorCode: "validation_locked" };

    const operation = existing ? "validationUpdate" : "validationCreate";
    const response = await admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
      variables,
    });
    const error = mutationError((await response.json()) as MutationResult, operation);

    if (error) {
      const errorCode = validationLimitReached(error)
        ? "validation_limit_reached"
        : "validation_write_failed";
      await persistValidationState(db, shopDomain, {
        displayName: data.shop.name,
        countryCode,
        eligible,
        validation: existing,
        errorCode,
      });
      return { ok: false, errorCode };
    }

    const readback = findValidation((await queryContext(admin)).validations.nodes);
    const consistent = Boolean(
      readback &&
      readback.enabled === enabled &&
      readback.blockOnFailure === false &&
      (await observedConfigHash(readback)) === (await configHash(config)),
    );

    await persistValidationState(db, shopDomain, {
      displayName: data.shop.name,
      countryCode,
      eligible,
      validation: readback,
      errorCode: consistent ? null : "validation_readback_failed",
    });
    if (!consistent) return { ok: false, errorCode: "validation_readback_failed" };
    if (declared !== undefined && declared !== null) {
      await saveAddress2Declaration(db, shopDomain, declared);
    }

    return { ok: true, enabled };
  } catch {
    return { ok: false, errorCode: "validation_write_failed" };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
}

// Shopify espone il limite delle Validation soltanto nel testo dello userError. Se aggiungerà
// un codice tipizzato, questo match potrà essere sostituito senza toccare il flusso di scrittura.
function validationLimitReached(message: string) {
  const text = message.toLowerCase();
  return text.includes("maximum") || text.includes("limit");
}
