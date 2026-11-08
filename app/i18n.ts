import { en } from "./i18n/en";
import { it } from "./i18n/it";

const dictionaries = { it, en };

export type Locale = keyof typeof dictionaries;

// La lingua è quella dell'amministratore Shopify corrente. Il caricamento iniziale porta `locale`
// nell'URL; sulle richieste successive App Bridge imposta `Accept-Language` verso il dominio
// dell'app.
export function resolveLocale(request: Request): Locale {
  const tag =
    new URL(request.url).searchParams.get("locale") ?? request.headers.get("accept-language") ?? "";
  return tag.trim().toLowerCase().startsWith("it") ? "it" : "en";
}

export function texts(locale: Locale) {
  return dictionaries[locale];
}

export const quoteLabel = (value: string, locale: Locale) =>
  locale === "it" ? `«${value}»` : `“${value}”`;
