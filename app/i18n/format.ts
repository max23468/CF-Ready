import { CURRENCY } from "../config";
import type { Locale } from "../i18n";

const moneyFormatters = new Map<Locale, Intl.NumberFormat>();
const dateFormatters = new Map<Locale, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const zoneNameFormatters = new Map<string, Intl.DateTimeFormat>();

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
    // Stessa variante inglese di `formatDateTime`: giorno prima del mese in tutta l'app.
    formatter = new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
      dateStyle: "long",
      timeZone: "UTC",
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${iso}T00:00:00Z`));
}

export function formatDateTime(iso: string, locale: Locale, timeZone?: string | null) {
  const zone = timeZone || "UTC";
  const key = `${locale}|${zone}`;
  let formatter = dateTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    });
    dateTimeFormatters.set(key, formatter);
  }
  let zoneFormatter = zoneNameFormatters.get(zone);
  if (!zoneFormatter) {
    zoneFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "short" });
    zoneNameFormatters.set(zone, zoneFormatter);
  }
  const zoneName = zoneFormatter
    .formatToParts(new Date(iso))
    .find((part) => part.type === "timeZoneName")?.value;
  return `${formatter.format(new Date(iso))} ${zone === "UTC" ? "UTC" : zoneName}`;
}
