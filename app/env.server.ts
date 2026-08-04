import { env } from "cloudflare:workers";
import { version } from "../package.json";

const bindings = env as Env & {
  BILLING_TEST?: string;
  SHOPIFY_APP_URL?: string;
  ALLOWED_SHOP?: string;
  TRIAL_LEDGER_HMAC_KEY?: string;
};

// Addebiti di prova finché la variabile non dice esplicitamente il contrario. In Production
// vale "false" fin dalla pubblicazione: i merchant devono ricevere addebiti reali, mentre il
// reviewer usa la prova gratuita e non approva una charge Production (D-129). L'annotazione
// allarga il tipo letterale che `wrangler types` deduce dal valore oggi configurato: il
// confronto deve continuare a valere anche quando quel valore cambia.
const billingTest: string | undefined = bindings.BILLING_TEST;
export const BILLING_IS_TEST = billingTest !== "false";
export const APP_URL = bindings.SHOPIFY_APP_URL || "";
// L'app Development ha distribuzione pubblica per poter usare la Billing API: il suo
// `client_id` è nel repository pubblico, quindi l'installazione resta ammessa solo sul dev
// store. Vuota in Production, dove installa chi vuole.
export const ALLOWED_SHOP = bindings.ALLOWED_SHOP || "";
export const TRIAL_LEDGER_HMAC_KEY = bindings.TRIAL_LEDGER_HMAC_KEY || "";
// §22: la versione è uno dei dati tecnici che il merchant allega alla richiesta di
// assistenza. È l'unico che non può conoscere da sé.
export const APP_VERSION = version;
