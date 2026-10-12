import { readCheckoutLabelState } from "../checkout-labels/repository.server";
import { loadCheckoutLabels } from "../checkout-labels/service.server";
import { readConfig } from "../config";
import { reconcile } from "../validation.server";
import type { Admin } from "../validation/types";

// Stessa riconciliazione di Home e webhook: il diritto arriva anche nel metafield letto dalla
// Function, e un rinnovo non osservato dal merchant non spegne la validazione.
export async function reconcileBillingAccount(admin: Admin, db: D1Database, shopDomain: string) {
  const { errorCode, retryable, validation } = await reconcile(admin, db, shopDomain);
  await refreshCheckoutLabels(admin, db, shopDomain, validation);
  return { retryable, errorCode };
}

// Lo stato etichette si ricalcola solo alla lettura: senza questo passaggio un esito scritto da
// una versione precedente resterebbe aperto finché il merchant non riapre l'app. La lettura è
// la stessa della pagina regole e un suo errore non tocca la riconciliazione del billing.
async function refreshCheckoutLabels(
  admin: Admin,
  db: D1Database,
  shopDomain: string,
  validation: Awaited<ReturnType<typeof reconcile>>["validation"],
) {
  try {
    const state = await readCheckoutLabelState(db, shopDomain);
    if (state.mode === "off") return;
    await loadCheckoutLabels(
      admin,
      db,
      shopDomain,
      readConfig(validation?.metafield?.jsonValue).rules,
    );
  } catch {
    // Fail-open: il prossimo ciclo o la prossima apertura dell'app rileggono le etichette.
  }
}
