import type { Admin } from "../admin-graphql";
import { BILLING_IS_TEST } from "../env.server";
import { recordEvent } from "../events.server";
import { planFor, type PlanKind } from "../plans.server";
import {
  chargeTrialDays,
  currentPricingGeneration,
  localDate,
  requestedRecurringPlanIsActive,
} from "./domain";
import {
  markBillingConversionCancelled,
  markOrdinaryCancellationConfirmed,
  readBillingAccount,
  readComplimentaryEntitlement,
  recordBillingConversion,
  recordOrdinaryCancellationIntent,
  startTrial,
  syncBillingAccount,
  syncTrial,
} from "./repository.server";
import { cancelSubscription, createCharge, readBilling, returnUrlFor } from "./shopify.server";

export async function startPlanTrial(db: D1Database, shopDomain: string, today: string) {
  if ((await readComplimentaryEntitlement(db, shopDomain))?.status === "active") {
    return { ok: false as const, errorCode: "one_time_already_active" as const };
  }
  const trial = await startTrial(db, shopDomain, { today });
  return trial?.status === "active"
    ? { ok: true as const }
    : { ok: false as const, errorCode: "trial_unavailable" as const };
}

// I comandi seguenti vanno eseguiti sotto la lease dello store, acquisita dal chiamante.

export async function requestPlanCharge(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  kind: PlanKind,
  loadTimeZone: () => Promise<string>,
) {
  if ((await readComplimentaryEntitlement(db, shopDomain))?.status === "active") {
    return { ok: false, errorCode: "one_time_already_active" };
  }
  const [timeZone, billing] = await Promise.all([loadTimeZone(), readBilling(admin)]);
  if (billing.oneTime) return { ok: false, errorCode: "one_time_already_active" };
  if (kind === "one_time" && billing.pendingOneTime) {
    return { ok: false, errorCode: "charge_pending" };
  }
  if (requestedRecurringPlanIsActive(billing, kind)) {
    return { ok: false, errorCode: "generic" };
  }

  const today = localDate(timeZone);
  const [trial, storedAccount] = await Promise.all([
    syncTrial(db, shopDomain, { today }),
    readBillingAccount(db, shopDomain),
  ]);
  const account = await syncBillingAccount(db, shopDomain, billing, {
    today,
    timeZone,
    pricingGeneration: currentPricingGeneration(trial, storedAccount, today),
    storedAccount,
  });
  const plan = planFor(currentPricingGeneration(trial, account, today), kind);

  const { confirmationUrl, error } = await createCharge(admin, {
    name: plan.name,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    trialDays: kind === "one_time" ? 0 : chargeTrialDays(trial, today),
    test: BILLING_IS_TEST,
    returnUrl: returnUrlFor(shopDomain),
  });

  if (error || !confirmationUrl) return { ok: false, errorCode: "charge_failed" };
  return { ok: true, confirmationUrl };
}

export async function cancelOrdinarySubscription(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  loadTimeZone: () => Promise<string>,
) {
  const [timeZone, state] = await Promise.all([loadTimeZone(), readBilling(admin)]);
  if (state.oneTime) return { ok: false, errorCode: "one_time_already_active" };
  if (state.pendingOneTime) return { ok: false, errorCode: "charge_pending" };
  if (!state.subscription) return { ok: false, errorCode: "no_subscription" };
  const today = localDate(timeZone);
  if (
    !(await recordOrdinaryCancellationIntent(db, shopDomain, state.subscription, today, timeZone))
  ) {
    return { ok: false, errorCode: "cancel_failed" };
  }

  if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
    return { ok: false, errorCode: "cancel_failed" };
  }

  await markOrdinaryCancellationConfirmed(db, state.subscription.id);
  await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
  return { ok: true };
}

// Il diritto sostitutivo deve esistere prima di cancellare l'abbonamento.
export async function convertSubscriptionToOneTime(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  {
    heartbeat,
    creditEstimate,
    oneTimeGid,
  }: {
    heartbeat: { isHeld(): Promise<boolean> };
    creditEstimate: number | null;
    oneTimeGid: string;
  },
) {
  const current = await readBilling(admin);
  if (!current.oneTime || !current.subscription) return { state: current, error: null };
  if (!(await heartbeat.isHeld())) return { state: current, error: "validation_locked" };

  await recordBillingConversion(db, shopDomain, {
    subscriptionGid: current.subscription.id,
    oneTimeGid: current.oneTime.id,
    creditEstimate,
    currency: current.subscription.currency,
    isTest: current.subscription.test || current.oneTime.test,
  });
  const cancellationError = await cancelSubscription(admin, current.subscription.id, {
    prorate: true,
  });
  const state = cancellationError ? current : await readBilling(admin);
  const error = cancellationError ?? (state.subscription ? "subscription_cancel_failed" : null);
  if (error) return { state, error };

  await markBillingConversionCancelled(db, oneTimeGid);
  await recordEvent(db, {
    shopDomain,
    name: "subscription_converted",
    class: "billing",
    metadata: { reason: "one_time_purchased" },
  });
  return { state, error };
}
