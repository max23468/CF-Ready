import type { AppErrorCode } from "../app-error";
import { ELIGIBLE_COUNTRY, type Entitlement } from "../config";
import { configWithEntitlement, entitlementDiffers } from "./domain";
import { withValidationLock } from "./lock.server";
import {
  UPDATE_VALIDATION,
  duplicateValidationError,
  mutationError,
  queryContext,
  readValidationReadback,
  validationsForApp,
} from "./shopify.server";
import {
  METAFIELD_KEY,
  METAFIELD_NAMESPACE,
  type Admin,
  type MutationResult,
  type Validation,
} from "./types";

export type ValidationInventoryPhase = {
  entitlementEnableOverride: boolean | undefined;
  errorCode: AppErrorCode | null;
  matches: Validation[];
  retryable: boolean;
  validation: Validation | undefined;
  writeEntitlementOutsideEligible: boolean;
};

export async function reconcileValidationInventory(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  nodes: Validation[],
  eligible: boolean,
): Promise<ValidationInventoryPhase> {
  let matches = validationsForApp(nodes);

  if (matches.length > 1 && matches.some(({ enabled }) => enabled)) {
    try {
      await disableDuplicateValidations(admin, db, shopDomain, matches);
      matches = (await readValidationReadback(admin)) ?? matches;
    } catch {
      // Il banner operativo resta disponibile usando l'ultima lettura certa.
    }
  }

  let validation = matches.length === 1 ? matches[0] : undefined;
  let errorCode = duplicateValidationError(matches);
  let retryable = false;
  let writeEntitlementOutsideEligible = false;
  let entitlementEnableOverride: boolean | undefined;

  if (!eligible && validation?.enabled) {
    const disableError = await disableForCountry(admin, db, shopDomain, validation.id);
    errorCode = disableError;
    retryable ||= disableError === "validation_locked";
    const readback = await readValidationReadback(admin);
    if (readback === null) {
      errorCode ??= "validation_disable_failed";
      writeEntitlementOutsideEligible = disableError !== null;
    } else {
      matches = readback;
      validation = readback.length === 1 ? readback[0] : undefined;
      errorCode = duplicateValidationError(readback) ?? errorCode;
      if (validation?.enabled) errorCode ??= "validation_still_enabled";
      writeEntitlementOutsideEligible = validation?.enabled === true;
    }
    if (writeEntitlementOutsideEligible) {
      entitlementEnableOverride = disableError === null ? false : undefined;
    }
  }

  return {
    entitlementEnableOverride,
    errorCode,
    matches,
    retryable,
    validation,
    writeEntitlementOutsideEligible,
  };
}

export async function reconcileValidationEntitlement(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  phase: ValidationInventoryPhase,
  entitlement: Entitlement,
  eligible: boolean,
): Promise<ValidationInventoryPhase> {
  let { errorCode, matches, retryable, validation } = phase;
  if (
    !(eligible || phase.writeEntitlementOutsideEligible) ||
    !validation ||
    !entitlementDiffers(validation.metafield?.jsonValue, entitlement)
  ) {
    return phase;
  }

  const write = await writeEntitlement(
    admin,
    db,
    shopDomain,
    validation,
    entitlement,
    phase.entitlementEnableOverride,
    !eligible,
  );

  if (!write.acquired || write.result === "country_changed") {
    return { ...phase, errorCode: "validation_locked", retryable: true };
  }

  const readback = await readValidationReadback(admin);
  if (readback !== null) {
    matches = readback;
    validation = readback.length === 1 ? readback[0] : undefined;
    errorCode = duplicateValidationError(readback) ?? errorCode;
  }
  if (write.result === "validation_locked") {
    errorCode ??= "validation_locked";
    retryable = true;
  } else if (write.result) {
    errorCode ??= "entitlement_write_failed";
  } else if (
    readback === null ||
    entitlementDiffers(validation?.metafield?.jsonValue, entitlement)
  ) {
    errorCode ??= "entitlement_readback_failed";
  }

  return { ...phase, errorCode, matches, retryable, validation };
}

type EntitlementWriteResult =
  | "country_changed"
  | "entitlement_write_failed"
  | "validation_locked"
  | null;

function writeEntitlement(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validation: Validation,
  entitlement: Entitlement,
  forceEnabled?: boolean,
  requireIneligible = false,
) {
  return withValidationLock<EntitlementWriteResult>(db, shopDomain, async (heartbeat) => {
    const context = await queryContext(admin);
    if (requireIneligible && context.shop.shopAddress.countryCodeV2 === ELIGIBLE_COUNTRY) {
      return "country_changed";
    }
    const current = validationsForApp(context.validations.nodes).find(
      ({ id }) => id === validation.id,
    );
    if (!current) return "entitlement_write_failed";
    if (!(await heartbeat.isHeld())) return "validation_locked";

    const response = await admin.graphql(UPDATE_VALIDATION, {
      variables: {
        id: current.id,
        validation: {
          enable: forceEnabled ?? current.enabled,
          blockOnFailure: false,
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: JSON.stringify(
                configWithEntitlement(current.metafield?.jsonValue, entitlement),
              ),
            },
          ],
        },
      },
    });
    const result = (await response.json()) as MutationResult;
    return mutationError(result, "validationUpdate") ? "entitlement_write_failed" : null;
  }).catch(() => ({ acquired: true as const, result: "entitlement_write_failed" as const }));
}

// Fail-open: uno store non idoneo perde la Validation, non le vendite.
async function disableForCountry(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  id: string,
): Promise<AppErrorCode | null> {
  const write = await withValidationLock<AppErrorCode | null>(db, shopDomain, async (heartbeat) => {
    if (!(await heartbeat.isHeld())) return "validation_locked";
    try {
      const response = await admin.graphql(UPDATE_VALIDATION, {
        variables: { id, validation: { enable: false, blockOnFailure: false } },
      });
      const result = (await response.json()) as MutationResult;
      return mutationError(result, "validationUpdate") ? "validation_disable_failed" : null;
    } catch {
      return "validation_disable_failed";
    }
  });
  return write.acquired ? write.result : "validation_locked";
}

async function disableDuplicateValidations(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validations: Validation[],
) {
  return withValidationLock(db, shopDomain, async (heartbeat) => {
    for (const { id, enabled } of validations) {
      if (!enabled) continue;
      // Le mutation restano seriali: ogni scrittura parte solo se la lease è ancora nostra.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (!(await heartbeat.isHeld())) throw new Error("Validation lock persa");
      try {
        const response = await admin.graphql(UPDATE_VALIDATION, {
          variables: { id, validation: { enable: false, blockOnFailure: false } },
        });
        await response.json();
      } catch {
        // Il readback aggrega l'esito; un duplicato guasto non impedisce gli altri tentativi.
      }
    }
  });
}
