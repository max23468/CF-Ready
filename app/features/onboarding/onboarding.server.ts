import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdmin } from "../../admin-auth.server";
import { localDate, startTrial } from "../../billing.server";
import {
  CONFIG_SCHEMA_VERSION,
  oneOf,
  parseOnboardingStep,
  readConfig,
  PEC_RULE_MODES,
  TAX_CODE_RULE_MODES,
} from "../../config";
import { databaseContext } from "../../context.server";
import { readCheckoutLabelState } from "../../checkout-labels/repository.server";
import {
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  loadCheckoutLabels,
  saveRulesAndCheckoutLabels,
} from "../../checkout-labels/service.server";
import { recordEvent } from "../../events.server";
import { resolveLocale } from "../../i18n";
import { persistShopDisplayName } from "../../shop-profile.server";
import { createServerTiming } from "../../server-timing.server";
import { authenticate } from "../../shopify.server";
import {
  queryContext,
  readOnboarding,
  reconcile,
  saveOnboarding,
  observedConfigHash,
  writeValidation,
} from "../../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session, scopes } = await timing.measure("auth", () =>
    authenticateAdmin(request, context),
  );
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: timing.record,
  });
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const [onboarding, scopeDetails, storedLabelState, configHash] = await Promise.all([
    timing.measure("d1_onboarding", () => readOnboarding(db, session.shop)),
    timing.measure("shopify_snapshot", () => scopes.query().catch(() => null)),
    timing.measure("d1_validation_state", () => readCheckoutLabelState(db, session.shop)),
    observedConfigHash(validation),
  ]);
  const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
    scopeDetails?.granted.includes(scope),
  );
  const labels = labelScopesGranted
    ? await timing.measure("shopify_snapshot", () =>
        loadCheckoutLabels(admin, db, session.shop, config.rules),
      )
    : null;

  return data(
    {
      locale: resolveLocale(request),
      step: onboarding.step,
      completed: onboarding.status === "completed",
      rules: config.rules,
      messages: config.messages,
      enabled: state.validationEnabled,
      entitlementKind: state.entitlement.kind,
      entitled: state.entitlement.kind !== "none",
      trialStatus: state.trial?.status ?? null,
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
  const intent = form.get("intent");

  if (intent === "progress" || intent === "back" || intent === "next") {
    const step = parseOnboardingStep(form.get("step"));
    if (step === null) return { ok: false as const, errorCode: "generic" as const };
    await saveOnboarding(db, session.shop, { status: "in_progress", step });
    return { ok: true as const };
  }

  if (intent === "rules") {
    const taxCode = oneOf(TAX_CODE_RULE_MODES, form.get("taxCode"));
    const pec = oneOf(PEC_RULE_MODES, form.get("pec"));
    if (!taxCode || !pec) return { ok: false as const, errorCode: "generic" as const };
    const labelsEnabled = form.get("labelsEnabled") === "1";
    const scopeDetails = await scopes.query().catch(() => null);
    const labelScopesGranted = CHECKOUT_LABEL_OPTIONAL_SCOPES.every((scope) =>
      scopeDetails?.granted.includes(scope),
    );
    if (labelsEnabled && !labelScopesGranted) {
      return { ok: false as const, errorCode: "checkout_labels_scope_required" as const };
    }
    const result = labelScopesGranted
      ? await saveRulesAndCheckoutLabels(admin, db, session.shop, {
          rules: { taxCode, pec },
          expectedConfigHash: (form.get("configHash") as string) || null,
          labelsEnabled,
          confirmAutomaticWrite: form.get("labelsConfirmed") === "1",
          expectedLabelsRevision: (form.get("labelsRevision") as string) || null,
        })
      : await writeValidation(
          admin,
          db,
          session.shop,
          { rules: { taxCode, pec } },
          null,
          (form.get("configHash") as string) || null,
        );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await saveOnboarding(db, session.shop, { status: "in_progress", step: 3 });
    return { ok: true as const };
  }

  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    await persistShopDisplayName(db, session.shop, shop.name);
    const trial = await startTrial(db, session.shop, {
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false as const, errorCode: "trial_unavailable" as const };
    if (trial.status !== "active") {
      return { ok: false as const, errorCode: "trial_unavailable" as const };
    }
    return { ok: true as const };
  }

  if (intent !== "finish" && intent !== "activate") {
    return { ok: false as const, errorCode: "generic" as const };
  }

  if (intent === "activate") {
    const result = await writeValidation(admin, db, session.shop, null, true);
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await recordEvent(db, {
      shopDomain: session.shop,
      name: "validation_enabled",
      class: "validation",
      metadata: { enabled: true, schema_version: CONFIG_SCHEMA_VERSION },
    });
  }

  const enabled =
    intent === "activate" ? true : (await readOnboarding(db, session.shop)).validationEnabled;
  await saveOnboarding(db, session.shop, { status: "completed", step: 1 });
  await recordEvent(db, {
    shopDomain: session.shop,
    name: "onboarding_completed",
    class: "onboarding",
    metadata: { enabled },
  });
  return { ok: true as const };
};
