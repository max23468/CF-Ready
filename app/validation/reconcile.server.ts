import {
  cancelSubscription,
  currentPricingGeneration,
  entitlementFor,
  localDate,
  markTrialConverted,
  proratedCredit,
  readBilling,
  readBillingAccount,
  readComplimentaryEntitlement,
  syncBillingAccount,
  syncTrial,
} from "../billing.server";
import { ELIGIBLE_COUNTRY } from "../config";
import type { Entitlement } from "../config";
import { recordEvent } from "../events.server";
import { configWithEntitlement, entitlementDiffers } from "./domain";
import { withValidationLock } from "./lock.server";
import { persistValidationState } from "./repository.server";
import {
  UPDATE_VALIDATION,
  duplicateValidationError,
  mutationError,
  queryContext,
  queryHomeSnapshot,
  readValidationReadback,
  validationsForApp,
} from "./shopify.server";
import type { Admin, MutationResult, ReconcileTiming, Validation } from "./types";
import { METAFIELD_KEY, METAFIELD_NAMESPACE } from "./types";

export async function reconcile(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  options?: { prefetchBilling?: boolean; reportTiming?: ReconcileTiming },
) {
  const reportTiming = options?.reportTiming;
  const readBillingTimed = async () => {
    const startedAt = performance.now();
    try {
      return { state: await readBilling(admin), error: null };
    } catch (error) {
      return { state: null, error };
    } finally {
      reportTiming?.("shopify_billing", performance.now() - startedAt);
    }
  };
  const contextStartedAt = performance.now();
  const snapshot = options?.prefetchBilling ? await queryHomeSnapshot(admin) : null;
  const { shop, validations } = snapshot ?? (await queryContext(admin));
  reportTiming?.(
    snapshot ? "shopify_snapshot" : "shopify_context",
    performance.now() - contextStartedAt,
  );
  const countryCode = shop.shopAddress.countryCodeV2;
  const eligible = countryCode === ELIGIBLE_COUNTRY;
  const today = localDate(shop.ianaTimezone);
  let matches = validationsForApp(validations.nodes);

  if (matches.length > 1 && matches.some(({ enabled }) => enabled)) {
    try {
      await disableDuplicateValidations(admin, db, shopDomain, matches);
      matches = (await readValidationReadback(admin)) ?? matches;
    } catch {
      // Il banner operativo resta disponibile usando l'ultima lettura certa.
    }
  }

  let validation = matches.length === 1 ? matches[0] : undefined;
  let errorCode: string | null = duplicateValidationError(matches);
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

  const commercialStartedAt = performance.now();
  const billingPromise = eligible
    ? snapshot
      ? Promise.resolve(snapshot.billing)
      : readBillingTimed()
    : null;
  const [trial, storedAccount, complimentary] = await Promise.all([
    syncTrial(db, shopDomain, { today }),
    readBillingAccount(db, shopDomain),
    readComplimentaryEntitlement(db, shopDomain),
  ]);
  reportTiming?.("d1_commercial", performance.now() - commercialStartedAt);
  let account = storedAccount;
  let creditEstimate: number | null = null;
  let billingConfirmed = false;
  let conversionRequired = false;
  let complimentaryOperational = false;

  if (eligible) {
    try {
      const initialBilling = await billingPromise!;
      if (initialBilling.error) throw initialBilling.error;
      let state = initialBilling.state!;

      // Il diritto sostitutivo deve esistere prima di cancellare l'abbonamento.
      const conversionReason = state.oneTime
        ? "one_time_purchased"
        : complimentary?.status === "active"
          ? "complimentary_granted"
          : null;
      if (conversionReason && state.subscription) {
        conversionRequired = true;
        const conversion = await withValidationLock(db, shopDomain, async (heartbeat) => {
          const current = await readBilling(admin);
          const replacementStillActive =
            conversionReason === "one_time_purchased"
              ? Boolean(current.oneTime)
              : complimentary?.status === "active";
          if (!replacementStillActive || !current.subscription) {
            return { state: current, error: null, converted: false };
          }
          if (!(await heartbeat.isHeld())) {
            return { state: current, error: "validation_locked", converted: false };
          }
          const cancellationError = await cancelSubscription(admin, current.subscription.id, {
            prorate: true,
          });
          const readback = cancellationError ? current : await readBilling(admin);
          const error =
            cancellationError ?? (readback.subscription ? "subscription_cancel_failed" : null);
          return {
            state: readback,
            error,
            converted: !error,
          };
        });

        if (!conversion.acquired) {
          errorCode ??= "validation_locked";
          retryable = true;
        } else {
          state = conversion.result.state;
          if (conversion.result.error) {
            errorCode ??= conversion.result.error;
            retryable = true;
          } else if (conversion.result.converted) {
            await recordEvent(db, {
              shopDomain,
              name: "subscription_converted",
              class: "billing",
              metadata: { reason: conversionReason },
            });
          }
        }
      }

      creditEstimate = state.subscription
        ? proratedCredit({
            amount: state.subscription.amount,
            interval: state.subscription.interval,
            periodEnd: state.subscription.currentPeriodEnd,
            today,
          })
        : null;

      account = await syncBillingAccount(db, shopDomain, state, {
        today,
        timeZone: shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, account, today),
        storedAccount: account,
      });
      billingConfirmed = true;
      complimentaryOperational = complimentary?.status === "active" && state.subscription === null;

      if (account.entitlement_status === "active" || complimentaryOperational) {
        await markTrialConverted(db, shopDomain);
      }
    } catch {
      // La cache resta disponibile alla UI, ma non concede diritti quando Shopify è incerto.
      // Anche l'omaggio attende il readback: potrebbe esserci un rinnovo da cancellare.
      account = storedAccount;
      errorCode ??= "billing_read_failed";
      retryable ||= conversionRequired || complimentary?.status === "active";
    }
  }

  const entitlement: Entitlement = billingConfirmed
    ? entitlementFor(trial, today, account, complimentaryOperational ? complimentary : null)
    : { kind: "none", validThrough: null };

  if (
    (eligible || writeEntitlementOutsideEligible) &&
    validation &&
    entitlementDiffers(validation.metafield?.jsonValue, entitlement)
  ) {
    const write = await writeEntitlement(
      admin,
      db,
      shopDomain,
      validation,
      entitlement,
      entitlementEnableOverride,
      !eligible,
    );

    if (!write.acquired) {
      errorCode = "validation_locked";
      retryable = true;
    } else if (write.result === "country_changed") {
      errorCode = "validation_locked";
      retryable = true;
    } else {
      const readback = await readValidationReadback(admin);
      if (readback !== null) {
        matches = readback;
        validation = readback.length === 1 ? readback[0] : undefined;
        errorCode = duplicateValidationError(readback) ?? errorCode;
      }
      if (write.result === "validation_locked") {
        errorCode ??= write.result;
        retryable = true;
      } else if (write.result) {
        errorCode ??= write.result;
      } else if (
        readback === null ||
        entitlementDiffers(validation?.metafield?.jsonValue, entitlement)
      ) {
        errorCode ??= "entitlement_readback_failed";
      }
    }
  }

  const validationEnabled =
    validation?.enabled ?? (matches.length > 1 && matches.some(({ enabled }) => enabled));
  retryable ||= duplicateValidationError(matches) === "duplicate_validations_active";
  const persistenceStartedAt = performance.now();
  await persistValidationState(db, shopDomain, {
    countryCode,
    eligible,
    validation,
    validationEnabled,
    errorCode,
  });
  reportTiming?.("d1_validation_state", performance.now() - persistenceStartedAt);

  return {
    shopName: shop.name,
    countryCode,
    partnerDevelopment: shop.plan.partnerDevelopment,
    today,
    eligible,
    validation,
    validationEnabled,
    trial,
    account,
    complimentary,
    entitlement,
    creditEstimate,
    errorCode,
    retryable,
  };
}

function writeEntitlement(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validation: Validation,
  entitlement: Entitlement,
  forceEnabled?: boolean,
  requireIneligible = false,
) {
  return withValidationLock(db, shopDomain, async (heartbeat) => {
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
  }).catch(() => ({ acquired: true as const, result: "entitlement_write_failed" }));
}

// Fail-open: uno store non idoneo perde la Validation, non le vendite.
async function disableForCountry(admin: Admin, db: D1Database, shopDomain: string, id: string) {
  const write = await withValidationLock(db, shopDomain, async (heartbeat) => {
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
