import type { AppErrorCode } from "../app-error";
import type { CheckoutConfig, Rules } from "../config";
import { withValidationLock, type ValidationLockHeartbeat } from "../validation/lock.server";
import { writeValidationUnderLock, type SavedValidation } from "../validation/write.server";
import { createServerTiming } from "../server-timing.server";
import {
  address2Reference,
  CHECKOUT_LABEL_OPTIONAL_SCOPES,
  checkoutLabelSlotId,
  checkoutLabelValuesMatch,
  checkoutLabelsMode,
  observedLabelForSlot,
  proposedLabelForSlot,
  type CheckoutLabelsSnapshot,
} from "./domain";
import {
  claimCheckoutLabelSlot,
  confirmGuidedCheckoutLabelSlots,
  enableCheckoutLabels,
  markCheckoutLabelsResult,
  persistCheckoutLabelObservation,
  readCheckoutLabelState,
  readStoredCheckoutLabelSlots,
  saveAddress2Decision,
  saveCheckoutLabelsDecision,
  saveCheckoutLabelWrite,
  stopCheckoutLabelManagement,
} from "./repository.server";
import { readCheckoutLabels, registerCheckoutLabelTranslations } from "./shopify.server";

import {
  automaticFiscalWritesNeedConfirmation,
  checkoutLabelsResultError,
  guidedConfirmationIsValid,
  fiscalSnapshotIssue,
  translationInput,
  findStoredSlot,
  matchingSlot,
  hasExternalChange,
  hasAddress2ObservationChange,
  checkoutLabelsError,
} from "./decisions";
import { synchronizeFiscalPhase, restoreOwnedFiscalLabels } from "./writes.server";

type Admin = Parameters<typeof readCheckoutLabels>[0];

export { CHECKOUT_LABEL_OPTIONAL_SCOPES };

export type CheckoutLabelsLoadResult =
  | {
      available: true;
      snapshot: CheckoutLabelsSnapshot;
      state: Awaited<ReturnType<typeof readCheckoutLabelState>>;
      externalChange: boolean;
      guidedConfirmations: Array<{ slotId: string; confirmedAt: string }>;
    }
  | {
      available: false;
      state: Awaited<ReturnType<typeof readCheckoutLabelState>>;
      errorCode: AppErrorCode;
    };

export type CheckoutLabelsReadResult =
  | { ok: true; snapshot: CheckoutLabelsSnapshot }
  | { ok: false; error: unknown };

export async function prefetchCheckoutLabels(admin: Admin): Promise<CheckoutLabelsReadResult> {
  try {
    return { ok: true, snapshot: await readCheckoutLabels(admin) };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function loadCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  rules: Rules,
  prefetched?: CheckoutLabelsReadResult,
): Promise<CheckoutLabelsLoadResult> {
  const state = await readCheckoutLabelState(db, shopDomain);
  try {
    if (prefetched && !prefetched.ok) throw prefetched.error;
    const [snapshot, stored] = await Promise.all([
      prefetched ? Promise.resolve(prefetched.snapshot) : readCheckoutLabels(admin),
      readStoredCheckoutLabelSlots(db, shopDomain),
    ]);
    const managedExternalChange = hasExternalChange(snapshot.slots, stored, state.managementEpoch);
    const address2ExternalChange = hasAddress2ObservationChange(
      snapshot.slots,
      stored,
      state.address2Decision,
      state.address2FormMode,
    );
    if (state.decision === "accepted" && state.acceptedRevision !== snapshot.revision) {
      await saveCheckoutLabelsDecision(db, shopDomain, "pending", null);
    }
    const externalChange = managedExternalChange || address2ExternalChange;
    await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    if (externalChange) {
      await markCheckoutLabelsResult(db, shopDomain, {
        errorCode: "checkout_labels_conflict",
        synced: false,
        externalChange: address2ExternalChange,
      });
    } else if (state.mode !== "off") {
      const errorCode = checkoutLabelsResultError(snapshot, stored, rules, state.managementEpoch);
      await markCheckoutLabelsResult(db, shopDomain, { errorCode, synced: errorCode === null });
    }
    return {
      available: true,
      snapshot,
      state: await readCheckoutLabelState(db, shopDomain),
      externalChange,
      guidedConfirmations: snapshot.slots.flatMap((slot) => {
        const previous = findStoredSlot(stored, slot);
        return guidedConfirmationIsValid(previous, slot, rules)
          ? [{ slotId: checkoutLabelSlotId(slot), confirmedAt: previous.guidedConfirmedAt }]
          : [];
      }),
    };
  } catch (error) {
    return { available: false, state, errorCode: checkoutLabelsError(error) };
  }
}

export async function acceptCheckoutLabelsCustomization(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  expectedRevision: string | null,
) {
  const locked = await withValidationLock(db, shopDomain, async () => {
    const state = await readCheckoutLabelState(db, shopDomain);
    if (state.mode !== "off") {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    if (!expectedRevision) {
      await saveCheckoutLabelsDecision(db, shopDomain, "accepted", null);
      return { ok: true as const };
    }
    const snapshot = await readCheckoutLabels(admin);
    if (snapshot.revision !== expectedRevision) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    await saveCheckoutLabelsDecision(db, shopDomain, "accepted", snapshot.revision);
    return { ok: true as const };
  });
  return locked.acquired
    ? locked.result
    : { ok: false as const, errorCode: "validation_locked" as const };
}

export type RulesAndCheckoutLabelsSaveResult =
  | {
      ok: true;
      saved?: SavedValidation;
      labelsErrorCode?: AppErrorCode | null;
      labels?: CheckoutLabelsLoadResult;
    }
  | { ok: false; errorCode: AppErrorCode };

export async function saveRulesAndCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  input: {
    rules: Rules;
    messages?: CheckoutConfig["messages"];
    expectedConfigHash: string | null;
    labelsEnabled: boolean;
    confirmAutomaticWrite: boolean;
    expectedLabelsRevision: string | null;
  },
  timing = createServerTiming(),
): Promise<RulesAndCheckoutLabelsSaveResult> {
  const locked = await withValidationLock<RulesAndCheckoutLabelsSaveResult>(
    db,
    shopDomain,
    async (heartbeat) => {
      const state = await readCheckoutLabelState(db, shopDomain);
      const wasEnabled = state.mode !== "off";
      let snapshot: CheckoutLabelsSnapshot | null = null;
      let epoch = state.managementEpoch;

      if (input.labelsEnabled || wasEnabled) {
        try {
          snapshot = await timing.measure("shopify_checkout_labels", () =>
            readCheckoutLabels(admin),
          );
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
        snapshot &&
        !input.confirmAutomaticWrite &&
        automaticFiscalWritesNeedConfirmation(
          snapshot,
          await readStoredCheckoutLabelSlots(db, shopDomain),
          input.rules,
          epoch,
        )
      ) {
        return {
          ok: false as const,
          errorCode: "checkout_labels_confirmation_required" as const,
        };
      }

      if (input.labelsEnabled && !wasEnabled && snapshot) {
        epoch = await enableCheckoutLabels(db, shopDomain, checkoutLabelsMode(snapshot.slots));
      }

      const initialIssue = snapshot ? fiscalSnapshotIssue(snapshot, input.rules) : null;
      if (input.labelsEnabled && snapshot && epoch && !initialIssue) {
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
        { rules: input.rules, ...(input.messages ? { messages: input.messages } : {}) },
        null,
        input.expectedConfigHash,
        undefined,
        heartbeat,
        timing,
      );
      if (!validation.ok) return validation;

      if (input.labelsEnabled && snapshot && epoch) {
        const labels = await finishFiscalLabels(
          admin,
          db,
          shopDomain,
          input.rules,
          epoch,
          initialIssue,
          heartbeat,
          timing,
        );
        if (labels.labelsErrorCode)
          return { ok: true as const, labelsErrorCode: labels.labelsErrorCode };
        return {
          ...validation,
          labelsErrorCode: null,
          labels: await loadCheckoutLabels(admin, db, shopDomain, input.rules, {
            ok: true,
            snapshot: labels.snapshot,
          }),
        };
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

      return { ...validation, labelsErrorCode: null };
    },
  );

  return locked.acquired
    ? locked.result
    : { ok: false as const, errorCode: "validation_locked" as const };
}

export async function restoreAddress2Translations(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  expectedRevision: string,
  selectedSlotIds: string[],
) {
  try {
    const locked = await withValidationLock(db, shopDomain, async (heartbeat) => {
      const snapshot = await readCheckoutLabels(admin);
      if (snapshot.revision !== expectedRevision) {
        return { ok: false as const, errorCode: "address2_restore_conflict" as const };
      }
      const state = await readCheckoutLabelState(db, shopDomain);
      const epoch = state.managementEpoch ?? crypto.randomUUID();
      const selected = new Set(selectedSlotIds);
      const candidates = snapshot.slots.filter(
        (slot) =>
          selected.has(checkoutLabelSlotId(slot)) &&
          (slot.name === "address2" || slot.name === "optionalAddress2") &&
          slot.kind !== "source" &&
          slot.currentValue !== null &&
          observedLabelForSlot(slot) !== address2Reference(slot.name, slot.family),
      );
      if (selected.size === 0 || candidates.length !== selected.size) {
        return { ok: false as const, errorCode: "address2_restore_conflict" as const };
      }

      for (const slot of candidates) {
        if (slot.name !== "address2" && slot.name !== "optionalAddress2") continue;
        if (!(await heartbeat.isHeld())) {
          return { ok: false as const, errorCode: "validation_locked" as const };
        }
        await claimCheckoutLabelSlot(db, shopDomain, slot, epoch);
        const value = address2Reference(slot.name, slot.family);
        await registerCheckoutLabelTranslations(admin, slot.resourceId, [
          translationInput(slot, value),
        ]);
        await saveCheckoutLabelWrite(db, shopDomain, slot, value);
      }

      const readback = await readCheckoutLabels(admin);
      const consistent = candidates.every((slot) => {
        if (slot.name !== "address2" && slot.name !== "optionalAddress2") return true;
        const current = matchingSlot(readback.slots, slot);
        return current?.currentValue === address2Reference(slot.name, slot.family);
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
  const locked = await withValidationLock(db, shopDomain, async () => {
    const snapshot = await readCheckoutLabels(admin);
    if (snapshot.revision !== expectedRevision) {
      return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
    }
    await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    await saveAddress2Decision(db, shopDomain, "accepted");
    return { ok: true as const };
  });
  return locked.acquired
    ? locked.result
    : { ok: false as const, errorCode: "validation_locked" as const };
}

export async function confirmGuidedCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  rules: Rules,
  expectedRevision: string,
  selectedSlotIds: string[],
) {
  try {
    const locked = await withValidationLock(db, shopDomain, async () => {
      const snapshot = await readCheckoutLabels(admin);
      if (snapshot.revision !== expectedRevision) {
        return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
      }
      const selected = new Set(selectedSlotIds);
      const slots = snapshot.slots.filter(
        (slot) =>
          selected.has(checkoutLabelSlotId(slot)) &&
          slot.capability !== "automatic" &&
          ((slot.name === "taxCode" && rules.taxCode !== "unmanaged") ||
            (slot.name === "pec" && rules.pec !== "unmanaged")),
      );
      if (selected.size === 0 || slots.length !== selected.size) {
        return { ok: false as const, errorCode: "checkout_labels_conflict" as const };
      }
      if (
        slots.some(
          (slot) =>
            !checkoutLabelValuesMatch(
              proposedLabelForSlot(slot, rules),
              observedLabelForSlot(slot),
            ),
        )
      ) {
        return { ok: false as const, errorCode: "checkout_labels_confirmation_pending" as const };
      }
      await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
      await confirmGuidedCheckoutLabelSlots(db, shopDomain, slots);
      const [stored, state] = await Promise.all([
        readStoredCheckoutLabelSlots(db, shopDomain),
        readCheckoutLabelState(db, shopDomain),
      ]);
      const errorCode = checkoutLabelsResultError(snapshot, stored, rules, state.managementEpoch);
      await markCheckoutLabelsResult(db, shopDomain, {
        mode: state.mode === "off" ? "off" : checkoutLabelsMode(snapshot.slots),
        errorCode,
        synced: errorCode === null,
      });
      return { ok: true as const };
    });
    return locked.acquired
      ? locked.result
      : { ok: false as const, errorCode: "validation_locked" as const };
  } catch (error) {
    return { ok: false as const, errorCode: checkoutLabelsError(error) };
  }
}

async function finishFiscalLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  rules: Rules,
  epoch: string,
  initialIssue: AppErrorCode | null,
  heartbeat: ValidationLockHeartbeat,
  timing: ReturnType<typeof createServerTiming>,
) {
  const snapshot = await timing.measure("shopify_checkout_labels", () => readCheckoutLabels(admin));
  const after = initialIssue
    ? { ok: false as const, errorCode: initialIssue }
    : await synchronizeFiscalPhase(
        admin,
        db,
        shopDomain,
        snapshot,
        rules,
        epoch,
        "after_validation",
        heartbeat,
      );
  if (!after.ok) {
    await persistCheckoutLabelObservation(db, shopDomain, snapshot.slots, snapshot.address2);
    await markCheckoutLabelsResult(db, shopDomain, {
      mode: "partial",
      errorCode: after.errorCode,
      synced: false,
    });
    return { ok: true as const, labelsErrorCode: after.errorCode, snapshot };
  }
  const { readback, errorCode } = await readbackAfterWrites(
    admin,
    db,
    shopDomain,
    rules,
    epoch,
    after.written ? undefined : snapshot,
    timing,
  );
  await persistCheckoutLabelObservation(db, shopDomain, readback.slots, readback.address2);
  if (errorCode) {
    await markCheckoutLabelsResult(db, shopDomain, {
      mode:
        errorCode === "checkout_labels_confirmation_pending"
          ? checkoutLabelsMode(readback.slots)
          : "partial",
      errorCode,
      synced: false,
    });
    return {
      ok: true as const,
      labelsErrorCode: errorCode,
      snapshot: readback,
    };
  }
  await markCheckoutLabelsResult(db, shopDomain, {
    mode: checkoutLabelsMode(snapshot.slots),
    errorCode: null,
    synced: true,
  });
  return { ok: true as const, labelsErrorCode: null, snapshot: readback };
}

// Subito dopo una scrittura Shopify può restituire ancora la traduzione precedente: una
// differenza sulle etichette automatiche si ricontrolla prima di segnalarla come parziale.
const READBACK_RETRY_DELAYS_MS = [400, 1200];

async function readbackAfterWrites(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  rules: Rules,
  epoch: string,
  initial?: CheckoutLabelsSnapshot,
  timing = createServerTiming(),
) {
  for (let attempt = 0; ; attempt += 1) {
    const [readback, stored] = await Promise.all([
      attempt === 0 && initial
        ? Promise.resolve(initial)
        : timing.measure("shopify_checkout_labels", () => readCheckoutLabels(admin)),
      readStoredCheckoutLabelSlots(db, shopDomain),
    ]);
    const errorCode = checkoutLabelsResultError(readback, stored, rules, epoch);
    const delay = READBACK_RETRY_DELAYS_MS[attempt];
    if (errorCode !== "checkout_labels_partial_sync" || delay === undefined) {
      return { readback, errorCode };
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
