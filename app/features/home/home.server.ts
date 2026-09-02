import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdmin } from "../../admin-auth.server";
import {
  addDays,
  cancelSubscription,
  createCharge,
  currentPricingGeneration,
  localDate,
  readBilling,
  readBillingAccount,
  readComplimentaryEntitlement,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  startTrial,
  syncBillingAccount,
  syncTrial,
} from "../../billing.server";
import {
  ELIGIBLE_COUNTRY,
  messagesAreDefault,
  onboardingCanAutoComplete,
  readConfig,
  reviewIsDue,
} from "../../config";
import { databaseContext, waitUntilContext } from "../../context.server";
import { APP_VERSION, BILLING_IS_TEST } from "../../env.server";
import { dismissMerchantCheckIn, recordEvent } from "../../events.server";
import { resolveLocale } from "../../i18n";
import { planFor, planPrices } from "../../plans.server";
import type { PlanKind } from "../../plans.server";
import { normalizeReviewRequestCode } from "../../reviews";
import { createServerTiming } from "../../server-timing.server";
import { persistShopDisplayName } from "../../shop-profile.server";
import { authenticate } from "../../shopify.server";
import {
  queryContext,
  completeOnboardingAutomatically,
  readHomeState,
  reconcile,
  withValidationLock,
  writeValidation,
} from "../../validation.server";
import type { Admin } from "../../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session } = await timing.measure("auth", () =>
    authenticateAdmin(request, context),
  );
  const db = context.get(databaseContext);

  const statePromise = reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    waitUntil: context.get(waitUntilContext) ?? undefined,
    reportTiming: timing.record,
  });
  const localStatePromise = timing.measure("d1_home", () => readHomeState(db, session.shop));
  const [state, { onboarding, address2Declaration, enabledSince, merchantCheckInDismissed }] =
    await Promise.all([statePromise, localStatePromise]);
  const config = readConfig(state.validation?.metafield?.jsonValue);
  const configured = config.rules.taxCode !== "unmanaged" || config.rules.pec !== "unmanaged";
  let onboardingStatus = onboarding.status;
  if (
    onboardingCanAutoComplete({
      onboarding: onboardingStatus,
      configured,
      entitled: state.entitlement.kind !== "none",
      validationEnabled: state.validationEnabled,
      errorCode: state.errorCode,
    }) &&
    (await completeOnboardingAutomatically(db, session.shop))
  ) {
    onboardingStatus = "completed";
    await recordEvent(db, {
      shopDomain: session.shop,
      name: "onboarding_auto_completed",
      class: "onboarding",
      metadata: { reason: "effective_configuration" },
    });
  }
  const paidAccount =
    state.account?.plan_kind !== "none" &&
    (state.account?.entitlement_status === "active" ||
      state.account?.entitlement_status === "ending");

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
    complimentary: state.complimentary?.status === "active",
    firstChargeAt: remaining > 0 ? addDays(state.today, remaining) : null,
    trialStatus: state.trial?.status ?? null,
    plan: planPrices(currentPricingGeneration(state.trial, state.account, state.today)),
    planKind: state.account?.plan_kind ?? "none",
    periodEnd: state.account?.current_period_end ?? null,
    accountStatus: state.account?.entitlement_status ?? "none",
    creditEstimate: state.creditEstimate,
    errorCode: state.errorCode,
    onboarding: onboardingStatus,
    showMerchantCheckIn: Boolean(
      !state.partnerDevelopment &&
      paidAccount &&
      state.validationEnabled &&
      !state.errorCode &&
      !merchantCheckInDismissed,
    ),
    reviewDue: reviewIsDue(
      {
        onboarding: onboardingStatus,
        validationEnabled: state.validationEnabled,
        errorCode: state.errorCode,
        enabledSince,
        partnerDevelopment: state.partnerDevelopment,
      },
      Date.now(),
    ),
  };
  return data(payload, { headers: { "Server-Timing": timing.header() } });
};

export type HomeData = Awaited<ReturnType<typeof loader>>["data"];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "review_prompt_result") {
    await recordEvent(db, {
      shopDomain: session.shop,
      name: "review_prompt_result",
      class: "support",
      metadata: { reason: normalizeReviewRequestCode(form.get("code")) },
    });
    return { ok: true };
  }

  if (intent === "dismiss_checkin") {
    try {
      return (await dismissMerchantCheckIn(db, session.shop))
        ? { ok: true }
        : { ok: false, errorCode: "generic" };
    } catch {
      return { ok: false, errorCode: "generic" };
    }
  }

  if (intent === "repair") {
    try {
      const state = await reconcile(admin, db, session.shop);
      return state.errorCode ? { ok: false, errorCode: state.errorCode } : { ok: true };
    } catch {
      return { ok: false, errorCode: "validation_write_failed" };
    }
  }

  if (intent === "start_trial") {
    if ((await readComplimentaryEntitlement(db, session.shop))?.status === "active") {
      return { ok: false, errorCode: "one_time_already_active" };
    }
    const { shop } = await queryContext(admin);
    await persistShopDisplayName(db, session.shop, shop.name);
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
    return subscribe(admin, db, session.shop, intent);
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

async function subscribe(admin: Admin, db: D1Database, shopDomain: string, kind: PlanKind) {
  try {
    const mutation = await withValidationLock(db, shopDomain, async () => {
      if ((await readComplimentaryEntitlement(db, shopDomain))?.status === "active") {
        return { ok: false, errorCode: "one_time_already_active" };
      }
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
        returnUrl: returnUrlFor(shopDomain),
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
