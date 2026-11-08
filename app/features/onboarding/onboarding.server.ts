import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdminTimed } from "../../admin-auth.server";
import { localDate } from "../../billing/domain";
import { startPlanTrial } from "../../billing/plan-commands.server";
import { oneOf, readConfig } from "../../config";
import { databaseContext, webhookQueueContext } from "../../context.server";
import { backfillAfterValidationEnabled } from "../../order-normalization/lifecycle.server";
import { CHECKOUT_LABEL_OPTIONAL_SCOPES } from "../../checkout-labels/domain";
import { loadCheckoutLabels, readCheckoutLabelState } from "../../checkout-labels/service.server";
import { recordEvent } from "../../events.server";
import { saveSubmittedRules } from "../rules/rules-action.server";
import { readRuleModes } from "../rules/rules-form";
import { hasGrantedScopes, queryScopesOrNull } from "../../primitives";
import { resolveLocale } from "../../i18n";
import { persistShopDisplayName } from "../../shop-profile.server";
import { createServerTiming } from "../../server-timing.server";
import { authenticate } from "../../shopify.server";
import { observedConfigHash } from "../../validation/domain";
import { reconcile } from "../../validation/reconcile.server";
import { readOnboarding, saveOnboarding } from "../../validation/repository.server";
import { queryContext } from "../../validation/shopify.server";
import { setValidationEnabled } from "../../validation/write.server";
import { ONBOARDING_INTENTS, ONBOARDING_STEPS, parseOnboardingStep } from "./onboarding-contract";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session, scopes } = await authenticateAdminTimed(request, context, timing);
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: timing.record,
  });
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const [onboarding, scopeDetails, storedLabelState, configHash] = await Promise.all([
    timing.measure("d1_onboarding", () => readOnboarding(db, session.shop)),
    timing.measure("shopify_snapshot", () => queryScopesOrNull(scopes)),
    timing.measure("d1_validation_state", () => readCheckoutLabelState(db, session.shop)),
    observedConfigHash(validation),
  ]);
  const labelScopesGranted = hasGrantedScopes(
    CHECKOUT_LABEL_OPTIONAL_SCOPES,
    scopeDetails?.granted,
  );
  const labels = labelScopesGranted
    ? await timing.measure("shopify_snapshot", () =>
        loadCheckoutLabels(admin, db, session.shop, config.rules),
      )
    : null;

  return data(
    {
      locale: resolveLocale(request),
      step: parseOnboardingStep(new URL(request.url).searchParams.get("step")) ?? onboarding.step,
      completed: onboarding.status === "completed",
      rules: config.rules,
      messages: config.messages,
      enabled: state.validationEnabled,
      entitlementKind: state.entitlement.kind,
      entitled: state.entitlement.kind !== "none",
      trialStatus: state.trial?.status ?? null,
      trialEndsAt: state.trial?.ends_at ?? null,
      errorCode: state.errorCode,
      configHash,
      labelScopesGranted,
      labelState: labels?.state ?? storedLabelState,
      labelSnapshot: labels?.available ? labels.snapshot : null,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export type OnboardingData = Awaited<ReturnType<typeof loader>>["data"];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const db = context.get(databaseContext);
  const form = await request.formData();
  const intent = oneOf(ONBOARDING_INTENTS, form.get("intent"));

  if (intent === "progress") {
    const step = parseOnboardingStep(form.get("step"));
    if (step === null) return { ok: false as const, errorCode: "generic" as const };
    await saveOnboarding(db, session.shop, { status: "in_progress", step });
    return { ok: true as const };
  }

  if (intent === "rules") {
    const rules = readRuleModes(form);
    if (!rules) return { ok: false as const, errorCode: "generic" as const };
    const scopeDetails = await queryScopesOrNull(scopes);
    const result = await saveSubmittedRules(
      admin,
      db,
      session.shop,
      rules,
      form,
      hasGrantedScopes(CHECKOUT_LABEL_OPTIONAL_SCOPES, scopeDetails?.granted),
    );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await saveOnboarding(db, session.shop, {
      status: "in_progress",
      step: ONBOARDING_STEPS.preview,
    });
    return { ok: true as const };
  }

  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    await persistShopDisplayName(db, session.shop, shop.name);
    return startPlanTrial(db, session.shop, localDate(shop.ianaTimezone));
  }

  if (intent !== "finish" && intent !== "activate") {
    return { ok: false as const, errorCode: "generic" as const };
  }

  if (intent === "activate") {
    const result = await setValidationEnabled(admin, db, session.shop, true);
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await backfillAfterValidationEnabled(
      db,
      context.get(webhookQueueContext),
      session.shop,
      result.saved.rules,
    );
  }

  const enabled =
    intent === "activate" ? true : (await readOnboarding(db, session.shop)).validationEnabled;
  await saveOnboarding(db, session.shop, { status: "completed", step: ONBOARDING_STEPS.welcome });
  await recordEvent(db, {
    shopDomain: session.shop,
    name: "onboarding_completed",
    class: "onboarding",
    metadata: { enabled },
  });
  return { ok: true as const };
};
