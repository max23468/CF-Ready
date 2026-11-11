import type { Admin } from "../admin-graphql";
import { recordEvent } from "../events.server";
import type { AppErrorCode } from "../app-error";
import {
  readCommercialInputs,
  syncCommercialEntitlement,
} from "../billing/commercial-entitlement.server";
import { localDate } from "../billing/domain";
import { readBilling } from "../billing/shopify.server";
import { CONFIG_SCHEMA_VERSION, readConfig } from "../config";
import type { CheckoutConfig, Entitlement } from "../config";
import { configurationSnapshot, recordLatestConfiguration } from "../configuration-history.server";
import { createServerTiming } from "../server-timing.server";
import { configHash, observedConfigHash, validationInput } from "./domain";
import { withValidationLock, type ValidationLockHeartbeat } from "./lock.server";
import { markValidationEnabledSince, persistValidationState } from "./repository.server";
import {
  CREATE_VALIDATION,
  UPDATE_VALIDATION,
  findValidation,
  mutationError,
  queryContext,
} from "./shopify.server";
import { FUNCTION_HANDLE, VALIDATION_TITLE, type MutationResult } from "./types";

export type SavedValidation = {
  configHash: string;
  rules: CheckoutConfig["rules"];
  messages: CheckoutConfig["messages"];
  enabled: boolean;
  entitled: boolean;
};

type ValidationWriteResult =
  | { ok: true; enabled: boolean; saved: SavedValidation }
  | { ok: false; errorCode: AppErrorCode };

type ValidationConfigUpdate = Partial<Pick<CheckoutConfig, "rules" | "messages">>;

type ConfigSave = {
  update: ValidationConfigUpdate;
  // `undefined` salta il controllo di conflitto; `null` attende una configurazione assente.
  expectedHash?: string | null;
  timing?: ReturnType<typeof createServerTiming>;
};

type ValidationWrite =
  | { update: ValidationConfigUpdate; expectedHash?: string | null; enable?: undefined }
  | { enable: boolean; update?: undefined; expectedHash?: undefined };

export async function saveValidationConfig(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  { update, expectedHash, timing = createServerTiming() }: ConfigSave,
) {
  return writeUnderNewLease(admin, db, shopDomain, { update, expectedHash }, timing);
}

export async function setValidationEnabled(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  enable: boolean,
): Promise<ValidationWriteResult> {
  const result = await writeUnderNewLease(admin, db, shopDomain, { enable }, createServerTiming());
  if (!result.ok) return result;
  if (result.enabled) await markValidationEnabledSince(db, shopDomain);
  await recordEvent(db, {
    shopDomain,
    name: result.enabled ? "validation_enabled" : "validation_disabled",
    class: "validation",
    metadata: { enabled: result.enabled, schema_version: CONFIG_SCHEMA_VERSION },
  });
  return result;
}

// Per l'orchestratore di regole ed etichette, che detiene l'unica lease dello store per
// l'intera sequenza.
export async function saveValidationConfigUnderLock(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  {
    update,
    expectedHash,
    timing = createServerTiming(),
    heartbeat,
  }: ConfigSave & { heartbeat: ValidationLockHeartbeat },
) {
  return applyValidationWrite(admin, db, shopDomain, { update, expectedHash }, heartbeat, timing);
}

async function writeUnderNewLease(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  write: ValidationWrite,
  timing: ReturnType<typeof createServerTiming>,
): Promise<ValidationWriteResult> {
  const locked = await withValidationLock(
    db,
    shopDomain,
    (heartbeat) => applyValidationWrite(admin, db, shopDomain, write, heartbeat, timing),
    timing,
  );
  return locked.acquired ? locked.result : { ok: false, errorCode: "validation_locked" };
}

async function applyValidationWrite(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  { update, enable, expectedHash }: ValidationWrite,
  heartbeat: ValidationLockHeartbeat,
  timing: ReturnType<typeof createServerTiming>,
): Promise<ValidationWriteResult> {
  try {
    // Il catch immediato evita rifiuti pendenti anche se il controllo di conflitto termina prima.
    const contextPromise = timing.measure("shopify_context", () => queryContext(admin));
    const billingPromise = timing
      .measure("shopify_billing", () => readBilling(admin))
      .catch(() => null);
    const data = await contextPromise;
    const countryCode = data.shop.shopAddress.countryCodeV2;

    const existing = findValidation(data.validations.nodes);

    if (expectedHash !== undefined && (await observedConfigHash(existing)) !== expectedHash) {
      return { ok: false, errorCode: "config_conflict" };
    }

    const enabled = enable ?? existing?.enabled ?? false;
    const today = localDate(data.shop.ianaTimezone);
    const [commercialInputs, billing] = await Promise.all([
      timing.measure("d1_commercial", () => readCommercialInputs(db, shopDomain, today)),
      billingPromise,
    ]);
    if (!billing && commercialInputs.complimentary?.status === "active" && enable === true) {
      return { ok: false, errorCode: "billing_read_failed" };
    }
    let entitlement: Entitlement = { kind: "none", validThrough: null };
    if (billing) {
      const commercial = await timing.measure("d1_commercial_sync", () =>
        syncCommercialEntitlement(db, shopDomain, {
          billing,
          inputs: commercialInputs,
          timeZone: data.shop.ianaTimezone,
          today,
        }),
      );
      entitlement = commercial.entitlement;
    }
    if (enable === true && !existing?.enabled && entitlement.kind === "none") {
      return { ok: false, errorCode: "entitlement_required" };
    }

    const existingConfig = readConfig(existing?.metafield?.jsonValue);
    const config: CheckoutConfig = {
      ...existingConfig,
      enabled,
      entitlement,
      rules: { ...existingConfig.rules, ...update?.rules },
      messages: update?.messages ?? existingConfig.messages,
    };
    const input = { title: VALIDATION_TITLE, ...validationInput(enabled, config) };
    const variables = existing
      ? { id: existing.id, validation: input }
      : { validation: { ...input, functionHandle: FUNCTION_HANDLE } };

    if (!(await heartbeat.isHeld())) return { ok: false, errorCode: "validation_locked" };

    const operation = existing ? "validationUpdate" : "validationCreate";
    const response = await timing.measure("validation_write", () =>
      admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
        variables,
      }),
    );
    const error = mutationError((await response.json()) as MutationResult, operation);

    if (error) {
      const errorCode = validationLimitReached(error)
        ? "validation_limit_reached"
        : "validation_write_failed";
      await persistValidationState(db, shopDomain, {
        displayName: data.shop.name,
        countryCode,
        ianaTimezone: data.shop.ianaTimezone,
        partnerDevelopment: data.shop.plan.partnerDevelopment,
        validation: existing,
        errorCode,
      });
      return { ok: false, errorCode };
    }

    const readback = findValidation(
      (await timing.measure("validation_readback", () => queryContext(admin))).validations.nodes,
    );
    const writtenHash = await configHash(config);
    const consistent = Boolean(
      readback &&
      readback.enabled === enabled &&
      readback.blockOnFailure === false &&
      (await observedConfigHash(readback)) === writtenHash,
    );

    await timing.measure("d1_validation_state", () =>
      persistValidationState(db, shopDomain, {
        displayName: data.shop.name,
        countryCode,
        ianaTimezone: data.shop.ianaTimezone,
        partnerDevelopment: data.shop.plan.partnerDevelopment,
        validation: readback,
        errorCode: consistent ? null : "validation_readback_failed",
      }),
    );
    if (!consistent) return { ok: false, errorCode: "validation_readback_failed" };
    if (update) {
      // Shopify ha già confermato: questa copia serve solo al primo paint della Home (D-174).
      await timing
        .measure("d1_configuration_history", () =>
          recordLatestConfiguration(db, shopDomain, configurationSnapshot(config)),
        )
        .catch(() => undefined);
    }

    if (update?.rules) {
      await recordEvent(db, { shopDomain, name: "rules_saved", class: "onboarding" });
    }
    return {
      ok: true,
      enabled,
      saved: {
        configHash: writtenHash,
        rules: config.rules,
        messages: config.messages,
        enabled,
        entitled: config.entitlement.kind !== "none",
      },
    };
  } catch {
    return { ok: false, errorCode: "validation_write_failed" };
  }
}

// Shopify espone il limite delle Validation soltanto nel testo dello userError. Se aggiungerà
// un codice tipizzato, questo match potrà essere sostituito senza toccare il flusso di scrittura.
function validationLimitReached(message: string) {
  const text = message.toLowerCase();
  return text.includes("maximum") || text.includes("limit");
}
