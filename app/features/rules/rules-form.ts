import type { ErrorDisplay, RuleMode, Rules } from "../../config";

export type RulesFormDraft = {
  rules: Rules;
  errorDisplay: ErrorDisplay;
  address2: boolean;
};

export function mergeRulesFormDraft(current: RulesFormDraft, data: FormData): RulesFormDraft {
  return {
    rules: {
      taxCode: (data.get("taxCode") as RuleMode) ?? current.rules.taxCode,
      pec: (data.get("pec") as RuleMode) ?? current.rules.pec,
    },
    errorDisplay: data.get("errorDisplay") ? "preventive" : "inline",
    address2: data.get("address2") !== null,
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
    errorDisplay:
      draft.errorDisplay === base.errorDisplay ? current.errorDisplay : draft.errorDisplay,
    address2: draft.address2 === base.address2 ? current.address2 : draft.address2,
  };
}
