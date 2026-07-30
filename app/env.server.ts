import { env } from "cloudflare:workers";

const bindings = env as Env & { BILLING_TEST?: string; SHOPIFY_APP_URL?: string };

// Addebiti di prova finché la variabile non dice esplicitamente il contrario: in Production
// va portata a "false" prima del rilascio.
export const BILLING_IS_TEST = bindings.BILLING_TEST !== "false";
export const APP_URL = bindings.SHOPIFY_APP_URL || "";
