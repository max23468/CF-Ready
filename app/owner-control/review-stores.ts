// Criterio dedotto dalle disinstallazioni Partner osservate fino al 14 ottobre 2026 e
// confermato dall'owner: i revisori Shopify usano store `app-review-<id>-r<n>-a0-primary`
// o `-victim`, store di test App Store (`appstoretest9`) e di staging (`apdevplusstaging1`);
// Shopify oscura alcuni nomi in "REDACTED". Gli store interni dell'owner contano come review.
const REVIEW_PREFIXES = ["app-review-", "appstoretest", "apdev"] as const;
const REVIEW_NAMES = ["redacted"] as const;
const INTERNAL_DOMAINS = [
  "cf-ready-dev.myshopify.com",
  "cf-ready-polaris-2.myshopify.com",
  "numisleo.myshopify.com",
  "asa5ve-kz.myshopify.com",
  "bvkxxq-cv.myshopify.com",
  "dnu1dk-yp.myshopify.com",
] as const;

export type StoreKind = "merchant" | "review";

// `development` è la classificazione BFS del piano Shopify, nota solo per store installati.
export function storeKind(store: {
  name?: string | null;
  domain?: string | null;
  development?: boolean;
}): StoreKind {
  const name = store.name?.trim().toLocaleLowerCase("en-US") ?? "";
  const domain = store.domain?.trim().toLocaleLowerCase("en-US") ?? "";
  const review =
    store.development === true ||
    (REVIEW_NAMES as readonly string[]).includes(name) ||
    (INTERNAL_DOMAINS as readonly string[]).includes(domain) ||
    REVIEW_PREFIXES.some((prefix) => name.startsWith(prefix) || domain.startsWith(prefix));
  return review ? "review" : "merchant";
}

// Stesso criterio in SQL, generato dalle stesse costanti: le espressioni ricevute sono colonne.
export function reviewStoreSql(name: string, domain: string, development: string) {
  const lowerName = `lower(trim(coalesce(${name}, '')))`;
  const lowerDomain = `lower(trim(coalesce(${domain}, '')))`;
  const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(", ");
  return `(${[
    `coalesce(${development}, 0) = 1`,
    `${lowerName} IN (${list(REVIEW_NAMES)})`,
    `${lowerDomain} IN (${list(INTERNAL_DOMAINS)})`,
    ...REVIEW_PREFIXES.flatMap((prefix) => [
      `substr(${lowerName}, 1, ${prefix.length}) = '${prefix}'`,
      `substr(${lowerDomain}, 1, ${prefix.length}) = '${prefix}'`,
    ]),
  ].join(" OR ")})`;
}
