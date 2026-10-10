import type { AppErrorCode } from "../app-error";
import type { Rules } from "../config";
import {
  checkoutLabelName,
  checkoutLabelValuesMatch,
  observedLabelForSlot,
  proposedLabelForSlot,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
  type StoredCheckoutLabelSlot,
} from "./domain";

export function automaticFiscalSlots(slots: CheckoutLabelSlot[]) {
  return slots.filter(
    (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
  ) as Array<CheckoutLabelSlot & { name: "taxCode" | "pec" }>;
}

export function automaticFiscalWrites(snapshot: CheckoutLabelsSnapshot, rules: Rules) {
  return automaticFiscalSlots(snapshot.slots).filter((slot) => {
    const proposed = proposedLabelForSlot(slot, rules);
    return proposed !== null && !checkoutLabelValuesMatch(slot.currentValue, proposed);
  });
}

export function automaticFiscalWritesNeedConfirmation(
  snapshot: CheckoutLabelsSnapshot,
  stored: StoredCheckoutLabelSlot[],
  rules: Rules,
  epoch: string | null,
) {
  return automaticFiscalWrites(snapshot, rules).some((slot) => {
    const previous = findStoredSlot(stored, slot);
    return !epoch || previous?.managementEpoch !== epoch;
  });
}

// Le conferme guidate mancanti attendono un'azione del merchant in Shopify: non sono un errore
// di sincronizzazione e restano fuori dai codici osservati dal monitor operativo.
export function checkoutLabelsResultError(
  snapshot: CheckoutLabelsSnapshot,
  stored: StoredCheckoutLabelSlot[],
  rules: Rules,
  epoch: string | null,
): AppErrorCode | null {
  const issue = fiscalSnapshotIssue(snapshot, rules);
  if (issue) return issue;
  // Una nuova locale può introdurre slot automatici mai scritti: serve il confronto del
  // merchant, non un errore di sincronizzazione né una scrittura durante la sola lettura.
  const writes = automaticFiscalWrites(snapshot, rules);
  if (writes.some((slot) => epoch && findStoredSlot(stored, slot)?.managementEpoch === epoch)) {
    return "checkout_labels_partial_sync";
  }
  if (writes.length > 0) return "checkout_labels_confirmation_required";
  const confirmed = snapshot.slots
    .filter((slot) => {
      if (slot.capability === "automatic") return false;
      if (slot.name === "taxCode") return rules.taxCode !== "unmanaged";
      if (slot.name === "pec") return rules.pec !== "unmanaged";
      return false;
    })
    .every((slot) => {
      const previous = findStoredSlot(stored, slot);
      return guidedConfirmationIsValid(previous, slot, rules);
    });
  return confirmed ? null : "checkout_labels_confirmation_pending";
}

export function guidedConfirmationIsValid(
  previous: StoredCheckoutLabelSlot | undefined,
  slot: CheckoutLabelSlot,
  rules: Rules,
): previous is StoredCheckoutLabelSlot & { guidedConfirmedAt: string } {
  const observed = observedLabelForSlot(slot);
  return (
    Boolean(previous?.guidedConfirmedAt) &&
    checkoutLabelValuesMatch(previous?.guidedConfirmedValue ?? null, observed) &&
    checkoutLabelValuesMatch(proposedLabelForSlot(slot, rules), observed)
  );
}

export function fiscalSnapshotIssue(
  snapshot: CheckoutLabelsSnapshot,
  rules: Rules,
): AppErrorCode | null {
  const requiredNames = new Set(
    (["taxCode", "pec"] as const).filter((name) => rules[name] !== "unmanaged"),
  );
  const issue = snapshot.issues.find(({ key }) => {
    const name = checkoutLabelName(key);
    return name !== null && requiredNames.has(name as "taxCode" | "pec");
  });
  if (!issue) {
    const hasRequiredLocale = snapshot.slots.some((slot) =>
      requiredNames.has(slot.name as "taxCode" | "pec"),
    );
    if (requiredNames.size > 0 && !hasRequiredLocale) return "checkout_labels_locale_missing";
  }
  return issue?.code ?? null;
}

export function translationInput(slot: CheckoutLabelSlot, value: string) {
  return {
    locale: slot.locale,
    key: slot.key,
    value,
    translatableContentDigest: slot.sourceDigest,
    ...(slot.marketId ? { marketId: slot.marketId } : {}),
  };
}

export function findStoredSlot(stored: StoredCheckoutLabelSlot[], slot: CheckoutLabelSlot) {
  return stored.find(
    (candidate) =>
      candidate.resourceId === slot.resourceId &&
      candidate.key === slot.key &&
      candidate.locale === slot.locale &&
      candidate.marketId === slot.marketId &&
      candidate.kind === slot.kind,
  );
}

export function matchingSlot(slots: CheckoutLabelSlot[], target: CheckoutLabelSlot) {
  return slots.find(
    (slot) =>
      slot.resourceId === target.resourceId &&
      slot.key === target.key &&
      slot.locale === target.locale &&
      slot.marketId === target.marketId &&
      slot.kind === target.kind,
  );
}

export function hasExternalChange(
  slots: CheckoutLabelSlot[],
  stored: StoredCheckoutLabelSlot[],
  epoch: string | null,
) {
  if (!epoch) return false;
  return stored.some((previous) => {
    if (previous.managementEpoch !== epoch || previous.lastWritePresent === null) return false;
    const current = slots.find(
      (slot) =>
        slot.resourceId === previous.resourceId &&
        slot.key === previous.key &&
        slot.locale === previous.locale &&
        slot.marketId === previous.marketId &&
        slot.kind === previous.kind,
    );
    return !matchesLastWrite(current?.currentValue ?? null, previous);
  });
}

export function hasAddress2ObservationChange(
  slots: CheckoutLabelSlot[],
  stored: StoredCheckoutLabelSlot[],
  decision: "pending" | "accepted" | "restored" | "manual_restore_required",
  formMode: CheckoutLabelState["address2FormMode"],
) {
  if (decision !== "accepted" || formMode === null || formMode === "hidden") return false;
  const activeName = formMode === "required" ? "address2" : "optionalAddress2";
  const currentAddressSlots = slots.filter(({ name }) => name === activeName);
  const storedAddressSlots = stored.filter((slot) => {
    const name = checkoutLabelName(slot.key);
    return name === activeName;
  });
  return (
    currentAddressSlots.some((slot) => {
      const previous = findStoredSlot(storedAddressSlots, slot);
      return !previous || previous.lastObservedValue !== observedLabelForSlot(slot);
    }) ||
    storedAddressSlots.some((previous) => {
      const current = slots.find(
        (slot) =>
          slot.resourceId === previous.resourceId &&
          slot.key === previous.key &&
          slot.locale === previous.locale &&
          slot.marketId === previous.marketId &&
          slot.kind === previous.kind,
      );
      return !current && previous.lastObservedValue !== null;
    })
  );
}

export function matchesLastWrite(currentValue: string | null, stored: StoredCheckoutLabelSlot) {
  if (stored.lastWritePresent === null) return true;
  if (!stored.lastWritePresent) return currentValue === null;
  const name = checkoutLabelName(stored.key);
  return name === "taxCode" || name === "pec"
    ? checkoutLabelValuesMatch(currentValue, stored.lastWrittenValue)
    : currentValue === stored.lastWrittenValue;
}

export function checkoutLabelsError(error: unknown): AppErrorCode {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "checkout_labels_stale_digest" ||
    message === "checkout_labels_confirmation_required" ||
    message === "checkout_labels_partial_sync" ||
    message === "checkout_labels_conflict" ||
    message === "checkout_labels_readback_failed" ||
    message === "checkout_labels_locale_missing" ||
    message === "validation_locked"
  ) {
    return message;
  }
  return "checkout_labels_readback_failed";
}
