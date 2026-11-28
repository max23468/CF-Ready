import { shopAdminBaseUrl } from "../embedded-admin";
import {
  CHECKOUT_LABEL_KEYS,
  checkoutLabelCopy,
  normalizeLabel,
  observedLabelForSlot,
  type CheckoutLabelFamily,
  type CheckoutLabelSlot,
  type CheckoutLabelsSnapshot,
} from "./domain";

export type TaxCodeLabelIssue = {
  kind: "optional" | "different_field" | "custom";
  value: string;
  language: CheckoutLabelFamily;
  market: string | null;
  manual: boolean;
  editorUrl?: string;
};

export type TaxCodeLabelReview =
  | { status: "current" | "default_current" | "unavailable" | "permissions_required" }
  | { status: "needs_review"; issue: TaxCodeLabelIssue };

export function reviewTaxCodeLabel(
  snapshot: CheckoutLabelsSnapshot,
  shopDomain?: string,
): TaxCodeLabelReview {
  if (snapshot.issues.some(({ key }) => key === CHECKOUT_LABEL_KEYS.taxCode)) {
    return { status: "unavailable" };
  }

  const locales = snapshot.locales.filter(({ published }) => published);
  if (locales.length === 0) return { status: "unavailable" };
  const slots = snapshot.slots.filter(({ name }) => name === "taxCode");
  let incomplete = false;
  let marketsIncomplete = false;
  let firstIssue: TaxCodeLabelIssue | undefined;
  for (const locale of locales) {
    const localized = slots.filter((slot) => slot.locale === locale.locale);
    const base =
      localized.find(({ kind, currentValue }) => kind === "global_translation" && currentValue) ??
      localized.find(({ kind }) => kind === "source") ??
      localized.find(({ kind }) => kind === "global_translation");
    if (!base) {
      incomplete = true;
      continue;
    }

    const markets = snapshot.markets.filter(({ locales }) => locales.includes(locale.locale));
    const effective = new Map<CheckoutLabelSlot, string[]>();
    let unresolvedMarket = false;
    if (markets.length === 0) effective.set(base, []);
    for (const market of markets) {
      const slot = localized.find(({ marketId }) => marketId === market.id);
      if (!slot || market.resolution === "ambiguous") {
        unresolvedMarket = true;
      } else {
        // Una traduzione ereditata si corregge dove è definita, senza creare un override.
        const definition = slot.currentValue === null ? base : slot;
        const affected = effective.get(definition) ?? [];
        affected.push(market.name);
        effective.set(definition, affected);
      }
    }

    for (const [slot, affected] of effective) {
      if (slot.outdated || !observedLabelForSlot(slot).trim()) {
        incomplete = true;
        continue;
      }
      const market =
        slot.marketName ?? (affected.length < markets.length ? affected.join(", ") : null);
      const issue = taxCodeLabelIssue(slot, market, shopDomain);
      if (issue && issue.kind !== "custom") return { status: "needs_review", issue };
      firstIssue ??= issue;
    }

    // L'incertezza sul checkout di un mercato non impedisce di verificare il testo predefinito.
    // Lo segnaliamo come tale, senza attribuirlo a un mercato o a un checkout verificato.
    if (!unresolvedMarket) continue;
    if (base.outdated || !observedLabelForSlot(base).trim()) {
      incomplete = true;
      continue;
    }
    marketsIncomplete = true;
    if (effective.has(base)) continue;
    const issue = taxCodeLabelIssue(base, null, shopDomain);
    if (!issue) continue;
    if (!base.currentValue?.trim()) {
      incomplete = true;
      continue;
    }
    if (issue.kind !== "custom") return { status: "needs_review", issue };
    firstIssue ??= issue;
  }

  if (firstIssue) return { status: "needs_review", issue: firstIssue };
  if (incomplete) return { status: "unavailable" };
  return { status: marketsIncomplete ? "default_current" : "current" };
}

function taxCodeLabelIssue(
  slot: CheckoutLabelSlot,
  market: string | null,
  shopDomain: string | undefined,
): TaxCodeLabelIssue | undefined {
  const value = observedLabelForSlot(slot);
  const normalized = normalizeLabel(value);
  const reference = normalizeLabel(
    checkoutLabelCopy("taxCode", slot.family, "required_validated")!,
  );
  const describesTaxCode = /\b(codice fiscale|italian tax code|tax code|fiscal code)\b/.test(
    normalized,
  );
  const optionalWording = normalized.replace(
    /\b(non (?:opzionale|facoltativ[oa])|not optional)\b/g,
    "",
  );
  const kind =
    !describesTaxCode && /\b(partita iva|p iva|vat|pec|certified email)\b/.test(normalized)
      ? "different_field"
      : /\b(opzionale|facoltativ[oa]|optional|non obbligatori[oa]|not required)\b/.test(
            optionalWording,
          )
        ? "optional"
        : "custom";

  if (
    normalized === reference ||
    (kind === "custom" &&
      /^(?:(?:codice fiscale(?: italiano)?|italian tax code|tax code|fiscal code)(?: (?:obbligatorio|required))?|(?:obbligatorio|required) (?:codice fiscale|italian tax code|tax code|fiscal code))$/.test(
        normalized,
      ))
  ) {
    return undefined;
  }

  return {
    kind,
    value,
    language: slot.family,
    market,
    manual: slot.capability !== "automatic",
    editorUrl: sourceLabelEditorUrl(slot, value, shopDomain),
  };
}

function sourceLabelEditorUrl(slot: CheckoutLabelSlot, value: string, shopDomain?: string) {
  const themeId = /^gid:\/\/shopify\/OnlineStoreThemeLocaleContent\/(\d+)$/.exec(
    slot.resourceId,
  )?.[1];
  if (slot.kind !== "source" || !themeId) return undefined;
  const admin = shopDomain === undefined ? "shopify://admin" : shopAdminBaseUrl(shopDomain);
  if (!admin) return undefined;
  const query = new URLSearchParams({ category: "checkout & system", query: value });
  return `${admin}/themes/${themeId}/language?${query}`;
}

export function taxCodeLabelEditorUrl(snapshot: CheckoutLabelsSnapshot) {
  if (snapshot.issues.some(({ key }) => key === CHECKOUT_LABEL_KEYS.taxCode)) return null;
  const source = snapshot.slots.find(({ name, kind }) => name === "taxCode" && kind === "source");
  return source ? (sourceLabelEditorUrl(source, observedLabelForSlot(source)) ?? null) : null;
}
