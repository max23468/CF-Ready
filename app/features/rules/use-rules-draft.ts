import { useEffect, useMemo, useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import { automaticFiscalWrites } from "../../checkout-labels/decisions";
import type { CheckoutLabelsSnapshot, CheckoutLabelState } from "../../checkout-labels/domain";
import type { Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { setSaveBarVisibility, showToast } from "../../save-bar";
import { useConfigConflict } from "../use-config-conflict";
import {
  blocksAbsentWithoutDelivery,
  mergeRulesFormDraft,
  normalizedFieldsBase,
  normalizesOrders,
  rebaseRulesDraft,
  rulesDraftChanged,
  rulesSaveFields,
  type RulesFormDraft,
} from "./rules-form";
import { labelManagementSaveState } from "./checkout-labels-presentation";

export const RULES_SAVE_BAR = "checkout-rules-save-bar";
export const LABEL_CONFIRM_MODAL = "confirm-checkout-label-management";
type SavedRules = { rules: Rules; configHash: string | null; locale: Locale };
type RulesResult = { ok: boolean; errorCode?: string; labelsErrorCode?: string | null };
type Address2FormMode = NonNullable<CheckoutLabelState["address2FormMode"]>;

export function useRulesDraft(
  saved: SavedRules,
  result: RulesResult | undefined,
  labels: { state: CheckoutLabelState; snapshot: CheckoutLabelsSnapshot | null; loading: boolean },
) {
  const labelState = labels.state;
  const labelSnapshot = labels.snapshot;
  const labelsLoading = labels.loading;
  const send = useSubmit();
  const busy = useNavigation().state !== "idle";
  const t = texts(saved.locale);
  const current = useMemo<RulesFormDraft>(() => ({ rules: saved.rules }), [saved.rules]);
  const errorCode = result?.ok === false ? (result.errorCode ?? null) : null;
  const sync = useConfigConflict({
    current,
    configHash: saved.configHash,
    errorCode,
    result,
    busy,
  });
  const { conflict } = sync;
  const labelsErrorCode =
    result?.ok && "labelsErrorCode" in result && typeof result.labelsErrorCode === "string"
      ? result.labelsErrorCode
      : null;
  const [lastEdit, setLastEdit] = useState<{ result: RulesResult | undefined } | null>(null);
  const changedSinceResult = lastEdit !== null && lastEdit.result === result;
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({ rules: saved.rules });
  const [labelsEnabled, setLabelsEnabled] = useState(labelState.mode !== "off");
  // BFS 4.1.5: la configurazione del campo Interno si salva con la Save Bar, insieme alle regole.
  const [address2Draft, setAddress2Draft] = useState<Address2FormMode | null>(null);
  const address2Dirty = address2Draft !== null && address2Draft !== labelState.address2FormMode;

  const readDraft = (event: { currentTarget: HTMLFormElement }) => {
    const data = new FormData(event.currentTarget);
    setLastEdit({ result });
    setDraft((current) => mergeRulesFormDraft(current, data));
  };

  const savedText = t.rules.saved;
  useEffect(() => {
    if (result?.ok && !labelsErrorCode) showToast(savedText);
  }, [result, labelsErrorCode, savedText]);

  const dirty = rulesDraftChanged(draft.rules, saved.rules);
  const { automaticConfirmationRequired, dirty: labelsDirty } = labelManagementSaveState(
    labelState,
    labelsEnabled,
    errorCode,
  );
  const automaticLabelWrites = labelSnapshot
    ? automaticFiscalWrites(labelSnapshot, draft.rules)
    : [];

  useEffect(
    () => setSaveBarVisibility(RULES_SAVE_BAR, dirty || labelsDirty || address2Dirty),
    [dirty, labelsDirty, address2Dirty],
  );

  const submitSave = (labelsConfirmed: boolean) => {
    if (!sync.canSend()) return;
    sync.markSent(draft);
    send(
      {
        ...rulesSaveFields({
          configHash: sync.configHash(),
          rules: draft.rules,
          labelsEnabled,
          labelsConfirmed,
          labelsRevision: labelSnapshot?.revision,
        }),
        blockAbsentWithoutDelivery: blocksAbsentWithoutDelivery(draft.rules) ? "1" : "0",
        normalizeOrderFields: normalizesOrders(draft.rules) ? "1" : "0",
        normalizeOrderFieldsBase: normalizedFieldsBase(saved.rules),
        ...(address2Dirty && address2Draft ? { address2FormMode: address2Draft } : {}),
      },
      { method: "post" },
    );
  };

  const save = () => {
    if (labelsLoading || !sync.canSend()) return;
    const firstAutomaticWrite =
      labelsEnabled &&
      (labelState.mode === "off" || automaticConfirmationRequired) &&
      automaticLabelWrites.length > 0;
    if (firstAutomaticWrite) {
      const modal = document.getElementById(LABEL_CONFIRM_MODAL) as
        | (HTMLElement & {
            showOverlay?: () => void;
          })
        | null;
      modal?.showOverlay?.();
      return;
    }
    submitSave(false);
  };

  const reapply = () => {
    setDraft(rebaseRulesDraft(sync.base(), draft, current));
    sync.adoptCurrent();
    setFormRevision((revision) => revision + 1);
  };

  const discard = () => {
    sync.adoptCurrent();
    setDraft({ rules: saved.rules });
    setLabelsEnabled(labelState.mode !== "off");
    setAddress2Draft(null);
    setFormRevision((current) => current + 1);
  };

  const changeLabelsEnabled = (enabled: boolean) => {
    setLastEdit({ result });
    setLabelsEnabled(enabled);
  };
  const changeAddress2FormMode = (mode: Address2FormMode) => {
    setLastEdit({ result });
    setAddress2Draft(mode);
  };
  const changeAbsentWithoutDelivery = (checked: boolean) => {
    setLastEdit({ result });
    setDraft((current) => ({ rules: { ...current.rules, blockAbsentWithoutDelivery: checked } }));
  };
  const changeNormalizeOrderFields = (checked: boolean) => {
    setLastEdit({ result });
    setDraft((current) => ({ rules: { ...current.rules, normalizeOrderFields: checked } }));
  };
  return {
    current,
    draft,
    busy,
    conflict,
    errorCode,
    labelsErrorCode,
    dirty,
    labelsDirty: labelsDirty || address2Dirty,
    changedSinceResult,
    formRevision,
    labelsEnabled,
    address2FormMode: address2Draft ?? labelState.address2FormMode,
    automaticLabelWrites,
    readDraft,
    save,
    submitSave,
    reapply,
    discard,
    changeLabelsEnabled,
    changeAddress2FormMode,
    changeAbsentWithoutDelivery,
    changeNormalizeOrderFields,
  };
}
