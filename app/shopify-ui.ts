export const POLARIS_STABLE_URL = "https://cdn.shopify.com/shopifycloud/polaris-1.js";
export const POLARIS_V2_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.0-rc.js";

// La prova della v2 è riservata a Development, anche nei build ottimizzati.
// Un ambiente assente o sconosciuto conserva il runtime stabile.
export function polarisUrlForEnvironment(environment?: string) {
  return environment === "development" ? POLARIS_V2_URL : POLARIS_STABLE_URL;
}
