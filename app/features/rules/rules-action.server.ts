import type { AppErrorCode } from "../../app-error";
import { oneOf, PEC_RULE_MODES, readConfig, TAX_CODE_RULE_MODES } from "../../config";
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
  type RulesAndCheckoutLabelsSaveResult,
} from "../../checkout-labels/service.server";
import { reconcile, writeValidation } from "../../validation.server";
import { normalizedOrderFieldNames } from "../../order-normalization/domain";
import { enqueueOrderBackfill } from "../../order-normalization/backfill-queue.server";
import {
  ensureOrderWebhook,
  removeOrderWebhooks,
} from "../../order-normalization/subscription.server";
import type { WebhookJob } from "../../webhooks/webhooks.server";
import type { Admin } from "../../validation/types";
import type { createServerTiming } from "../../server-timing.server";
import { RULES_INTENTS, type CheckoutLabelsLoadAction, type RulesIntent } from "./rules-intents";

type RulesActionContext = {
  admin: Admin;
  db: D1Database;
  shop: string;
  form: FormData;
  labelScopesGranted: boolean;
  orderScopesGranted?: boolean;
  queue?: Queue<WebhookJob>;
  appOrigin?: string;
  orderNormalizationAvailable?: boolean;
  timing?: ReturnType<typeof createServerTiming>;
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

async function loadCheckoutLabelsForView(
  context: RulesActionContext,
): Promise<CheckoutLabelsLoadAction | ReturnType<typeof failure>> {
  const taxCode = oneOf(TAX_CODE_RULE_MODES, context.form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, context.form.get("pec"));
  if (!taxCode || !pec) return failure("generic");
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
  const labels = await loadCheckoutLabels(context.admin, context.db, context.shop, {
    taxCode,
    pec,
  });
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
  const { admin, db, shop, form, labelScopesGranted, timing } = context;
  const taxCode = oneOf(TAX_CODE_RULE_MODES, form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, form.get("pec"));
  if (!taxCode || !pec) return failure("generic");
  const blockAbsent = form.get("blockAbsentWithoutDelivery");
  const normalize = form.get("normalizeOrderFields");
  const rules = {
    taxCode,
    pec,
    ...(blockAbsent === null ? {} : { blockAbsentWithoutDelivery: blockAbsent === "1" }),
    ...(normalize === null ? {} : { normalizeOrderFields: normalize === "1" }),
  };
  // D-206: l'attivazione richiede gli scope ordini; chi li ha revocati dopo può comunque
  // salvare le altre regole.
  const normalizedBefore = new Set(String(form.get("normalizeOrderFieldsBase") ?? "").split(","));
  const normalizationStarts = normalizedOrderFieldNames(rules).some(
    (field) => !normalizedBefore.has(field),
  );
  if (normalizationStarts && !context.orderNormalizationAvailable) return failure("generic");
  if (normalizationStarts && !context.orderScopesGranted) {
    return failure("order_scopes_required");
  }
  // D-211: la sottoscrizione orders/create nasce prima del salvataggio, così un'opzione attiva
  // non resta mai senza webhook; con scope revocati resta da riattivare con un nuovo permesso.
  const normalizes = normalizedOrderFieldNames(rules).length > 0;
  if (normalizes && context.orderScopesGranted && context.appOrigin) {
    try {
      await ensureOrderWebhook(admin, context.appOrigin);
    } catch {
      return failure("order_webhook_failed");
    }
  }

  const labelsEnabled = form.get("labelsEnabled") === "1";
  if (labelsEnabled && !labelScopesGranted) return failure("checkout_labels_scope_required");
  const labelsWereEnabled = labelScopesGranted
    ? false
    : (await readCheckoutLabelState(db, shop)).mode !== "off";
  const expectedConfigHash = (form.get("configHash") as string) || null;
  const result: RulesAndCheckoutLabelsSaveResult = labelScopesGranted
    ? await saveRulesAndCheckoutLabels(
        admin,
        db,
        shop,
        {
          rules,
          expectedConfigHash,
          labelsEnabled,
          confirmAutomaticWrite: form.get("labelsConfirmed") === "1",
          expectedLabelsRevision: revision(form),
        },
        timing,
      )
    : await writeValidation(
        admin,
        db,
        shop,
        { rules },
        null,
        expectedConfigHash,
        undefined,
        timing,
      );
  // La configurazione del campo Interno è una dichiarazione locale: segue la scrittura riuscita.
  const address2FormMode = oneOf(ADDRESS2_FORM_MODES, form.get("address2FormMode"));
  if (result.ok && address2FormMode) await saveAddress2FormMode(db, shop, address2FormMode);

  if (!labelScopesGranted && labelsWereEnabled) {
    return result.ok
      ? { ok: true as const, labelsErrorCode: "checkout_labels_scope_required" as const }
      : result;
  }
  if (!result.ok) return failure(result.errorCode);
  if (!normalizes && [...normalizedBefore].some(Boolean)) {
    // Opzione spenta: niente più consegne inutili. Un errore lascia solo job senza effetto.
    if (context.orderScopesGranted && context.appOrigin) {
      await removeOrderWebhooks(admin, context.appOrigin).catch(() => undefined);
    }
  }
  if (normalizationStarts && context.queue) {
    // La correzione degli ordini esistenti è asincrona: un errore di accodamento non annulla
    // il salvataggio, e i nuovi ordini sono comunque coperti dal webhook.
    await enqueueOrderBackfill(db, context.queue, shop).catch(() => undefined);
  }
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
      // Senza snapshot resta necessaria la lettura differita, per esempio dopo un ripristino.
      labelScopesGranted: labels ? true : null,
      labelLoadError: null,
    },
  };
}

// Dopo aver concesso di nuovo gli scope revocati, recupera gli ordini rimasti indietro. Il
// job verifica da sé che l'opzione sia ancora attiva.
async function resumeOrderNormalization(context: RulesActionContext) {
  if (!context.orderNormalizationAvailable) return failure("generic");
  if (!context.orderScopesGranted) return failure("order_scopes_required");
  if (!context.queue || !context.appOrigin) return failure("generic");
  try {
    await ensureOrderWebhook(context.admin, context.appOrigin);
  } catch {
    return failure("order_webhook_failed");
  }
  await enqueueOrderBackfill(context.db, context.queue, context.shop);
  return { ok: true as const, resumed: true as const };
}

export function handleRulesAction(intent: RulesIntent, context: RulesActionContext) {
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
      return resumeOrderNormalization(context);
  }
}
