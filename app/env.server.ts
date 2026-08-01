import { env } from "cloudflare:workers";
import { version } from "../package.json";

const bindings = env as Env & {
  BILLING_TEST?: string;
  SHOPIFY_APP_URL?: string;
  ALLOWED_SHOP?: string;
};

// Addebiti di prova finché la variabile non dice esplicitamente il contrario: in Production
// va portata a "false" prima del rilascio.
export const BILLING_IS_TEST = bindings.BILLING_TEST !== "false";
export const APP_URL = bindings.SHOPIFY_APP_URL || "";
// L'app Development ha distribuzione pubblica per poter usare la Billing API: il suo
// `client_id` è nel repository pubblico, quindi l'installazione resta ammessa solo sul dev
// store. Vuota in Production, dove installa chi vuole.
export const ALLOWED_SHOP = bindings.ALLOWED_SHOP || "";
// §22: la versione è uno dei dati tecnici che il merchant allega alla richiesta di
// assistenza. È l'unico che non può conoscere da sé.
export const APP_VERSION = version;
