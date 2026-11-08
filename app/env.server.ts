import { env } from "cloudflare:workers";
import { version } from "../package.json";

// `cf workers types` deduce tipi letterali dai valori oggi configurati e non vede i secret: qui
// ogni variabile torna stringa opzionale, così i confronti valgono anche quando il valore cambia.
type StringBinding =
  | "ALLOWED_SHOP"
  | "BILLING_TEST"
  | "ORDER_NORMALIZATION_ENABLED"
  | "SCOPES"
  | "SESSION_ENCRYPTION_KEY"
  | "SHOP_CUSTOM_DOMAIN"
  | "SHOPIFY_API_KEY"
  | "SHOPIFY_API_SECRET"
  | "SHOPIFY_APP_URL"
  | "TRIAL_LEDGER_HMAC_KEY";

export const bindings = env as unknown as Omit<Env, StringBinding> &
  Partial<Record<StringBinding, string>>;

// Addebiti di prova finché la variabile non dice esplicitamente il contrario. In Production
// vale "false" fin dalla pubblicazione: i merchant devono ricevere addebiti reali, mentre il
// reviewer usa la prova gratuita e non approva una charge Production (D-129).
export const BILLING_IS_TEST = bindings.BILLING_TEST !== "false";
export const APP_API_KEY = bindings.SHOPIFY_API_KEY || "";
// L'app Development ha distribuzione pubblica per poter usare la Billing API: il suo
// `client_id` è nel repository pubblico, quindi l'installazione resta ammessa solo sui dev
// store autorizzati, elencati con separatore virgola. Vuota in Production, dove installa chi vuole.
export const ALLOWED_SHOP = bindings.ALLOWED_SHOP || "";
export const TRIAL_LEDGER_HMAC_KEY = bindings.TRIAL_LEDGER_HMAC_KEY || "";
// D-213: l'opzione per gli ordini si offre solo dove Shopify ha approvato l'accesso ai
// protected customer data dell'app; la variabile è dichiarata per ambiente.
export const ORDER_NORMALIZATION_ENABLED = bindings.ORDER_NORMALIZATION_ENABLED === "true";
export const APP_URL = bindings.SHOPIFY_APP_URL || "";
export const APP_VERSION = version;
