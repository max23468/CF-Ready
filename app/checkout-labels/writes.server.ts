import type { AppErrorCode } from "../app-error";
import type { Rules } from "../config";
import type { ValidationLockHeartbeat } from "../validation/lock.server";
import type { Admin } from "../validation/types";
import {
  checkoutLabelValuesMatch,
  proposedLabelForSlot,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
  type StoredCheckoutLabelSlot,
} from "./domain";
import {
  automaticFiscalSlots,
  findStoredSlot,
  matchesLastWrite,
  translationInput,
  checkoutLabelsError,
} from "./decisions";
import {
  readStoredCheckoutLabelSlots,
  claimCheckoutLabelSlot,
  saveCheckoutLabelWrite,
} from "./repository.server";
import {
  readCheckoutLabels,
  registerCheckoutLabelTranslations,
  removeCheckoutLabelTranslation,
} from "./shopify.server";

export async function synchronizeFiscalPhase(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  initialSnapshot: CheckoutLabelsSnapshot,
  rules: Rules,
  epoch: string,
  phase: "before_validation" | "after_validation",
  heartbeat: ValidationLockHeartbeat,
): Promise<{ ok: true; written: boolean } | { ok: false; errorCode: AppErrorCode }> {
  let snapshot = initialSnapshot;
  let written = false;
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
          written = true;
          continue;
        }

        const target = proposedLabelForSlot(slot, rules);
        if (!target || checkoutLabelValuesMatch(slot.currentValue, target)) continue;
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
        written = true;
        await Promise.all(
          group.map(({ slot, target }) => saveCheckoutLabelWrite(db, shopDomain, slot, target)),
        );
      }
      return { ok: true, written };
    } catch (error) {
      const errorCode = checkoutLabelsError(error);
      if (errorCode !== "checkout_labels_stale_digest" || attempt === 1) {
        return { ok: false, errorCode };
      }
      snapshot = await readCheckoutLabels(admin);
    }
  }
  return { ok: false, errorCode: "checkout_labels_partial_sync" };
}

export async function restoreOwnedFiscalLabels(
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
