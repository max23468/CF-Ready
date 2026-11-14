import {
  oneOf,
  PEC_RULE_MODES,
  TAX_CODE_RULE_MODES,
  type PecRuleMode,
  type Rules,
  type TaxCodeRuleMode,
} from "../../config";
import { normalizedOrderFieldNames } from "../../order-normalization/domain";

export type RulesFormDraft = {
  rules: Rules;
};

export function rulesSaveFields(input: {
  configHash: string | null;
  rules: Pick<Rules, "taxCode" | "pec">;
  labelsEnabled: boolean;
  labelsConfirmed: boolean;
  labelsRevision: string | null | undefined;
}) {
  return {
    configHash: input.configHash ?? "",
    taxCode: input.rules.taxCode,
    pec: input.rules.pec,
    labelsEnabled: input.labelsEnabled ? "1" : "0",
    labelsConfirmed: input.labelsConfirmed ? "1" : "0",
    labelsRevision: input.labelsRevision ?? "",
  };
}

export function readRuleModes(form: FormData) {
  const taxCode = oneOf(TAX_CODE_RULE_MODES, form.get("taxCode"));
  const pec = oneOf(PEC_RULE_MODES, form.get("pec"));
  return taxCode && pec ? { taxCode, pec } : null;
}

export function readLabelsRevision(form: FormData) {
  const value = form.get("labelsRevision");
  return typeof value === "string" && value ? value : null;
}

export function readRulesSaveFields(form: FormData) {
  return {
    expectedConfigHash: (form.get("configHash") as string) || null,
    labelsEnabled: form.get("labelsEnabled") === "1",
    confirmAutomaticWrite: form.get("labelsConfirmed") === "1",
    expectedLabelsRevision: readLabelsRevision(form),
  };
}

export function normalizedFieldsBase(rules: Rules) {
  return normalizedOrderFieldNames(rules).join(",");
}

export function readNormalizedFieldsBase(form: FormData) {
  return new Set(
    String(form.get("normalizeOrderFieldsBase") ?? "")
      .split(",")
      .filter(Boolean),
  );
}

// Il form contiene solo le modalità dei campi: le spunte D-192, D-206 e D-223 aggiornano la
// bozza da sé, quindi qui si conserva il valore corrente.
export function mergeRulesFormDraft(current: RulesFormDraft, data: FormData): RulesFormDraft {
  return {
    rules: {
      ...current.rules,
      taxCode: (data.get("taxCode") as TaxCodeRuleMode) ?? current.rules.taxCode,
      pec: (data.get("pec") as PecRuleMode) ?? current.rules.pec,
    },
  };
}

export function blocksAbsentWithoutDelivery(rules: Rules) {
  return rules.blockAbsentWithoutDelivery === true;
}

export function normalizesOrders(rules: Rules) {
  return rules.normalizeOrderFields === true;
}

export function b2bFieldsOptional(rules: Rules) {
  return rules.b2bFieldsOptional === true;
}

export function rulesDraftChanged(draft: Rules, saved: Rules) {
  return (
    draft.taxCode !== saved.taxCode ||
    draft.pec !== saved.pec ||
    blocksAbsentWithoutDelivery(draft) !== blocksAbsentWithoutDelivery(saved) ||
    normalizesOrders(draft) !== normalizesOrders(saved) ||
    b2bFieldsOptional(draft) !== b2bFieldsOptional(saved)
  );
}

export function rebaseRulesDraft(
  base: RulesFormDraft,
  draft: RulesFormDraft,
  current: RulesFormDraft,
): RulesFormDraft {
  const draftBlocks = blocksAbsentWithoutDelivery(draft.rules);
  const draftNormalizes = normalizesOrders(draft.rules);
  const draftB2bOptional = b2bFieldsOptional(draft.rules);
  return {
    rules: {
      taxCode:
        draft.rules.taxCode === base.rules.taxCode ? current.rules.taxCode : draft.rules.taxCode,
      pec: draft.rules.pec === base.rules.pec ? current.rules.pec : draft.rules.pec,
      blockAbsentWithoutDelivery:
        draftBlocks === blocksAbsentWithoutDelivery(base.rules)
          ? blocksAbsentWithoutDelivery(current.rules)
          : draftBlocks,
      normalizeOrderFields:
        draftNormalizes === normalizesOrders(base.rules)
          ? normalizesOrders(current.rules)
          : draftNormalizes,
      b2bFieldsOptional:
        draftB2bOptional === b2bFieldsOptional(base.rules)
          ? b2bFieldsOptional(current.rules)
          : draftB2bOptional,
    },
  };
}
