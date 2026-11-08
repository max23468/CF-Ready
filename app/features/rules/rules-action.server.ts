import type { AppErrorCode } from "../../app-error";
import { oneOf, readConfig, type Rules } from "../../config";
import { ADDRESS2_FORM_MODES } from "../../checkout-labels/domain";
import {
  acceptAddress2Customization,
  acceptCheckoutLabelsCustomization,
  confirmGuidedCheckoutLabels,
  loadCheckoutLabels,
  readCheckoutLabelState,
  restoreAddress2Translations,
  saveAddress2FormMode,
  saveRulesAndCheckoutLabels,
  type RulesAndCheckoutLabelsSaveResult,
} from "../../checkout-labels/service.server";
import {
  finishRulesSave,
  prepareRulesSave,
  resumeOrderNormalization,
  type OrderNormalizationContext,
} from "../../order-normalization/lifecycle.server";
import { reconcile } from "../../validation/reconcile.server";
import { saveValidationConfig } from "../../validation/write.server";
import type { Admin } from "../../admin-graphql";
import type { createServerTiming } from "../../server-timing.server";
import {
  RULES_INTENTS,
  type CheckoutLabelsLoadAction,
  type CheckoutLabelsRefreshAction,
  type RulesIntent,
} from "./rules-intents";
import {
  readLabelsRevision,
  readNormalizedFieldsBase,
  readRuleModes,
  readRulesSaveFields,
} from "./rules-form";

type Timing = ReturnType<typeof createServerTiming>;

type RulesActionContext = OrderNormalizationContext & {
  form: FormData;
  labelScopesGranted: boolean;
  timing?: Timing;
};

const failure = (errorCode: AppErrorCode) => ({ ok: false as const, errorCode });

function slotIds(form: FormData) {
  return form.getAll("slotId").filter((value): value is string => typeof value === "string");
}

function requireLabelScopes(context: RulesActionContext) {
  return context.labelScopesGranted ? null : failure("checkout_labels_scope_required");
}

async function refreshCheckoutLabels(
  context: RulesActionContext,
): Promise<CheckoutLabelsRefreshAction | ReturnType<typeof failure>> {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const modes = readRuleModes(context.form);
  if (!modes) return failure("generic");
  const refreshed = await loadCheckoutLabels(context.admin, context.db, context.shop, modes);
  if (!refreshed.available) return failure(refreshed.errorCode);
  return {
    ok: true,
    refreshed: {
      snapshot: refreshed.snapshot,
      state: refreshed.state,
      guidedConfirmations: refreshed.guidedConfirmations,
    },
  };
}

async function loadCheckoutLabelsForView(
  context: RulesActionContext,
): Promise<CheckoutLabelsLoadAction | ReturnType<typeof failure>> {
  const modes = readRuleModes(context.form);
  if (!modes) return failure("generic");
  if (!context.labelScopesGranted) {
    const state = await readCheckoutLabelState(context.db, context.shop);
    return {
      ok: true,
      loaded: {
        scopeGranted: false,
        snapshot: null,
        state,
        guidedConfirmations: [],
        errorCode: state.mode === "off" ? null : "checkout_labels_scope_required",
      },
    };
  }
  const labels = await loadCheckoutLabels(context.admin, context.db, context.shop, modes);
  return {
    ok: true,
    loaded: {
      scopeGranted: true,
      snapshot: labels.available ? labels.snapshot : null,
      state: labels.state,
      guidedConfirmations: labels.available ? labels.guidedConfirmations : [],
      errorCode: labels.available ? null : labels.errorCode,
    },
  };
}

async function restoreAddress2Labels(context: RulesActionContext) {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const expectedRevision = readLabelsRevision(context.form);
  if (!expectedRevision) return failure("address2_restore_conflict");
  return restoreAddress2Translations(
    context.admin,
    context.db,
    context.shop,
    expectedRevision,
    slotIds(context.form),
  );
}

async function acceptAddress2Labels(context: RulesActionContext) {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const expectedRevision = readLabelsRevision(context.form);
  if (!expectedRevision) return failure("checkout_labels_conflict");
  return acceptAddress2Customization(context.admin, context.db, context.shop, expectedRevision);
}

async function acceptCheckoutLabels(context: RulesActionContext) {
  const expectedRevision = readLabelsRevision(context.form);
  if (context.labelScopesGranted && !expectedRevision) {
    return failure("checkout_labels_conflict");
  }
  return acceptCheckoutLabelsCustomization(
    context.admin,
    context.db,
    context.shop,
    context.labelScopesGranted ? expectedRevision : null,
  );
}

async function confirmGuidedLabels(context: RulesActionContext) {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const expectedRevision = readLabelsRevision(context.form);
  if (!expectedRevision) return failure("checkout_labels_conflict");
  const current = await reconcile(context.admin, context.db, context.shop);
  const rules = readConfig(current.validation?.metafield?.jsonValue).rules;
  return confirmGuidedCheckoutLabels(
    context.admin,
    context.db,
    context.shop,
    rules,
    expectedRevision,
    slotIds(context.form),
  );
}

export async function saveSubmittedRules(
  admin: Admin,
  db: D1Database,
  shop: string,
  rules: Rules,
  form: FormData,
  labelScopesGranted: boolean,
  timing?: Timing,
): Promise<RulesAndCheckoutLabelsSaveResult> {
  const fields = readRulesSaveFields(form);
  if (fields.labelsEnabled && !labelScopesGranted) {
    return failure("checkout_labels_scope_required");
  }
  return labelScopesGranted
    ? saveRulesAndCheckoutLabels(admin, db, shop, { rules, ...fields }, timing)
    : saveValidationConfig(admin, db, shop, {
        update: { rules },
        expectedHash: fields.expectedConfigHash,
        timing,
      });
}

async function saveRules(context: RulesActionContext) {
  const { admin, db, shop, form, labelScopesGranted, timing } = context;
  const modes = readRuleModes(form);
  if (!modes) return failure("generic");
  const blockAbsent = form.get("blockAbsentWithoutDelivery");
  const normalize = form.get("normalizeOrderFields");
  const rules = {
    ...modes,
    ...(blockAbsent === null ? {} : { blockAbsentWithoutDelivery: blockAbsent === "1" }),
    ...(normalize === null ? {} : { normalizeOrderFields: normalize === "1" }),
  };
  const normalizedBefore = readNormalizedFieldsBase(form);
  const normalizationError = await prepareRulesSave(context, rules, normalizedBefore);
  if (normalizationError) return failure(normalizationError);

  const labelsWereEnabled = labelScopesGranted
    ? false
    : (await readCheckoutLabelState(db, shop)).mode !== "off";
  const result = await saveSubmittedRules(admin, db, shop, rules, form, labelScopesGranted, timing);
  const address2FormMode = oneOf(ADDRESS2_FORM_MODES, form.get("address2FormMode"));
  if (result.ok && address2FormMode) await saveAddress2FormMode(db, shop, address2FormMode);

  if (!labelScopesGranted && labelsWereEnabled) {
    return result.ok
      ? { ok: true as const, labelsErrorCode: "checkout_labels_scope_required" as const }
      : result;
  }
  if (!result.ok) return failure(result.errorCode);
  await finishRulesSave(context, rules, normalizedBefore);
  const labelsErrorCode = "labelsErrorCode" in result ? result.labelsErrorCode : null;
  if (labelsErrorCode) return { ok: true as const, labelsErrorCode };
  if (!result.saved) return { ok: true as const };
  const labels = result.labels;
  if (labels && !labels.available) return { ok: true as const, labelsErrorCode: labels.errorCode };
  return {
    ok: true as const,
    saved: {
      ...result.saved,
      labelState: labels?.state ?? (await readCheckoutLabelState(db, shop)),
      labelSnapshot: labels?.snapshot ?? null,
      guidedConfirmations: labels?.guidedConfirmations ?? [],
      // `null` chiede alla pagina la lettura differita delle etichette.
      labelScopesGranted: labels ? true : null,
      labelLoadError: null,
    },
  };
}

async function resumeNormalization(context: RulesActionContext) {
  const errorCode = await resumeOrderNormalization(context);
  return errorCode ? failure(errorCode) : { ok: true as const, resumed: true as const };
}

// Tipo esplicito: l'inferenza del valore di ritorno assorbe gli esiti più ricchi in `{ ok: true }`.
type RulesActionHandler =
  | typeof loadCheckoutLabelsForView
  | typeof refreshCheckoutLabels
  | typeof restoreAddress2Labels
  | typeof acceptAddress2Labels
  | typeof acceptCheckoutLabels
  | typeof confirmGuidedLabels
  | typeof saveRules
  | typeof resumeNormalization;

export function handleRulesAction(
  intent: RulesIntent,
  context: RulesActionContext,
): ReturnType<RulesActionHandler> {
  switch (intent) {
    case RULES_INTENTS.loadCheckoutLabels:
      return loadCheckoutLabelsForView(context);
    case RULES_INTENTS.refreshCheckoutLabels:
      return refreshCheckoutLabels(context);
    case RULES_INTENTS.restoreAddress2Labels:
      return restoreAddress2Labels(context);
    case RULES_INTENTS.acceptAddress2Labels:
      return acceptAddress2Labels(context);
    case RULES_INTENTS.acceptCheckoutLabels:
      return acceptCheckoutLabels(context);
    case RULES_INTENTS.confirmGuidedLabels:
      return confirmGuidedLabels(context);
    case RULES_INTENTS.save:
      return saveRules(context);
    case RULES_INTENTS.resumeOrderNormalization:
      return resumeNormalization(context);
  }
}
