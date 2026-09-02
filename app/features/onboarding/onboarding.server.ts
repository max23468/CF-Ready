import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticateAdmin } from "../../admin-auth.server";
import { localDate, startTrial } from "../../billing.server";
import {
  address2Declaration,
  ELIGIBLE_COUNTRY,
  oneOf,
  parseOnboardingStep,
  readConfig,
  RULE_MODES,
} from "../../config";
import { databaseContext } from "../../context.server";
import { recordEvent } from "../../events.server";
import { resolveLocale } from "../../i18n";
import { persistShopDisplayName } from "../../shop-profile.server";
import { createServerTiming } from "../../server-timing.server";
import { authenticate } from "../../shopify.server";
import {
  queryContext,
  readAddress2Declaration,
  readOnboarding,
  reconcile,
  saveAddress2Declaration,
  saveOnboarding,
  writeValidation,
} from "../../validation.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const timing = createServerTiming();
  const { admin, session } = await timing.measure("auth", () =>
    authenticateAdmin(request, context),
  );
  const db = context.get(databaseContext);
  const state = await reconcile(admin, db, session.shop, {
    prefetchBilling: true,
    reportTiming: timing.record,
  });
  const validation = state.validation;
  const config = readConfig(validation?.metafield?.jsonValue);
  const [onboarding, address2Declaration] = await Promise.all([
    timing.measure("d1_onboarding", () => readOnboarding(db, session.shop)),
    timing.measure("d1_address", () => readAddress2Declaration(db, session.shop)),
  ]);

  return data(
    {
      locale: resolveLocale(request),
      step: onboarding.step,
      completed: onboarding.status === "completed",
      rules: config.rules,
      errorDisplay: config.errorDisplay,
      messages: config.messages,
      enabled: state.validationEnabled,
      entitlementKind: state.entitlement.kind,
      entitled: state.entitlement.kind !== "none",
      trialStatus: state.trial?.status ?? null,
      address2Declared: address2Declaration !== null,
    },
    { headers: { "Server-Timing": timing.header() } },
  );
};

export type OnboardingData = Awaited<ReturnType<typeof loader>>["data"];

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
    const taxCode = oneOf(RULE_MODES, form.get("taxCode"));
    const pec = oneOf(RULE_MODES, form.get("pec"));
    if (!taxCode || !pec) return { ok: false as const, errorCode: "generic" as const };
    const result = await writeValidation(
      admin,
      db,
      session.shop,
      { rules: { taxCode, pec } },
      null,
    );
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await saveOnboarding(db, session.shop, { status: "in_progress", step: 3 });
    return { ok: true as const };
  }

  if (intent === "start_trial") {
    const { shop } = await queryContext(admin);
    await persistShopDisplayName(db, session.shop, shop.name);
    const trial = await startTrial(db, session.shop, {
      eligible: shop.shopAddress.countryCodeV2 === ELIGIBLE_COUNTRY,
      today: localDate(shop.ianaTimezone),
    });
    if (!trial) return { ok: false as const, errorCode: "store_not_supported" as const };
    if (trial.status !== "active") {
      return { ok: false as const, errorCode: "trial_unavailable" as const };
    }
    return { ok: true as const };
  }

  if (intent !== "finish" && intent !== "activate") {
    return { ok: false as const, errorCode: "generic" as const };
  }

  const declared = address2Declaration(form);
  if (intent === "activate") {
    const result = await writeValidation(admin, db, session.shop, null, true, undefined, declared);
    if (!result.ok) return { ok: false as const, errorCode: result.errorCode };
    await recordEvent(db, {
      shopDomain: session.shop,
      name: "validation_enabled",
      class: "validation",
      metadata: { enabled: true, schema_version: 2 },
    });
  } else if (declared !== null) {
    await saveAddress2Declaration(db, session.shop, declared);
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
