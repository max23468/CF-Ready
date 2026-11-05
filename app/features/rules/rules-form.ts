import type { PecRuleMode, Rules, TaxCodeRuleMode } from "../../config";

export type RulesFormDraft = {
  rules: Rules;
};

// Il form contiene solo le modalità dei campi: le spunte D-192 e D-206 stanno sotto le
// etichette e aggiornano la bozza da sé, quindi qui si conserva il valore corrente.
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

export function rulesDraftChanged(draft: Rules, saved: Rules) {
  return (
    draft.taxCode !== saved.taxCode ||
    draft.pec !== saved.pec ||
    blocksAbsentWithoutDelivery(draft) !== blocksAbsentWithoutDelivery(saved) ||
    normalizesOrders(draft) !== normalizesOrders(saved)
  );
}

export function rebaseRulesDraft(
  base: RulesFormDraft,
  draft: RulesFormDraft,
  current: RulesFormDraft,
): RulesFormDraft {
  const draftBlocks = blocksAbsentWithoutDelivery(draft.rules);
  const draftNormalizes = normalizesOrders(draft.rules);
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
    },
  };
}
