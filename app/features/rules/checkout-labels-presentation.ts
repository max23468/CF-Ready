import type { Rules } from "../../config";
import {
  classifyAddress2,
  checkoutLabelSlotId,
  checkoutLabelValuesMatch,
  observedLabelForSlot,
  proposedLabelForSlot,
  type Address2FormMode,
  type CheckoutLabelFamily,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
  type CheckoutLabelState,
} from "../../checkout-labels/domain";
import { texts, type Locale } from "../../i18n";

export type FiscalLabelContext = {
  key: string;
  label: string;
  note: string | null;
  language: string;
  marketName: string | null;
  verificationMarkets: string[];
  primary: boolean;
  entries: { name: "taxCode" | "pec"; slot: CheckoutLabelSlot }[];
  guidedSlotIds: string[];
};

function displaySlots(slots: CheckoutLabelSlot[], name: CheckoutLabelSlot["name"], locale: string) {
  const matching = slots.filter((slot) => slot.name === name && slot.locale === locale);
  const base =
    matching.find((slot) => slot.kind === "source") ??
    matching.find((slot) => slot.kind === "global_translation");
  return [base, ...matching.filter((slot) => slot.kind === "market_translation")].filter(
    (slot): slot is CheckoutLabelSlot => Boolean(slot),
  );
}

export function fiscalLabelContexts(
  snapshot: CheckoutLabelsSnapshot,
  rules: Rules,
  locale: Locale,
) {
  const copy = texts(locale).rules.labels;
  return snapshot.locales.flatMap((shopLocale) => {
    const base: FiscalLabelContext = {
      key: `${shopLocale.locale}:global`,
      label: copy.generalText,
      note: null,
      language: shopLocale.family === "it" ? copy.italian : copy.english,
      marketName: null,
      verificationMarkets: [],
      primary: shopLocale.primary,
      entries: [],
      guidedSlotIds: [],
    };
    const baseSlots = new Map<"taxCode" | "pec", CheckoutLabelSlot>();
    const marketSlots = new Map<
      string,
      {
        name: string;
        resolution: CheckoutLabelsSnapshot["markets"][number]["resolution"] | undefined;
        entries: Array<{ name: "taxCode" | "pec"; slot: CheckoutLabelSlot }>;
      }
    >();

    for (const name of ["taxCode", "pec"] as const) {
      const slots = displaySlots(snapshot.slots, name, shopLocale.locale);
      const baseSlot = slots.find((slot) => slot.marketId === null);
      if (!baseSlot) continue;
      baseSlots.set(name, baseSlot);

      for (const slot of slots.filter((candidate) => candidate.marketId !== null)) {
        const resolution = snapshot.markets.find(({ id }) => id === slot.marketId)?.resolution;
        const current = marketSlots.get(slot.marketId!) ?? {
          name: slot.marketName ?? copy.unknownMarket,
          resolution,
          entries: [],
        };
        current.entries.push({ name, slot });
        marketSlots.set(slot.marketId!, current);
      }
    }

    for (const [name, slot] of baseSlots) {
      base.entries.push({ name, slot });
      if (needsManualVerification(slot, rules)) base.guidedSlotIds.push(checkoutLabelSlotId(slot));
    }

    const marketContexts: FiscalLabelContext[] = [];
    for (const [marketId, market] of marketSlots) {
      const isException = market.entries.some(({ name, slot }) => {
        const baseSlot = baseSlots.get(name);
        return (
          baseSlot &&
          !checkoutLabelValuesMatch(observedLabelForSlot(slot), observedLabelForSlot(baseSlot))
        );
      });
      if (!isException) {
        if (market.resolution === "ambiguous") base.verificationMarkets.push(market.name);
        for (const { slot } of market.entries) {
          if (needsManualVerification(slot, rules)) {
            base.guidedSlotIds.push(checkoutLabelSlotId(slot));
          }
        }
        continue;
      }
      marketContexts.push({
        key: `${shopLocale.locale}:${marketId}`,
        label: copy.marketException(market.name),
        note: market.resolution === "ambiguous" ? copy.checkoutCheckRequired : null,
        language: shopLocale.family === "it" ? copy.italian : copy.english,
        marketName: market.name,
        verificationMarkets: [],
        primary: shopLocale.primary,
        entries: market.entries,
        guidedSlotIds: market.entries.flatMap(({ slot }) =>
          needsManualVerification(slot, rules) ? [checkoutLabelSlotId(slot)] : [],
        ),
      });
    }

    const baseNotes = [
      shopLocale.primary ? copy.primary : null,
      !shopLocale.published ? copy.unpublished : null,
      marketSlots.size > 0 && marketContexts.length === 0 ? copy.allMarketsSame : null,
      base.verificationMarkets.length > 0
        ? copy.marketCheckIncluded(base.verificationMarkets)
        : null,
    ].filter(Boolean);
    base.note = baseNotes.length > 0 ? baseNotes.join(" · ") : null;
    return base.entries.length > 0 ? [base, ...marketContexts] : [];
  });
}

function needsManualVerification(slot: CheckoutLabelSlot, rules: Rules) {
  return (
    slot.capability !== "automatic" &&
    ((slot.name === "taxCode" && rules.taxCode !== "unmanaged") ||
      (slot.name === "pec" && rules.pec !== "unmanaged"))
  );
}

function compactAddressSlots(
  slots: CheckoutLabelSlot[],
  name: "address2" | "optionalAddress2",
  locale: string,
) {
  const displayed = displaySlots(slots, name, locale);
  const base = displayed.find((slot) => slot.marketId === null) ?? displayed[0];
  if (!base) return [];
  const baseValue = observedLabelForSlot(base);
  return [
    base,
    ...displayed.filter(
      (slot) => slot.marketId !== null && observedLabelForSlot(slot) !== baseValue,
    ),
  ];
}

export function addressLabelContexts(
  snapshot: CheckoutLabelsSnapshot,
  family: CheckoutLabelFamily,
  formMode: Address2FormMode,
) {
  const contexts: {
    shopLocale: CheckoutLabelsSnapshot["locales"][number];
    slots: CheckoutLabelSlot[];
  }[] = [];
  const name = formMode === "required" ? "address2" : "optionalAddress2";
  for (const shopLocale of snapshot.locales.filter((candidate) => candidate.family === family)) {
    const slots = compactAddressSlots(snapshot.slots, name, shopLocale.locale);
    if (slots.length > 0) contexts.push({ shopLocale, slots });
  }
  return contexts;
}

function restorableAddressSlots(
  snapshot: CheckoutLabelsSnapshot,
  rules: Rules,
  family: CheckoutLabelFamily,
  formMode: Address2FormMode | null,
) {
  if (formMode === "hidden") return [];
  const name = formMode === "required" ? "address2" : "optionalAddress2";
  return snapshot.slots.filter(
    (slot) =>
      formMode !== null &&
      slot.family === family &&
      slot.name === name &&
      slot.kind !== "source" &&
      slot.currentValue !== null &&
      observedLabelForSlot(slot) !== proposedLabelForSlot(slot, rules),
  );
}

export function address2Presentation(
  snapshot: CheckoutLabelsSnapshot | null,
  rules: Rules,
  activeFamily: CheckoutLabelFamily,
  formMode: Address2FormMode | null,
) {
  const activeName =
    formMode === "required" ? "address2" : formMode === "optional" ? "optionalAddress2" : null;
  const activeSlots = snapshot?.slots.filter(
    (slot) => activeName && slot.family === activeFamily && slot.name === activeName,
  );
  const classification =
    formMode && activeSlots?.length ? classifyAddress2(activeSlots).classification : "unknown";
  const restorableSlots = snapshot
    ? restorableAddressSlots(snapshot, rules, activeFamily, formMode)
    : [];
  const sourceRequiresManualRestore = Boolean(
    formMode &&
    snapshot?.slots.some(
      (slot) =>
        slot.family === activeFamily &&
        slot.name === activeName &&
        slot.kind === "source" &&
        slot.currentValue !== proposedLabelForSlot(slot, rules),
    ),
  );
  return { classification, restorableSlots, sourceRequiresManualRestore };
}

export function addressTone(classification: CheckoutLabelState["address2Classification"]) {
  if (classification === "fiscal_conflict") return "critical" as const;
  if (classification === "nonstandard") return "warning" as const;
  if (classification === "expected") return "success" as const;
  return "neutral" as const;
}

export function latestConfirmation(slotIds: string[], confirmations: Map<string, string>) {
  return slotIds
    .flatMap((slotId) => confirmations.get(slotId) ?? [])
    .sort()
    .at(-1);
}
