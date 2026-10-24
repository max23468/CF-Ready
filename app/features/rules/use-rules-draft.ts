import { useEffect, useRef, useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import {
  checkoutLabelValuesMatch,
  proposedLabelForSlot,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
} from "../../checkout-labels/domain";
import type { Rules } from "../../config";
import { texts, type Locale } from "../../i18n";
import { setSaveBarVisibility, showToast } from "../../save-bar";
import {
  blocksAbsentWithoutDelivery,
  mergeRulesFormDraft,
  rebaseRulesDraft,
  rulesDraftChanged,
  type RulesFormDraft,
} from "./rules-form";
import { labelManagementSaveState } from "./checkout-labels-presentation";

export const RULES_SAVE_BAR = "checkout-rules-save-bar";
export const LABEL_CONFIRM_MODAL = "confirm-checkout-label-management";
type SavedRules = { rules: Rules; configHash: string | null; locale: Locale };
type RulesResult = { ok: boolean; errorCode?: string; labelsErrorCode?: string | null };

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
  const current = { rules: saved.rules };
  const baseRef = useRef(current);
  const sentRef = useRef<RulesFormDraft | null>(null);
  const baseHash = useRef(saved.configHash);
  const [resolvedConflict, setResolvedConflict] = useState(false);
  const errorCode = result?.ok === false ? (result.errorCode ?? null) : null;
  const conflict = errorCode === "config_conflict" && !resolvedConflict;
  const labelsErrorCode =
    result?.ok && "labelsErrorCode" in result && typeof result.labelsErrorCode === "string"
      ? result.labelsErrorCode
      : null;
  const [lastEdit, setLastEdit] = useState<{ result: RulesResult | undefined } | null>(null);
  const changedSinceResult = lastEdit !== null && lastEdit.result === result;
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState({ rules: saved.rules });
  const [labelsEnabled, setLabelsEnabled] = useState(labelState.mode !== "off");

  // Un solo ascoltatore sul form delle impostazioni. Il simulatore è deliberatamente fuori:
  // i suoi valori sono locali e non devono rendere sporca la configurazione del merchant.
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
  const automaticLabelWrites =
    labelSnapshot?.slots.flatMap((slot) => {
      if (slot.capability !== "automatic" || (slot.name !== "taxCode" && slot.name !== "pec")) {
        return [];
      }
      const proposed = proposedLabelForSlot(slot, draft.rules);
      if (proposed === null || checkoutLabelValuesMatch(proposed, slot.currentValue)) return [];
      return [{ slot, proposed }];
    }) ?? [];

  useEffect(() => setSaveBarVisibility(RULES_SAVE_BAR, dirty || labelsDirty), [dirty, labelsDirty]);

  const submitSave = (labelsConfirmed: boolean) => {
    if (busy || conflict || sentRef.current) return;
    sentRef.current = draft;
    setResolvedConflict(false);
    send(
      {
        configHash: baseHash.current ?? "",
        taxCode: draft.rules.taxCode,
        pec: draft.rules.pec,
        blockAbsentWithoutDelivery: blocksAbsentWithoutDelivery(draft.rules) ? "1" : "0",
        labelsEnabled: labelsEnabled ? "1" : "0",
        labelsConfirmed: labelsConfirmed ? "1" : "0",
        labelsRevision: labelSnapshot?.revision ?? "",
      },
      { method: "post" },
    );
  };

  const save = () => {
    if (busy || labelsLoading || conflict || sentRef.current) return;
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

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    sentRef.current = null;
    if (result.ok) {
      baseRef.current = { rules: saved.rules };
      baseHash.current = saved.configHash;
    }
  }, [result, saved.rules, saved.configHash, busy]);

  const reapply = () => {
    setDraft(rebaseRulesDraft(baseRef.current, draft, current));
    baseRef.current = current;
    baseHash.current = saved.configHash;
    setResolvedConflict(true);
    setFormRevision((revision) => revision + 1);
  };

  const discard = () => {
    baseRef.current = current;
    baseHash.current = saved.configHash;
    setResolvedConflict(true);
    setDraft({ rules: saved.rules });
    setLabelsEnabled(labelState.mode !== "off");
    setFormRevision((current) => current + 1);
  };

  const changeLabelsEnabled = (enabled: boolean) => {
    setLastEdit({ result });
    setLabelsEnabled(enabled);
  };
  const changeAbsentWithoutDelivery = (checked: boolean) => {
    setLastEdit({ result });
    setDraft((current) => ({ rules: { ...current.rules, blockAbsentWithoutDelivery: checked } }));
  };
  return {
    current,
    draft,
    busy,
    conflict,
    errorCode,
    labelsErrorCode,
    dirty,
    labelsDirty,
    changedSinceResult,
    formRevision,
    labelsEnabled,
    automaticLabelWrites,
    readDraft,
    save,
    submitSave,
    reapply,
    discard,
    changeLabelsEnabled,
    changeAbsentWithoutDelivery,
  };
}
