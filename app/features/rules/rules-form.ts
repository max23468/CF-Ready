import type { ErrorDisplay, RuleMode, Rules } from "../../config";

export type RulesFormDraft = {
  rules: Rules;
  errorDisplay: ErrorDisplay;
  address2: boolean;
};

// Il checkbox degli avvisi vive fuori dal form delle regole per non includere il simulatore
// nella Save Bar. Una modifica a CF, PEC o “Interno” deve quindi conservarne il valore corrente.
export function mergeRulesFormDraft(current: RulesFormDraft, data: FormData): RulesFormDraft {
  return {
    rules: {
      taxCode: (data.get("taxCode") as RuleMode) ?? current.rules.taxCode,
      pec: (data.get("pec") as RuleMode) ?? current.rules.pec,
    },
    errorDisplay: current.errorDisplay,
    address2: data.get("address2") !== null,
  };
}
