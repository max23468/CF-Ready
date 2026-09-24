import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdminTimed } from "../../admin-auth.server";
import {
  addDays,
  cancelSubscription,
  createCharge,
  currentPricingGeneration,
  entitlementFor,
  localDate,
  readBilling,
  readBillingAccount,
  readComplimentaryEntitlement,
  readLatestBillingConversion,
  readTrial,
  recordOrdinaryCancellationIntent,
  requestedRecurringPlanIsActive,
  remainingTrialDays,
  returnUrlFor,
  startTrial,
  syncBillingAccount,
  syncTrial,
  markOrdinaryCancellationConfirmed,
} from "../../billing.server";
import {
  CONFIG_SCHEMA_VERSION,
  messagesAreDefault,
  onboardingCanAutoComplete,
  readConfig,
  reviewIsDue,
} from "../../config";
import { databaseContext, waitUntilContext } from "../../context.server";
import { APP_VERSION, BILLING_IS_TEST } from "../../env.server";
import { readCheckoutLabelState } from "../../checkout-labels/repository.server";
import { checkoutLabelsStatus } from "../../checkout-labels/domain";
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
  readStoredShopSnapshot,
  reconcile,
  withValidationLock,
  writeValidation,
} from "../../validation.server";
import type { Admin } from "../../validation.server";

// D-167: il documento parte con l'ultimo stato noto in D1 e la riconciliazione Shopify arriva in
// streaming nella stessa risposta. Lo stato salvato non abilita azioni: resta `verified: false`
// finché Shopify non conferma, e le azioni riconciliano comunque prima di scrivere.
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session } = await authenticateAdminTimed(request, context, timing);
  const db = context.get(databaseContext);
  const waitUntil = context.get(waitUntilContext) ?? undefined;
  const shopDomain = session.shop;

  // Parte subito: la lettura Shopify corre mentre D1 prepara il primo paint.
  const reconciliation = reconcile(admin, db, shopDomain, {
    prefetchBilling: true,
    waitUntil,
  });
  const [local, checkoutLabelState, stored] = await Promise.all([
    timing.measure("d1_home", () => readHomeState(db, shopDomain)),
    timing.measure("d1_validation_state", () => readCheckoutLabelState(db, shopDomain)),
    timing.measure("d1_commercial", () => readStoredHome(db, shopDomain)),
  ]);
  const storedState: HomeInputs = {
    ...stored,
    validationEnabled: local.onboarding.validationEnabled,
    errorCode: local.onboarding.errorCode,
  };
  const base: HomeBase = {
    locale: resolveLocale(request),
    shopDomain,
    local,
    checkoutLabels: {
      ...checkoutLabelState,
      status: checkoutLabelsStatus(checkoutLabelState),
    },
  };

  const confirmed = reconciliation.then(async (state) => {
    const config = readConfig(state.validation?.metafield?.jsonValue);
    const onboarding = await completeOnboardingIfReady(db, shopDomain, local, state, config);
    return homeView({ ...state, config }, base, onboarding, true);
  });
  // Conversioni billing e completamento dell'onboarding non si fermano se il merchant chiude.
  waitUntil?.(confirmed.catch(() => undefined));

  return data(
    {
      home: homeView(storedState, base, local.onboarding.status, false),
      confirmed,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

type HomeBase = {
  locale: ReturnType<typeof resolveLocale>;
  shopDomain: string;
  local: Awaited<ReturnType<typeof readHomeState>>;
  checkoutLabels: Awaited<ReturnType<typeof readCheckoutLabelState>> & {
    status: ReturnType<typeof checkoutLabelsStatus>;
  };
};

type HomeInputs = Pick<
  Awaited<ReturnType<typeof reconcile>>,
  | "shopName"
  | "countryCode"
  | "partnerDevelopment"
  | "today"
  | "validationEnabled"
  | "trial"
  | "account"
  | "complimentary"
  | "entitlement"
  | "creditEstimate"
  | "conversionCredit"
  | "errorCode"
> & { config: ReturnType<typeof readConfig> };

// Il fuso dello store arriva solo da Shopify: per l'ultimo stato noto basta quello italiano,
// perché CF Ready serve store italiani e la data viene ricalcolata alla conferma.
const STORED_TIME_ZONE = "Europe/Rome";

async function readStoredHome(
  db: D1Database,
  shopDomain: string,
): Promise<Omit<HomeInputs, "validationEnabled" | "errorCode">> {
  const today = localDate(STORED_TIME_ZONE);
  const [snapshot, trial, account, complimentary, conversionCredit] = await Promise.all([
    readStoredShopSnapshot(db, shopDomain),
    readTrial(db, shopDomain),
    readBillingAccount(db, shopDomain),
    readComplimentaryEntitlement(db, shopDomain),
    readLatestBillingConversion(db, shopDomain),
  ]);
  const activeComplimentary = complimentary?.status === "active" ? complimentary : null;
  return {
    shopName: snapshot.displayName ?? shopDomain,
    countryCode: snapshot.countryCode ?? "IT",
    partnerDevelopment: false,
    today,
    trial,
    account,
    complimentary: activeComplimentary,
    entitlement: entitlementFor(trial, today, account, activeComplimentary),
    creditEstimate: null,
    conversionCredit,
    config: readConfig(snapshot.config),
  };
}

async function completeOnboardingIfReady(
  db: D1Database,
  shopDomain: string,
  local: HomeBase["local"],
  state: Awaited<ReturnType<typeof reconcile>>,
  config: ReturnType<typeof readConfig>,
) {
  const configured = config.rules.taxCode !== "unmanaged" || config.rules.pec !== "unmanaged";
  if (
    !onboardingCanAutoComplete({
      onboarding: local.onboarding.status,
      configured,
      entitled: state.entitlement.kind !== "none",
      validationEnabled: state.validationEnabled,
      errorCode: state.errorCode,
    }) ||
    !(await completeOnboardingAutomatically(db, shopDomain))
  ) {
    return local.onboarding.status;
  }
  await recordEvent(db, {
    shopDomain,
    name: "onboarding_auto_completed",
    class: "onboarding",
    metadata: { reason: "effective_configuration" },
  });
  return "completed" as const;
}

function homeView(
  state: HomeInputs,
  { locale, shopDomain, local, checkoutLabels }: HomeBase,
  onboardingStatus: HomeBase["local"]["onboarding"]["status"],
  verified: boolean,
) {
  const { merchantCheckInDismissed, reviewCompleted, enabledSince } = local;
  const config = state.config;
  const paidAccount =
    state.account?.plan_kind !== "none" &&
    (state.account?.entitlement_status === "active" ||
      state.account?.entitlement_status === "ending");

  const remaining = remainingTrialDays(state.trial, state.today);
  return {
    verified,
    locale,
    shopName: state.shopName,
    shopDomain,
    version: APP_VERSION,
    countryCode: state.countryCode,
    validationEnabled: state.validationEnabled,
    rules: config.rules,
    messagesDefault: messagesAreDefault(config.messages),
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
    conversionCredit: state.conversionCredit
      ? {
          estimate:
            state.conversionCredit.credit_estimate_minor === null
              ? null
              : state.conversionCredit.credit_estimate_minor / 100,
          actual:
            state.conversionCredit.credit_amount_minor === null
              ? null
              : Math.abs(state.conversionCredit.credit_amount_minor) / 100,
          currency: state.conversionCredit.credit_currency ?? state.conversionCredit.currency,
          status: state.conversionCredit.credit_status,
        }
      : null,
    errorCode: state.errorCode,
    onboarding: onboardingStatus,
    showMerchantCheckIn: Boolean(
      !state.partnerDevelopment &&
      paidAccount &&
      state.validationEnabled &&
      !state.errorCode &&
      !merchantCheckInDismissed,
    ),
    // La richiesta di recensione è un effetto: parte solo da uno stato confermato.
    reviewDue:
      verified &&
      reviewIsDue(
        {
          onboarding: onboardingStatus,
          validationEnabled: state.validationEnabled,
          errorCode: state.errorCode,
          enabledSince,
          partnerDevelopment: state.partnerDevelopment,
          reviewCompleted,
        },
        Date.now(),
      ),
    checkoutLabels,
  };
}

export type HomeData = ReturnType<typeof homeView>;

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
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false, errorCode: "trial_unavailable" };
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
    metadata: { enabled: result.enabled, schema_version: CONFIG_SCHEMA_VERSION },
  });
  return { ok: true };
};

async function subscribe(admin: Admin, db: D1Database, shopDomain: string, kind: PlanKind) {
  try {
    const mutation = await withValidationLock(db, shopDomain, async () => {
      if ((await readComplimentaryEntitlement(db, shopDomain))?.status === "active") {
        return { ok: false, errorCode: "one_time_already_active" };
      }
      const [{ shop }, billing] = await Promise.all([queryContext(admin), readBilling(admin)]);
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
      const [{ shop }, state] = await Promise.all([queryContext(admin), readBilling(admin)]);
      if (state.oneTime) return { ok: false, errorCode: "one_time_already_active" };
      if (state.pendingOneTime) return { ok: false, errorCode: "charge_pending" };
      if (!state.subscription) return { ok: false, errorCode: "no_subscription" };
      const today = localDate(shop.ianaTimezone);
      if (
        !(await recordOrdinaryCancellationIntent(
          db,
          shopDomain,
          state.subscription,
          today,
          shop.ianaTimezone,
        ))
      ) {
        return { ok: false, errorCode: "cancel_failed" };
      }

      if (await cancelSubscription(admin, state.subscription.id, { prorate: false })) {
        return { ok: false, errorCode: "cancel_failed" };
      }

      await markOrdinaryCancellationConfirmed(db, state.subscription.id);
      await recordEvent(db, { shopDomain, name: "subscription_cancelled", class: "billing" });
      return { ok: true };
    });
    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: "cancel_failed" };
  }
}
