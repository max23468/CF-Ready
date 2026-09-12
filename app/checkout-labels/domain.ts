import type { PecRuleMode, Rules, TaxCodeRuleMode } from "../config";

export const CHECKOUT_LABEL_OPTIONAL_SCOPES = [
  "write_translations",
  "read_locales",
  "read_markets",
] as const;

export const CHECKOUT_LABEL_KEYS = {
  taxCode: "shopify.checkout.localized_fields.additional_information.tax_credential_it",
  pec: "shopify.checkout.localized_fields.additional_information.tax_email_it",
  address2: "shopify.checkout.contact.address2_label",
  optionalAddress2: "shopify.checkout.contact.optional_address2_label",
} as const;

export type CheckoutLabelName = keyof typeof CHECKOUT_LABEL_KEYS;
export type CheckoutLabelKey = (typeof CHECKOUT_LABEL_KEYS)[CheckoutLabelName];
export type CheckoutLabelFamily = "it" | "en";
export type CheckoutLabelCapability = "read_only" | "guided" | "automatic";
export type CheckoutLabelSlotKind = "source" | "global_translation" | "market_translation";
export type CheckoutLabelsMode = "off" | "guided" | "automatic" | "partial";
export type CheckoutLabelsStatus = "synced" | "action_required" | "scope_required" | "unknown";
export type CheckoutLabelsDecision = "pending" | "accepted";
export type Address2Classification = "unknown" | "expected" | "nonstandard" | "fiscal_conflict";
export type Address2Decision = "pending" | "accepted" | "restored" | "manual_restore_required";
export type Address2FormMode = "required" | "optional";

export type CheckoutLabelLocale = {
  locale: string;
  family: CheckoutLabelFamily;
  name: string;
  primary: boolean;
  published: boolean;
};

export type CheckoutLabelMarket = {
  id: string;
  name: string;
  defaultLocale: string | null;
  locales: string[];
  resolution: "direct" | "inherited" | "ambiguous";
};

export type CheckoutLabelIssue = {
  code: "checkout_labels_resource_missing" | "checkout_labels_resource_ambiguous";
  key: CheckoutLabelKey;
};

export type CheckoutLabelSlot = {
  resourceId: string;
  key: CheckoutLabelKey;
  name: CheckoutLabelName;
  locale: string;
  family: CheckoutLabelFamily;
  marketId: string | null;
  marketName: string | null;
  kind: CheckoutLabelSlotKind;
  capability: CheckoutLabelCapability;
  currentValue: string | null;
  inheritedValue: string | null;
  sourceValue: string;
  sourceDigest: string;
  outdated: boolean;
};

export type CheckoutLabelsSnapshot = {
  locales: CheckoutLabelLocale[];
  markets: CheckoutLabelMarket[];
  slots: CheckoutLabelSlot[];
  issues: CheckoutLabelIssue[];
  revision: string;
  address2: {
    classification: Address2Classification;
    hasMarketOverride: boolean;
  };
};

export type CheckoutLabelState = {
  mode: CheckoutLabelsMode;
  managementEpoch: string | null;
  enabledAt: string | null;
  lastSyncAt: string | null;
  lastErrorCode: string | null;
  decision: CheckoutLabelsDecision;
  acceptedRevision: string | null;
  reviewedAt: string | null;
  address2Classification: Address2Classification;
  address2HasMarketOverride: boolean;
  address2ExternalChangeAt: string | null;
  address2Decision: Address2Decision;
  address2ReviewedAt: string | null;
  address2FormMode: Address2FormMode | null;
};

export type StoredCheckoutLabelSlot = {
  resourceId: string;
  key: CheckoutLabelKey;
  locale: string;
  marketId: string | null;
  kind: CheckoutLabelSlotKind;
  capability: CheckoutLabelCapability;
  managementEpoch: string | null;
  originalPresent: boolean;
  originalValue: string | null;
  lastWritePresent: boolean | null;
  lastWrittenValue: string | null;
  sourceDigest: string;
  lastObservedValue: string | null;
  lastObservedAt: string;
  guidedConfirmedValue: string | null;
  guidedConfirmedAt: string | null;
};

const DEFAULT_LABELS = {
  it: {
    taxCode: {
      optional_validated: "Codice fiscale (facoltativo)",
      required_validated: "Codice fiscale",
    },
    pec: {
      optional_validated: "PEC (facoltativa)",
      required_validated: "PEC",
      required_when_company: "PEC (obbligatoria per aziende)",
    },
    address2: "Interno",
    optionalAddress2: "Interno, scala, ecc. (facoltativo)",
  },
  en: {
    taxCode: {
      optional_validated: "Italian tax code (optional)",
      required_validated: "Italian tax code",
    },
    pec: {
      optional_validated: "Certified email address (PEC) (optional)",
      required_validated: "Certified email address (PEC)",
      required_when_company: "Certified email address (PEC) (required for companies)",
    },
    address2: "Apartment, suite, etc.",
    optionalAddress2: "Apartment, suite, etc. (optional)",
  },
} as const;

const NAME_BY_KEY = new Map<CheckoutLabelKey, CheckoutLabelName>(
  Object.entries(CHECKOUT_LABEL_KEYS).map(([name, key]) => [key, name as CheckoutLabelName]),
);

export function checkoutLabelName(key: string): CheckoutLabelName | null {
  return NAME_BY_KEY.get(key as CheckoutLabelKey) ?? null;
}

export function checkoutLabelFamily(locale: string): CheckoutLabelFamily | null {
  const language = locale.toLowerCase().split("-")[0];
  return language === "it" || language === "en" ? language : null;
}

export function checkoutLabelCopy(
  name: "taxCode" | "pec",
  family: CheckoutLabelFamily,
  mode: TaxCodeRuleMode | PecRuleMode,
): string | null {
  if (mode === "unmanaged") return null;
  if (name === "taxCode") {
    return mode === "required_when_company"
      ? DEFAULT_LABELS[family].taxCode.required_validated
      : DEFAULT_LABELS[family].taxCode[mode];
  }
  return DEFAULT_LABELS[family].pec[mode];
}

export function address2Reference(
  name: "address2" | "optionalAddress2",
  family: CheckoutLabelFamily,
) {
  return DEFAULT_LABELS[family][name];
}

export function proposedLabelForSlot(slot: CheckoutLabelSlot, rules: Rules) {
  if (slot.name === "taxCode") return checkoutLabelCopy("taxCode", slot.family, rules.taxCode);
  if (slot.name === "pec") return checkoutLabelCopy("pec", slot.family, rules.pec);
  return address2Reference(slot.name, slot.family);
}

export function observedLabelForSlot(slot: CheckoutLabelSlot) {
  return slot.currentValue ?? slot.inheritedValue ?? slot.sourceValue;
}

export function checkoutLabelSlotId(slot: CheckoutLabelSlot) {
  return JSON.stringify([slot.resourceId, slot.key, slot.locale, slot.marketId, slot.kind]);
}

export function automaticCheckoutLabelCapability(
  name: CheckoutLabelName,
  kind: CheckoutLabelSlotKind,
  locale: CheckoutLabelLocale,
): CheckoutLabelCapability {
  return (name === "taxCode" || name === "pec") &&
    kind === "global_translation" &&
    locale.locale === "en" &&
    !locale.primary
    ? "automatic"
    : kind === "source"
      ? "read_only"
      : "guided";
}

export function classifyAddress2(slots: CheckoutLabelSlot[]) {
  const addressSlots = slots.filter(
    (slot): slot is CheckoutLabelSlot & { name: "address2" | "optionalAddress2" } =>
      slot.name === "address2" || slot.name === "optionalAddress2",
  );
  if (addressSlots.length === 0) {
    return { classification: "unknown" as const, hasMarketOverride: false };
  }

  let nonstandard = false;
  let fiscalConflict = false;
  for (const slot of addressSlots) {
    const value = slot.currentValue;
    if (value === null) continue;
    const reference = address2Reference(slot.name, slot.family);
    if (normalizeLabel(value) !== normalizeLabel(reference)) nonstandard = true;
    if (containsFiscalMeaning(value)) fiscalConflict = true;
  }

  return {
    classification: fiscalConflict
      ? ("fiscal_conflict" as const)
      : nonstandard
        ? ("nonstandard" as const)
        : ("expected" as const),
    hasMarketOverride: addressSlots.some(
      (slot) => slot.marketId !== null && slot.currentValue !== null,
    ),
  };
}

export function containsFiscalMeaning(value: string) {
  const normalized = normalizeLabel(value);
  return (
    /\bcodice fiscale\b/.test(normalized) ||
    /\btax code\b/.test(normalized) ||
    /\bfiscal code\b/.test(normalized)
  );
}

export function checkoutLabelsMode(slots: CheckoutLabelSlot[]): Exclude<CheckoutLabelsMode, "off"> {
  const fiscal = slots.filter((slot) => slot.name === "taxCode" || slot.name === "pec");
  const automatic = fiscal.some((slot) => slot.capability === "automatic");
  const guided = fiscal.some((slot) => slot.capability !== "automatic");
  return automatic && guided ? "partial" : automatic ? "automatic" : "guided";
}

export function checkoutLabelsStatus(state: CheckoutLabelState): CheckoutLabelsStatus {
  if (state.lastErrorCode === "checkout_labels_scope_required") return "scope_required";
  if (
    state.lastErrorCode ||
    state.address2ExternalChangeAt ||
    (state.address2Classification === "fiscal_conflict" && state.address2Decision === "pending")
  ) {
    return "action_required";
  }
  if (state.mode !== "off" && state.lastSyncAt) return "synced";
  return "unknown";
}

export function checkoutLabelsSetupDone(state: CheckoutLabelState) {
  return checkoutLabelsStatus(state) === "synced" || state.decision === "accepted";
}

export function checkoutLabelValuesMatch(left: string | null, right: string | null) {
  if (left === null || right === null) return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

export async function checkoutLabelsRevision(snapshot: Omit<CheckoutLabelsSnapshot, "revision">) {
  const value = JSON.stringify({
    locales: snapshot.locales,
    markets: snapshot.markets,
    issues: snapshot.issues,
    slots: snapshot.slots.map((slot) => ({
      resourceId: slot.resourceId,
      key: slot.key,
      locale: slot.locale,
      marketId: slot.marketId,
      kind: slot.kind,
      capability: slot.capability,
      currentValue: slot.currentValue,
      inheritedValue: slot.inheritedValue,
      sourceDigest: slot.sourceDigest,
      outdated: slot.outdated,
    })),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
