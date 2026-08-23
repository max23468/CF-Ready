import { CURRENCY } from "../config";
import type { Locale } from "./types";

const moneyFormatters = new Map<Locale, Intl.NumberFormat>();
const dateFormatters = new Map<Locale, Intl.DateTimeFormat>();

export function formatMoney(amount: number, locale: Locale) {
  let formatter = moneyFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY });
    moneyFormatters.set(locale, formatter);
  }
  return formatter.format(amount);
}

// La data arriva come giorno locale dello store, senza orario: si formatta in UTC per non
// spostarla di un giorno nel fuso di chi legge.
export function formatDate(iso: string | null, locale: Locale) {
  if (!iso) return "";
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${iso}T00:00:00Z`));
}
