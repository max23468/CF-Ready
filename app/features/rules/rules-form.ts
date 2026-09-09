import type { PecRuleMode, Rules, TaxCodeRuleMode } from "../../config";

export type RulesFormDraft = {
  rules: Rules;
};

export function mergeRulesFormDraft(current: RulesFormDraft, data: FormData): RulesFormDraft {
  return {
    rules: {
      taxCode: (data.get("taxCode") as TaxCodeRuleMode) ?? current.rules.taxCode,
      pec: (data.get("pec") as PecRuleMode) ?? current.rules.pec,
    },
  };
}

export function rebaseRulesDraft(
  base: RulesFormDraft,
  draft: RulesFormDraft,
  current: RulesFormDraft,
): RulesFormDraft {
  return {
    rules: {
      taxCode:
        draft.rules.taxCode === base.rules.taxCode ? current.rules.taxCode : draft.rules.taxCode,
      pec: draft.rules.pec === base.rules.pec ? current.rules.pec : draft.rules.pec,
    },
  };
}
