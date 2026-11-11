import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdminTimed } from "../../admin-auth.server";
import type { Admin } from "../../admin-graphql";
import {
  addDays,
  chargeTrialDays,
  currentPricingGeneration,
  entitlementFor,
  localDate,
  remainingTrialDays,
} from "../../billing/domain";
import {
  cancelOrdinarySubscription,
  requestPlanCharge,
  startPlanTrial,
} from "../../billing/plan-commands.server";
import {
  readBillingAccount,
  readComplimentaryEntitlement,
  readLatestBillingConversion,
  readOneTimeOfferAmount,
  readTrial,
} from "../../billing/repository.server";
import { hasManagedField, messagesAreDefault, oneOf, readConfig } from "../../config";
import { databaseContext, waitUntilContext, webhookQueueContext } from "../../context.server";
import { backfillAfterValidationEnabled } from "../../order-normalization/lifecycle.server";
import { APP_VERSION } from "../../env.server";
import { readCheckoutLabelState } from "../../checkout-labels/service.server";
import { checkoutLabelsStatus } from "../../checkout-labels/domain";
import { dismissMerchantCheckIn, recordEvent } from "../../events.server";
import { resolveLocale } from "../../i18n";
import { planPrices } from "../../plans.server";
import { isCompletedReviewRequest, normalizeReviewRequestCode } from "../../reviews";
import { createServerTiming } from "../../server-timing.server";
import { persistShopDisplayName } from "../../shop-profile.server";
import { authenticate } from "../../shopify.server";
import { withValidationLock } from "../../validation/lock.server";
import { reconcile } from "../../validation/reconcile.server";
import {
  completeOnboardingAutomatically,
  markReviewCompleted,
  readHomeState,
  readStoredShopSnapshot,
} from "../../validation/repository.server";
import { queryContext } from "../../validation/shopify.server";
import { setValidationEnabled } from "../../validation/write.server";
import { HOME_INTENTS } from "./home-intents";
import { onboardingCanAutoComplete, reviewIsDue } from "./home-rules";

// D-167: il documento parte con l'ultimo stato noto in D1 e la riconciliazione Shopify arriva in
// streaming nella stessa risposta. Lo stato salvato non abilita azioni: la UI le
// sblocca solo quando arriva `confirmed`, e le azioni riconciliano comunque prima di scrivere.
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session } = await authenticateAdminTimed(request, context, timing);
  const db = context.get(databaseContext);
  const waitUntil = context.get(waitUntilContext) ?? undefined;
  const shopDomain = session.shop;

  const reconciliation = reconcile(admin, db, shopDomain, {
    prefetchBilling: true,
    waitUntil,
  });
  const [local, checkoutLabelState, stored, oneTimeOffer] = await Promise.all([
    timing.measure("d1_home", () => readHomeState(db, shopDomain)),
    timing.measure("d1_validation_state", () => readCheckoutLabelState(db, shopDomain)),
    timing.measure("d1_commercial", () => readStoredHome(db, shopDomain)),
    readOneTimeOfferAmount(db, shopDomain),
  ]);
  const storedState: HomeInputs = {
    ...stored,
    validationEnabled: local.onboarding.validationEnabled,
    errorCode: local.onboarding.errorCode,
  };
  const base: HomeBase = {
    locale: resolveLocale(request),
    shopDomain,
    timeZone: stored.timeZone,
    local,
    oneTimeOffer,
    checkoutLabels: {
      ...checkoutLabelState,
      status: checkoutLabelsStatus(checkoutLabelState),
    },
  };

  const confirmed = reconciliation.then(async (state) => {
    const config = readConfig(state.validation?.metafield?.jsonValue);
    const onboarding = await completeOnboardingIfReady(db, shopDomain, local, state, config);
    // D-199: se Shopify non risponde sul billing la Home resta sul piano noto in D1, accanto
    // all'avviso che il piano non è stato letto. Passare a "nessun piano" spostava la pagina senza
    // un fatto nuovo; i diritti operativi restano quelli della riconciliazione.
    const commercial = state.billingConfirmed
      ? state
      : { ...state, entitlement: stored.entitlement, complimentary: stored.complimentary };
    return homeView({ ...commercial, config }, base, onboarding, true);
  });
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
  timeZone: string;
  local: Awaited<ReturnType<typeof readHomeState>>;
  oneTimeOffer: number | null;
  checkoutLabels: Awaited<ReturnType<typeof readCheckoutLabelState>> & {
    status: ReturnType<typeof checkoutLabelsStatus>;
  };
};

type HomeInputs = Pick<
  Awaited<ReturnType<typeof reconcile>>,
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

// Il fuso dello store arriva da Shopify e la riconciliazione lo salva in D1; prima della prima
// lettura basta quello italiano, perché CF Ready serve store italiani e la conferma ricalcola la data.
const STORED_TIME_ZONE = "Europe/Rome";

async function readStoredHome(
  db: D1Database,
  shopDomain: string,
): Promise<Omit<HomeInputs, "validationEnabled" | "errorCode"> & { timeZone: string }> {
  const [snapshot, trial, account, complimentary, conversionCredit] = await Promise.all([
    readStoredShopSnapshot(db, shopDomain),
    readTrial(db, shopDomain),
    readBillingAccount(db, shopDomain),
    readComplimentaryEntitlement(db, shopDomain),
    readLatestBillingConversion(db, shopDomain),
  ]);
  const today = localDate(snapshot.timeZone ?? STORED_TIME_ZONE);
  const activeComplimentary = complimentary?.status === "active" ? complimentary : null;
  return {
    countryCode: snapshot.countryCode ?? "IT",
    // Finché Shopify non l'ha detto, lo store non conta come reale: niente check-in al primo paint.
    partnerDevelopment: snapshot.partnerDevelopment ?? true,
    today,
    trial,
    account,
    complimentary: activeComplimentary,
    entitlement: entitlementFor(trial, today, account, activeComplimentary),
    creditEstimate: null,
    conversionCredit,
    config: readConfig(snapshot.config),
    timeZone: snapshot.timeZone ?? STORED_TIME_ZONE,
  };
}

async function completeOnboardingIfReady(
  db: D1Database,
  shopDomain: string,
  local: HomeBase["local"],
  state: Awaited<ReturnType<typeof reconcile>>,
  config: ReturnType<typeof readConfig>,
) {
  const configured = hasManagedField(config.rules);
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
  { locale, shopDomain, timeZone, local, oneTimeOffer, checkoutLabels }: HomeBase,
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
  const chargeDays = chargeTrialDays(state.trial, state.today);
  return {
    locale,
    shopDomain,
    version: APP_VERSION,
    countryCode: state.countryCode,
    validationEnabled: state.validationEnabled,
    validationActiveSince: state.validationEnabled ? local.enabledSince : null,
    lastConfirmedAt: verified ? new Date().toISOString() : local.lastSyncAt,
    timeZone,
    rules: config.rules,
    messagesDefault: messagesAreDefault(config.messages),
    trialEndsAt: state.trial?.ends_at ?? null,
    remaining,
    entitlement: state.entitlement,
    complimentary: state.complimentary?.status === "active",
    firstChargeAt: chargeDays > 0 ? addDays(state.today, chargeDays) : null,
    trialStatus: state.trial?.status ?? null,
    // Il pagamento unico ha solo il prezzo concordato con l'owner (D-221).
    plan: {
      ...planPrices(currentPricingGeneration(state.trial, state.account, state.today)),
      one_time: oneTimeOffer,
    },
    planKind: state.account?.plan_kind ?? "none",
    periodEnd: state.account?.current_period_end ?? null,
    accountStatus: state.account?.entitlement_status ?? "none",
    creditEstimate: state.creditEstimate,
    // Un addebito di test non produce mai un credito reale: la nota resterebbe in verifica per
    // sempre, quindi non si mostra.
    conversionCredit:
      state.conversionCredit &&
      !state.conversionCredit.is_test &&
      !state.conversionCredit.reviewed_at
        ? { status: state.conversionCredit.credit_status }
        : null,
    errorCode: state.errorCode,
    onboarding: onboardingStatus,
    // D-199: deciso già sull'ultimo stato noto, perché la Home lo mostra solo se c'era al primo paint.
    showMerchantCheckIn: Boolean(
      !state.partnerDevelopment &&
      paidAccount &&
      state.validationEnabled &&
      !state.errorCode &&
      !merchantCheckInDismissed,
    ),
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
  const intent = oneOf(HOME_INTENTS, form.get("intent"));

  if (intent === "review_prompt_result") {
    const reason = normalizeReviewRequestCode(form.get("code"));
    if (isCompletedReviewRequest(reason)) await markReviewCompleted(db, session.shop);
    await recordEvent(db, {
      shopDomain: session.shop,
      name: "review_prompt_result",
      class: "support",
      metadata: { reason },
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
    const { shop } = await queryContext(admin);
    await persistShopDisplayName(db, session.shop, shop.name);
    return startPlanTrial(db, session.shop, localDate(shop.ianaTimezone));
  }

  if (intent === "cancel") {
    return underPlanLease(db, session.shop, "cancel_failed", () =>
      cancelOrdinarySubscription(admin, db, session.shop, shopTimeZone(admin)),
    );
  }
  if (intent === "monthly" || intent === "annual" || intent === "one_time") {
    return underPlanLease(db, session.shop, "charge_failed", () =>
      requestPlanCharge(admin, db, session.shop, intent, shopTimeZone(admin)),
    );
  }
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, errorCode: "generic" };
  }

  const result = await setValidationEnabled(admin, db, session.shop, intent === "enable");
  if (!result.ok) return { ok: false, errorCode: result.errorCode };
  if (intent === "enable") {
    await backfillAfterValidationEnabled(
      db,
      context.get(webhookQueueContext),
      session.shop,
      result.saved.rules,
    );
  }
  return { ok: true, enabled: result.enabled };
};

async function underPlanLease<T>(
  db: D1Database,
  shopDomain: string,
  failureCode: string,
  command: () => Promise<T>,
) {
  try {
    const mutation = await withValidationLock(db, shopDomain, command);
    return mutation.acquired ? mutation.result : { ok: false, errorCode: "validation_locked" };
  } catch {
    return { ok: false, errorCode: failureCode };
  }
}

function shopTimeZone(admin: Admin) {
  return async () => (await queryContext(admin)).shop.ianaTimezone;
}
