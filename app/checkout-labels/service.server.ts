import type { AppErrorCode } from "../app-error";
import type { Rules } from "../config";
import { withValidationLock, type ValidationLockHeartbeat } from "../validation/lock.server";
import { writeValidationUnderLock } from "../validation/write.server";
import {
  address2Reference,
  checkoutLabelName,
  checkoutLabelsMode,
  proposedLabelForSlot,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
  type StoredCheckoutLabelSlot,
} from "./domain";
import {
  claimCheckoutLabelSlot,
  enableCheckoutLabels,
  markCheckoutLabelsResult,
  persistCheckoutLabelObservation,
  readCheckoutLabelState,
  readStoredCheckoutLabelSlots,
  saveAddress2Decision,
  saveCheckoutLabelWrite,
  stopCheckoutLabelManagement,
} from "./repository.server";
import {
  readCheckoutLabels,
  registerCheckoutLabelTranslations,
  removeCheckoutLabelTranslation,
} from "./shopify.server";

type Admin = Parameters<typeof readCheckoutLabels>[0];

export const CHECKOUT_LABEL_OPTIONAL_SCOPES = [
  "write_translations",
  "read_locales",
  "read_markets",
] as const;

export type CheckoutLabelsLoadResult =
  | {
      available: true;
      snapshot: CheckoutLabelsSnapshot;
      state: Awaited<ReturnType<typeof readCheckoutLabelState>>;
      externalChange: boolean;
    }
  | {
      available: false;
      state: Awaited<ReturnType<typeof readCheckoutLabelState>>;
      errorCode: AppErrorCode;
    };

export async function loadCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
): Promise<CheckoutLabelsLoadResult> {
  const state = await readCheckoutLabelState(db, shopDomain);
  try {
    const [snapshot, stored] = await Promise.all([
      readCheckoutLabels(admin),
      readStoredCheckoutLabelSlots(db, shopDomain),
    ]);
    applyStoredCapabilities(snapshot, stored);
    const managedExternalChange = hasExternalChange(snapshot.slots, stored, state.managementEpoch);
    const address2ExternalChange = hasAddress2ObservationChange(
      snapshot.slots,
      stored,
      state.address2Decision,
    );
    const externalChange = managedExternalChange || address2ExternalChange;
    await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    if (externalChange) {
      await markCheckoutLabelsResult(db, shopDomain, {
        errorCode: "checkout_labels_conflict",
        synced: false,
        externalChange: address2ExternalChange,
      });
    } else if (state.mode !== "off") {
      await markCheckoutLabelsResult(db, shopDomain, { errorCode: null, synced: true });
    }
    return {
      available: true,
      snapshot,
      state: await readCheckoutLabelState(db, shopDomain),
      externalChange,
    };
  } catch (error) {
    return { available: false, state, errorCode: checkoutLabelsError(error) };
  }
}

export async function saveRulesAndCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  input: {
    rules: Rules;
    expectedConfigHash: string | null;
    address2Declared: boolean | null;
    labelsEnabled: boolean;
    confirmAutomaticWrite: boolean;
    expectedLabelsRevision: string | null;
  },
) {
  const locked = await withValidationLock(db, shopDomain, async (heartbeat) => {
    const state = await readCheckoutLabelState(db, shopDomain);
    const wasEnabled = state.mode !== "off";
    let snapshot: CheckoutLabelsSnapshot | null = null;
    let epoch = state.managementEpoch;

    if (input.labelsEnabled || wasEnabled) {
      try {
        snapshot = await readCheckoutLabels(admin);
        applyStoredCapabilities(snapshot, await readStoredCheckoutLabelSlots(db, shopDomain));
      } catch (error) {
        const errorCode = checkoutLabelsError(error);
        await markCheckoutLabelsResult(db, shopDomain, { errorCode, synced: false });
        return { ok: false as const, errorCode };
      }
      if (input.expectedLabelsRevision && snapshot.revision !== input.expectedLabelsRevision) {
        return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
      }
      await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    }

    if (
      input.labelsEnabled &&
      !wasEnabled &&
      snapshot &&
      automaticFiscalSlots(snapshot.slots).length > 0 &&
      !input.confirmAutomaticWrite
    ) {
      return {
        ok: false as const,
        errorCode: "checkout_labels_confirmation_required" as const,
      };
    }

    if (input.labelsEnabled && !wasEnabled && snapshot) {
      epoch = await enableCheckoutLabels(db, shopDomain, checkoutLabelsMode(snapshot.slots));
    }

    if (input.labelsEnabled && snapshot && epoch) {
      const preflight = await synchronizeFiscalPhase(
        admin,
        db,
        shopDomain,
        snapshot,
        input.rules,
        epoch,
        "before_validation",
        heartbeat,
      );
      if (!preflight.ok) {
        await markCheckoutLabelsResult(db, shopDomain, {
          errorCode: preflight.errorCode,
          synced: false,
        });
        return preflight;
      }
    }

    const validation = await writeValidationUnderLock(
      admin,
      db,
      shopDomain,
      { rules: input.rules },
      null,
      input.expectedConfigHash,
      input.address2Declared,
      heartbeat,
    );
    if (!validation.ok) return validation;

    if (input.labelsEnabled && snapshot && epoch) {
      snapshot = await readCheckoutLabels(admin);
      applyStoredCapabilities(snapshot, await readStoredCheckoutLabelSlots(db, shopDomain));
      const after = await synchronizeFiscalPhase(
        admin,
        db,
        shopDomain,
        snapshot,
        input.rules,
        epoch,
        "after_validation",
        heartbeat,
      );
      if (!after.ok) {
        await markCheckoutLabelsResult(db, shopDomain, {
          mode: "partial",
          errorCode: after.errorCode,
          synced: false,
        });
        return { ok: true as const, labelsErrorCode: after.errorCode };
      }
      const readback = await readCheckoutLabels(admin);
      applyStoredCapabilities(readback, await readStoredCheckoutLabelSlots(db, shopDomain));
      if (!managedFiscalValuesMatch(readback, input.rules)) {
        await markCheckoutLabelsResult(db, shopDomain, {
          mode: "partial",
          errorCode: "checkout_labels_readback_failed",
          synced: false,
        });
        return {
          ok: true as const,
          labelsErrorCode: "checkout_labels_readback_failed" as const,
        };
      }
      await persistCheckoutLabelObservation(db, shopDomain, readback.slots, readback.address2);
      await markCheckoutLabelsResult(db, shopDomain, {
        mode: checkoutLabelsMode(snapshot.slots),
        errorCode: null,
        synced: true,
      });
    } else if (!input.labelsEnabled && wasEnabled && snapshot) {
      const restored = await restoreOwnedFiscalLabels(
        admin,
        db,
        shopDomain,
        snapshot,
        state.managementEpoch,
        heartbeat,
      );
      if (!restored.ok) {
        await markCheckoutLabelsResult(db, shopDomain, {
          mode: "partial",
          errorCode: restored.errorCode,
          synced: false,
        });
        return { ok: true as const, labelsErrorCode: restored.errorCode };
      }
      await stopCheckoutLabelManagement(db, shopDomain);
    }

    return { ok: true as const, labelsErrorCode: null };
  });

  return locked.acquired
    ? locked.result
    : { ok: false as const, errorCode: "validation_locked" as const };
}

export async function restoreAddress2Translations(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  expectedRevision: string,
) {
  try {
    const locked = await withValidationLock(db, shopDomain, async (heartbeat) => {
      const snapshot = await readCheckoutLabels(admin);
      if (snapshot.revision !== expectedRevision) {
        return { ok: false as const, errorCode: "address2_restore_conflict" as const };
      }
      const state = await readCheckoutLabelState(db, shopDomain);
      const epoch = state.managementEpoch ?? crypto.randomUUID();
      const candidates = snapshot.slots.filter(
        (slot) =>
          (slot.name === "address2" || slot.name === "optionalAddress2") &&
          slot.kind !== "source" &&
          slot.currentValue !== null &&
          (slot.kind === "market_translation" ||
            slot.currentValue !== address2Reference(slot.name, slot.family)),
      );

      for (const slot of candidates) {
        if (slot.name !== "address2" && slot.name !== "optionalAddress2") continue;
        if (!(await heartbeat.isHeld())) {
          return { ok: false as const, errorCode: "validation_locked" as const };
        }
        await claimCheckoutLabelSlot(db, shopDomain, slot, epoch);
        if (slot.kind === "market_translation") {
          await removeCheckoutLabelTranslation(admin, slot);
          await saveCheckoutLabelWrite(db, shopDomain, slot, null);
        } else {
          const value = address2Reference(slot.name, slot.family);
          await registerCheckoutLabelTranslations(admin, slot.resourceId, [
            translationInput(slot, value),
          ]);
          await saveCheckoutLabelWrite(db, shopDomain, slot, value);
        }
      }

      const readback = await readCheckoutLabels(admin);
      const consistent = candidates.every((slot) => {
        if (slot.name !== "address2" && slot.name !== "optionalAddress2") return true;
        const current = matchingSlot(readback.slots, slot);
        return slot.kind === "market_translation"
          ? current === undefined
          : current?.currentValue === address2Reference(slot.name, slot.family);
      });
      if (!consistent) {
        return { ok: false as const, errorCode: "checkout_labels_readback_failed" as const };
      }
      await persistCheckoutLabelObservation(db, shopDomain, readback.slots, readback.address2);
      await saveAddress2Decision(
        db,
        shopDomain,
        readback.slots.some(
          (slot) =>
            (slot.name === "address2" || slot.name === "optionalAddress2") &&
            slot.kind === "source" &&
            slot.currentValue !== address2Reference(slot.name, slot.family),
        )
          ? "manual_restore_required"
          : "restored",
      );
      return { ok: true as const };
    });

    if (!locked.acquired) return { ok: false as const, errorCode: "validation_locked" as const };
    return locked.result;
  } catch (error) {
    return { ok: false as const, errorCode: checkoutLabelsError(error) };
  }
}

export async function acceptAddress2Customization(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  expectedRevision: string,
) {
  const snapshot = await readCheckoutLabels(admin);
  if (snapshot.revision !== expectedRevision) {
    return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
  }
  await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
  await saveAddress2Decision(db, shopDomain, "accepted");
  return { ok: true as const };
}

async function synchronizeFiscalPhase(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  initialSnapshot: CheckoutLabelsSnapshot,
  rules: Rules,
  epoch: string,
  phase: "before_validation" | "after_validation",
  heartbeat: ValidationLockHeartbeat,
): Promise<{ ok: true } | { ok: false; errorCode: AppErrorCode }> {
  let snapshot = initialSnapshot;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const stored = await readStoredCheckoutLabelSlots(db, shopDomain);
      const writes = automaticFiscalSlots(snapshot.slots).filter((slot) => {
        const mode = slot.name === "taxCode" ? rules.taxCode : rules.pec;
        return phase === "before_validation"
          ? mode === "required_validated"
          : mode !== "required_validated";
      });
      const pending = new Map<string, Array<{ slot: CheckoutLabelSlot; target: string }>>();
      for (const slot of writes) {
        if (!(await heartbeat.isHeld())) {
          return { ok: false, errorCode: "validation_locked" };
        }
        const previous = findStoredSlot(stored, slot);
        if (previous?.managementEpoch === epoch && !matchesLastWrite(slot.currentValue, previous)) {
          return { ok: false, errorCode: "checkout_labels_conflict" };
        }

        const mode = slot.name === "taxCode" ? rules.taxCode : rules.pec;
        if (mode === "unmanaged") {
          if (previous?.managementEpoch !== epoch) continue;
          await restoreSlot(admin, db, shopDomain, slot, previous);
          continue;
        }

        const target = proposedLabelForSlot(slot, rules);
        if (!target || slot.currentValue === target) continue;
        await claimCheckoutLabelSlot(db, shopDomain, slot, epoch);
        const group = pending.get(slot.resourceId) ?? [];
        group.push({ slot, target });
        pending.set(slot.resourceId, group);
      }
      for (const [resourceId, group] of pending) {
        if (!(await heartbeat.isHeld())) {
          return { ok: false, errorCode: "validation_locked" };
        }
        await registerCheckoutLabelTranslations(
          admin,
          resourceId,
          group.map(({ slot, target }) => translationInput(slot, target)),
        );
        await Promise.all(
          group.map(({ slot, target }) => saveCheckoutLabelWrite(db, shopDomain, slot, target)),
        );
      }
      return { ok: true };
    } catch (error) {
      const errorCode = checkoutLabelsError(error);
      if (errorCode !== "checkout_labels_stale_digest" || attempt === 1) {
        return { ok: false, errorCode };
      }
      snapshot = await readCheckoutLabels(admin);
      applyStoredCapabilities(snapshot, await readStoredCheckoutLabelSlots(db, shopDomain));
    }
  }
  return { ok: false, errorCode: "checkout_labels_partial_sync" };
}

async function restoreOwnedFiscalLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  snapshot: CheckoutLabelsSnapshot,
  epoch: string | null,
  heartbeat: ValidationLockHeartbeat,
) {
  if (!epoch) return { ok: true as const };
  const stored = await readStoredCheckoutLabelSlots(db, shopDomain);
  for (const slot of automaticFiscalSlots(snapshot.slots)) {
    const previous = findStoredSlot(stored, slot);
    if (previous?.managementEpoch !== epoch) continue;
    if (!matchesLastWrite(slot.currentValue, previous)) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    if (!(await heartbeat.isHeld())) {
      return { ok: false as const, errorCode: "validation_locked" as const };
    }
    await restoreSlot(admin, db, shopDomain, slot, previous);
  }
  return { ok: true as const };
}

async function restoreSlot(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  slot: CheckoutLabelSlot,
  previous: StoredCheckoutLabelSlot,
) {
  if (previous.originalPresent && previous.originalValue !== null) {
    await registerCheckoutLabelTranslations(admin, slot.resourceId, [
      translationInput(slot, previous.originalValue),
    ]);
    await saveCheckoutLabelWrite(db, shopDomain, slot, previous.originalValue);
  } else {
    await removeCheckoutLabelTranslation(admin, slot);
    await saveCheckoutLabelWrite(db, shopDomain, slot, null);
  }
}

function automaticFiscalSlots(slots: CheckoutLabelSlot[]) {
  return slots.filter(
    (slot) => slot.capability === "automatic" && (slot.name === "taxCode" || slot.name === "pec"),
  ) as Array<CheckoutLabelSlot & { name: "taxCode" | "pec" }>;
}

function managedFiscalValuesMatch(snapshot: CheckoutLabelsSnapshot, rules: Rules) {
  return automaticFiscalSlots(snapshot.slots).every((slot) => {
    const mode = slot.name === "taxCode" ? rules.taxCode : rules.pec;
    if (mode === "unmanaged") return true;
    return slot.currentValue === proposedLabelForSlot(slot, rules);
  });
}

function translationInput(slot: CheckoutLabelSlot, value: string) {
  return {
    locale: slot.locale,
    key: slot.key,
    value,
    translatableContentDigest: slot.sourceDigest,
    ...(slot.marketId ? { marketId: slot.marketId } : {}),
  };
}

function findStoredSlot(stored: StoredCheckoutLabelSlot[], slot: CheckoutLabelSlot) {
  return stored.find(
    (candidate) =>
      candidate.resourceId === slot.resourceId &&
      candidate.key === slot.key &&
      candidate.locale === slot.locale &&
      candidate.marketId === slot.marketId &&
      candidate.kind === slot.kind,
  );
}

function matchingSlot(slots: CheckoutLabelSlot[], target: CheckoutLabelSlot) {
  return slots.find(
    (slot) =>
      slot.resourceId === target.resourceId &&
      slot.key === target.key &&
      slot.locale === target.locale &&
      slot.marketId === target.marketId &&
      slot.kind === target.kind,
  );
}

function hasExternalChange(
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

function hasAddress2ObservationChange(
  slots: CheckoutLabelSlot[],
  stored: StoredCheckoutLabelSlot[],
  decision: "pending" | "accepted" | "restored" | "manual_restore_required",
) {
  if (decision !== "accepted") return false;
  const currentAddressSlots = slots.filter(
    ({ name }) => name === "address2" || name === "optionalAddress2",
  );
  const storedAddressSlots = stored.filter((slot) => {
    const name = checkoutLabelName(slot.key);
    return name === "address2" || name === "optionalAddress2";
  });
  return (
    currentAddressSlots.some((slot) => {
      const previous = findStoredSlot(storedAddressSlots, slot);
      return !previous || previous.lastObservedValue !== slot.currentValue;
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

function matchesLastWrite(currentValue: string | null, stored: StoredCheckoutLabelSlot) {
  if (stored.lastWritePresent === null) return true;
  return stored.lastWritePresent ? currentValue === stored.lastWrittenValue : currentValue === null;
}

function applyStoredCapabilities(
  snapshot: CheckoutLabelsSnapshot,
  stored: StoredCheckoutLabelSlot[],
) {
  for (const slot of snapshot.slots) {
    if (slot.kind === "source") continue;
    const previous = findStoredSlot(stored, slot);
    if (previous?.capability === "automatic") slot.capability = "automatic";
  }
}

function checkoutLabelsError(error: unknown): AppErrorCode {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "checkout_labels_stale_digest" ||
    message === "checkout_labels_confirmation_required" ||
    message === "checkout_labels_partial_sync" ||
    message === "checkout_labels_conflict" ||
    message === "checkout_labels_readback_failed" ||
    message === "validation_locked"
  ) {
    return message;
  }
  return "checkout_labels_readback_failed";
}
