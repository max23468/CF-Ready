import { diagnosePec, diagnoseTaxCode } from "../checkout-field-validation";
import type { Rules } from "../config";

// D-206: scope opzionali chiesti solo quando il merchant attiva la normalizzazione.
export const ORDER_NORMALIZATION_SCOPES = ["read_orders", "write_orders"] as const;
// `read_orders` copre gli ultimi 60 giorni: la correzione degli ordini esistenti non va oltre.
export const ORDER_BACKFILL_DAYS = 60;

export type OrderLocalizedField = { key: string; value: string };

export function normalizesOrderFields(rules: Rules) {
  return (
    rules.normalizeOrderFields === true &&
    (rules.taxCode !== "unmanaged" || rules.pec !== "unmanaged")
  );
}

export type NormalizedOrderField = "taxCode" | "pec";

// Campi che l'opzione uniforma con queste regole: confrontati con quelli salvati dicono se
// serve correggere anche gli ordini esistenti, per esempio quando la PEC diventa gestita.
export function normalizedOrderFieldNames(rules: Rules): NormalizedOrderField[] {
  if (!normalizesOrderFields(rules)) return [];
  return (["taxCode", "pec"] as const).filter((field) => rules[field] !== "unmanaged");
}

// Solo valori formalmente validi dei campi gestiti: Codice Fiscale maiuscolo, PEC minuscola,
// senza spazi esterni. Un valore non valido resta com'è, così l'app non altera dati che non
// riconosce.
export function normalizedOrderFields(
  fields: readonly OrderLocalizedField[],
  rules: Rules,
): OrderLocalizedField[] {
  if (!normalizesOrderFields(rules)) return [];
  return fields.flatMap(({ key, value }) => {
    const next = normalizedValue(key, value, rules);
    return next !== null && next !== value ? [{ key, value: next }] : [];
  });
}

function normalizedValue(key: string, value: string, rules: Rules) {
  if (key === "TAX_CREDENTIAL_IT" && rules.taxCode !== "unmanaged") {
    return diagnoseTaxCode(value) === "valid" ? value.trim().toUpperCase() : null;
  }
  if (key === "TAX_EMAIL_IT" && rules.pec !== "unmanaged") {
    return diagnosePec(value) === "valid" ? value.trim().toLowerCase() : null;
  }
  return null;
}
