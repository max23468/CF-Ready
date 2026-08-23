import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  addDays,
  cancelSubscription,
  createCharge,
  currentPricingGeneration,
  localDate,
  readBilling,
  readBillingAccount,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  startTrial,
  syncBillingAccount,
  syncTrial,
} from "../../billing.server";
import { ELIGIBLE_COUNTRY, messagesAreDefault, readConfig, reviewIsDue } from "../../config";
import { databaseContext } from "../../context.server";
import { APP_VERSION, BILLING_IS_TEST } from "../../env.server";
import { recordEvent } from "../../events.server";
import { resolveLocale } from "../../i18n";
import { planFor, planPrices } from "../../plans.server";
import type { PlanKind } from "../../plans.server";
import { authenticate } from "../../shopify.server";
import {
  queryContext,
  readHomeState,
  reconcile,
  withValidationLock,
  writeValidation,
} from "../../validation.server";
import type { Admin } from "../../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const startedAt = performance.now();
  const timings: string[] = [];
  const authenticationStartedAt = performance.now();
  const { admin, session } = await authenticate.admin(request);
  timings.push(`auth;dur=${(performance.now() - authenticationStartedAt).toFixed(1)}`);
  const db = context.get(databaseContext);

  const statePromise = reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: (name, durationMs) => {
      timings.push(`${name};dur=${durationMs.toFixed(1)}`);
    },
  });
  const localStateStartedAt = performance.now();
  const localStatePromise = readHomeState(db, session.shop).then((localState) => {
    timings.push(`d1_home;dur=${(performance.now() - localStateStartedAt).toFixed(1)}`);
    return localState;
  });
  const [state, { onboarding, address2Declaration, enabledSince }] = await Promise.all([
    statePromise,
    localStatePromise,
  ]);
  const config = readConfig(state.validation?.metafield?.jsonValue);

  const remaining = remainingTrialDays(state.trial, state.today);
  const payload = {
    locale: resolveLocale(request),
    shopName: state.shopName,
    shopDomain: session.shop,
    version: APP_VERSION,
    countryCode: state.countryCode,
    eligible: state.eligible,
    validationEnabled: state.validationEnabled,
    rules: config.rules,
    errorDisplay: config.errorDisplay,
    messagesDefault: messagesAreDefault(config.messages),
    address2Declared: address2Declaration !== null,
    trialEndsAt: state.trial?.ends_at ?? null,
    remaining,
    entitlement: state.entitlement,
    firstChargeAt: remaining > 0 ? addDays(state.today, remaining) : null,
    trialStatus: state.trial?.status ?? null,
    plan: planPrices(currentPricingGeneration(state.trial, state.account, state.today)),
    planKind: state.account?.plan_kind ?? "none",
    periodEnd: state.account?.current_period_end ?? null,
    accountStatus: state.account?.entitlement_status ?? "none",
    creditEstimate: state.creditEstimate,
    errorCode: state.errorCode,
    onboarding: onboarding.status,
    reviewDue: reviewIsDue(
      {
        onboarding: onboarding.status,
        validationEnabled: state.validationEnabled,
        errorCode: state.errorCode,
        enabledSince,
        partnerDevelopment: state.partnerDevelopment,
      },
      Date.now(),
    ),
  };
  timings.push(`total;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return data(payload, { headers: { "Server-Timing": timings.join(", ") } });
};

export type HomeData = Awaited<ReturnType<typeof loader>>["data"];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const intent = (await request.formData()).get("intent");

  if (intent === "repair") {
    try {
      const state = await reconcile(admin, db, session.shop);
      return state.errorCode ? { ok: false, errorCode: state.errorCode } : { ok: true };
    } catch {
      return { ok: false, errorCode: "validation_write_failed" };
    }
  }

  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    const trial = await startTrial(db, session.shop, {
      eligible: shop.shopAddress.countryCodeV2 === ELIGIBLE_COUNTRY,
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false, errorCode: "store_not_supported" };
    if (trial.status !== "active") return { ok: false, errorCode: "trial_unavailable" };
    return { ok: true };
  }

  if (intent === "cancel") return cancelPlan(admin, db, session.shop);
  if (intent === "monthly" || intent === "annual" || intent === "one_time") {
    return subscribe(admin, db, session.shop, request, intent);
  }
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, errorCode: "generic" };
  }

  const result = await writeValidation(admin, db, session.shop, null, intent === "enable");
  if (!result.ok) return { ok: false, errorCode: result.errorCode };

  await recordEvent(db, {
    shopDomain: session.shop,
    name: result.enabled ? "validation_enabled" : "validation_disabled",
    class: "validation",
    metadata: { enabled: result.enabled, schema_version: 2 },
  });
  return { ok: true };
};

async function subscribe(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  request: Request,
  kind: PlanKind,
) {
  try {
    const mutation = await withValidationLock(db, shopDomain, async () => {
      const { shop } = await queryContext(admin);
      if (shop.shopAddress.countryCodeV2 !== ELIGIBLE_COUNTRY) {
        return { ok: false, errorCode: "country_not_eligible" };
      }

      const billing = await readBilling(admin);
      if (billing.oneTime) return { ok: false, errorCode: "one_time_already_active" };
      if (kind === "one_time" && billing.pendingOneTime) {
        return { ok: false, errorCode: "charge_pending" };
      }
      if (requestedRecurringPlanIsActive(billing, kind)) {
        return { ok: false, errorCode: "generic" };
      }

      const today = localDate(shop.ianaTimezone);
      const [trial, storedAccount] = await Promise.all([
        syncTrial(db, shopDomain, { today }),
        readBillingAccount(db, shopDomain),
      ]);
      const account = await syncBillingAccount(db, shopDomain, billing, {
        today,
        timeZone: shop.ianaTimezone,
        pricingGeneration: currentPricingGeneration(trial, storedAccount, today),
        storedAccount,
      });
      const plan = planFor(currentPricingGeneration(trial, account, today), kind);
      if (!plan) return { ok: false, errorCode: "generic" };

      const { confirmationUrl, error } = await createCharge(admin, {
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        interval: plan.interval,
        trialDays: kind === "one_time" ? 0 : remainingTrialDays(trial, today),
        test: BILLING_IS_TEST,
        returnUrl: returnUrlFor(request, shopDomain),
      });

      if (error || !confirmationUrl) return { ok: false, errorCode: "charge_failed" };
      return { ok: true, confirmationUrl };
    });

    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: "charge_failed" };
  }
}

async function cancelPlan(admin: Admin, db: D1Database, shopDomain: string) {
  try {
    const mutation = await withValidationLock(db, shopDomain, async () => {
      const state = await readBilling(admin);
      if (state.oneTime) return { ok: false, errorCode: "one_time_already_active" };
      if (state.pendingOneTime) return { ok: false, errorCode: "charge_pending" };
      if (!state.subscription) return { ok: false, errorCode: "no_subscription" };

      if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
        return { ok: false, errorCode: "cancel_failed" };
      }

      await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
      return { ok: true };
    });
    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: "cancel_failed" };
  }
}
