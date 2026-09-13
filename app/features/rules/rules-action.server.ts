import type { AppErrorCode } from "../../app-error";
import { oneOf, PEC_RULE_MODES, readConfig, TAX_CODE_RULE_MODES } from "../../config";
import { readConfigurationHistoryEntry } from "../../configuration-history.server";
import { ADDRESS2_FORM_MODES } from "../../checkout-labels/domain";
import {
  readCheckoutLabelState,
  saveAddress2FormMode,
} from "../../checkout-labels/repository.server";
import {
  acceptAddress2Customization,
  acceptCheckoutLabelsCustomization,
  confirmGuidedCheckoutLabels,
  loadCheckoutLabels,
  restoreAddress2Translations,
  saveRulesAndCheckoutLabels,
} from "../../checkout-labels/service.server";
import { reconcile, writeValidation } from "../../validation.server";
import type { Admin } from "../../validation/types";
import { RULES_INTENTS, type RulesIntent } from "./rules-intents";

type RulesActionContext = {
  admin: Admin;
  db: D1Database;
  shop: string;
  form: FormData;
  labelScopesGranted: boolean;
};

const failure = (errorCode: AppErrorCode) => ({ ok: false as const, errorCode });

function revision(form: FormData) {
  const value = form.get("labelsRevision");
  return typeof value === "string" && value ? value : null;
}

function slotIds(form: FormData) {
  return form.getAll("slotId").filter((value): value is string => typeof value === "string");
}

function requireLabelScopes(context: RulesActionContext) {
  return context.labelScopesGranted ? null : failure("checkout_labels_scope_required");
}

export async function saveAddress2Mode(db: D1Database, shop: string, form: FormData) {
  const mode = oneOf(ADDRESS2_FORM_MODES, form.get("address2FormMode"));
  if (!mode) return failure("generic");
  await saveAddress2FormMode(db, shop, mode);
  return { ok: true as const };
}

async function restoreConfiguration(context: RulesActionContext) {
  const { admin, db, shop, form, labelScopesGranted } = context;
  const historyId = Number(form.get("historyId"));
  const expectedConfigHash = form.get("configHash");
  if (
    !Number.isSafeInteger(historyId) ||
    historyId <= 0 ||
    typeof expectedConfigHash !== "string"
  ) {
    return failure("generic");
  }
  const snapshot = await readConfigurationHistoryEntry(db, shop, historyId);
  if (!snapshot) return failure("config_conflict");
  const labelState = await readCheckoutLabelState(db, shop);
  const result = labelScopesGranted
    ? await saveRulesAndCheckoutLabels(admin, db, shop, {
        rules: snapshot.rules,
        messages: snapshot.messages,
        expectedConfigHash,
        labelsEnabled: labelState.mode !== "off",
        confirmAutomaticWrite: true,
        expectedLabelsRevision: revision(form),
      })
    : await writeValidation(
        admin,
        db,
        shop,
        { rules: snapshot.rules, messages: snapshot.messages },
        null,
        expectedConfigHash,
      );
  if (!labelScopesGranted && labelState.mode !== "off" && result.ok) {
    return { ok: true as const, labelsErrorCode: "checkout_labels_scope_required" as const };
  }
  return result;
}

async function refreshCheckoutLabels(context: RulesActionContext) {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const taxCode = oneOf(TAX_CODE_RULE_MODES, context.form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, context.form.get("pec"));
  if (!taxCode || !pec) return failure("generic");
  const refreshed = await loadCheckoutLabels(context.admin, context.db, context.shop, {
    taxCode,
    pec,
  });
  if (!refreshed.available) return failure(refreshed.errorCode);
  return {
    ok: true as const,
    refreshed: {
      snapshot: refreshed.snapshot,
      state: refreshed.state,
      guidedConfirmations: refreshed.guidedConfirmations,
    },
  };
}

async function restoreAddress2Labels(context: RulesActionContext) {
  const denied = requireLabelScopes(context);
  if (denied) return denied;
  const expectedRevision = revision(context.form);
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
  const expectedRevision = revision(context.form);
  if (!expectedRevision) return failure("checkout_labels_conflict");
  return acceptAddress2Customization(context.admin, context.db, context.shop, expectedRevision);
}

async function acceptCheckoutLabels(context: RulesActionContext) {
  const expectedRevision = revision(context.form);
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
  const expectedRevision = revision(context.form);
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

async function saveRules(context: RulesActionContext) {
  const { admin, db, shop, form, labelScopesGranted } = context;
  const taxCode = oneOf(TAX_CODE_RULE_MODES, form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, form.get("pec"));
  if (!taxCode || !pec) return failure("generic");

  const labelsEnabled = form.get("labelsEnabled") === "1";
  if (labelsEnabled && !labelScopesGranted) return failure("checkout_labels_scope_required");
  const labelsWereEnabled = labelScopesGranted
    ? false
    : (await readCheckoutLabelState(db, shop)).mode !== "off";
  const expectedConfigHash = (form.get("configHash") as string) || null;
  const result = labelScopesGranted
    ? await saveRulesAndCheckoutLabels(admin, db, shop, {
        rules: { taxCode, pec },
        expectedConfigHash,
        labelsEnabled,
        confirmAutomaticWrite: form.get("labelsConfirmed") === "1",
        expectedLabelsRevision: revision(form),
      })
    : await writeValidation(admin, db, shop, { rules: { taxCode, pec } }, null, expectedConfigHash);

  if (!labelScopesGranted && labelsWereEnabled) {
    return result.ok
      ? { ok: true as const, labelsErrorCode: "checkout_labels_scope_required" as const }
      : result;
  }
  if (!result.ok) return failure(result.errorCode);
  const labelsErrorCode = "labelsErrorCode" in result ? result.labelsErrorCode : null;
  return labelsErrorCode ? { ok: true as const, labelsErrorCode } : { ok: true as const };
}

export function handleRulesAction(
  intent: Exclude<RulesIntent, typeof RULES_INTENTS.saveAddress2FormMode>,
  context: RulesActionContext,
) {
  switch (intent) {
    case RULES_INTENTS.restoreConfiguration:
      return restoreConfiguration(context);
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
  }
}
