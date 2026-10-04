export const POLARIS_STABLE_URL = "https://cdn.shopify.com/shopifycloud/polaris-1.js";
export const POLARIS_V2_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.0-rc.js";

// Dal 4 ottobre 2026 la v2 serve tutti gli ambienti, Production compresa (Master Plan §15.1).
// ponytail: v1, il suo CSS e i test visivi v1 restano come ritorno rapido finché la v2 è
// una release candidate; per tornare indietro basta puntare qui `POLARIS_STABLE_URL`.
export const POLARIS_URL = POLARIS_V2_URL;
