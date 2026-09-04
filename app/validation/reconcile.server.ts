import { cancelSubscription, localDate, proratedCredit, readBilling } from "../billing.server";
import { parseAppErrorCode } from "../app-error";
import {
  readCommercialInputs,
  syncCommercialEntitlement,
} from "../billing/commercial-entitlement.server";
import type { Entitlement } from "../config";
import { recordEvent } from "../events.server";
import { withValidationLock } from "./lock.server";
import { persistValidationState, readValidationStateRevision } from "./repository.server";
import { duplicateValidationError, queryContext, queryHomeSnapshot } from "./shopify.server";
import type { Admin, ReconcileTiming } from "./types";
import {
  reconcileValidationEntitlement,
  reconcileValidationInventory,
} from "./reconcile-validation.server";

export async function reconcile(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  options?: {
    prefetchBilling?: boolean;
    reportTiming?: ReconcileTiming;
    waitUntil?: (promise: Promise<unknown>) => void;
  },
) {
  const reportTiming = options?.reportTiming;
  // Il fence nasce prima della lettura Shopify: una scrittura successiva rende innocuo
  // l'eventuale completamento tardivo della persistenza affidata a waitUntil.
  const expectedRevision = options?.waitUntil
    ? await readValidationStateRevision(db, shopDomain)
    : undefined;
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
  const today = localDate(shop.ianaTimezone);
  let validationPhase = await reconcileValidationInventory(
    admin,
    db,
    shopDomain,
    validations.nodes,
  );
  let { errorCode, retryable } = validationPhase;

  const commercialStartedAt = performance.now();
  const billingPromise = snapshot ? Promise.resolve(snapshot.billing) : readBillingTimed();
  const commercialInputs = await readCommercialInputs(db, shopDomain, today);
  reportTiming?.("d1_commercial", performance.now() - commercialStartedAt);
  const { trial, complimentary } = commercialInputs;
  let account = commercialInputs.account;
  let creditEstimate: number | null = null;
  let billingConfirmed = false;
  let conversionRequired = false;
  let complimentaryOperational = false;
  let entitlement: Entitlement = { kind: "none", validThrough: null };

  try {
    const initialBilling = await billingPromise;
    if (initialBilling.error) throw initialBilling.error;
    let state = initialBilling.state!;

    // Il diritto sostitutivo deve esistere prima di cancellare l'abbonamento.
    const conversionReason = state.oneTime ? "one_time_purchased" : null;
    if (conversionReason && state.subscription) {
      conversionRequired = true;
      const conversion = await withValidationLock(db, shopDomain, async (heartbeat) => {
        const current = await readBilling(admin);
        const replacementStillActive = Boolean(current.oneTime);
        if (!replacementStillActive || !current.subscription) {
          return { state: current, error: null, converted: false };
        }
        if (!(await heartbeat.isHeld())) {
          return {
            state: current,
            error: "validation_locked",
            converted: false,
          };
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
          errorCode ??= parseAppErrorCode(conversion.result.error) ?? "subscription_cancel_failed";
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

    const commercial = await syncCommercialEntitlement(db, shopDomain, {
      billing: state,
      inputs: commercialInputs,
      timeZone: shop.ianaTimezone,
      today,
    });
    account = commercial.account;
    billingConfirmed = true;
    complimentaryOperational = commercial.complimentaryOperational;
    entitlement = commercial.entitlement;
  } catch {
    // La cache resta disponibile alla UI, ma non concede diritti quando Shopify è incerto.
    // Anche l'omaggio attende il readback: non deve mascherare un abbonamento attivo.
    account = commercialInputs.account;
    errorCode ??= "billing_read_failed";
    retryable ||= conversionRequired || complimentary?.status === "active";
  }

  if (!billingConfirmed) entitlement = { kind: "none", validThrough: null };

  validationPhase = await reconcileValidationEntitlement(
    admin,
    db,
    shopDomain,
    { ...validationPhase, errorCode, retryable },
    entitlement,
  );
  ({ errorCode, retryable } = validationPhase);
  const { matches, validation } = validationPhase;

  const validationEnabled =
    validation?.enabled ?? (matches.length > 1 && matches.some(({ enabled }) => enabled));
  retryable ||= duplicateValidationError(matches) === "duplicate_validations_active";
  const persistenceStartedAt = performance.now();
  const persistence = persistValidationState(db, shopDomain, {
    displayName: shop.name,
    countryCode,
    validation,
    validationEnabled,
    errorCode,
    expectedRevision,
  });
  if (options?.waitUntil) {
    options.waitUntil(
      persistence.catch(() =>
        recordEvent(db, {
          shopDomain,
          name: "validation_state_persist_failed",
          class: "error",
          metadata: { error_code: "validation_state_persist_failed" },
        }),
      ),
    );
    reportTiming?.("d1_validation_schedule", performance.now() - persistenceStartedAt);
  } else {
    await persistence;
    reportTiming?.("d1_validation_state", performance.now() - persistenceStartedAt);
  }

  return {
    shopName: shop.name,
    countryCode,
    partnerDevelopment: shop.plan.partnerDevelopment,
    today,
    validation,
    validationEnabled,
    trial,
    account,
    complimentary: complimentaryOperational ? complimentary : null,
    entitlement,
    creditEstimate,
    errorCode,
    retryable,
  };
}
