import { unauthenticated } from "../shopify.server";
import { reconcile } from "../validation.server";
import type { Admin } from "../validation/types";

export const BILLING_RECONCILIATION_HOURS = 24;
const BILLING_RETRY_HOURS = 1;
// Shopify rinnova le sottoscrizioni senza webhook: dal giorno di fine periodo il ciclo rilegge
// ogni ora finché il nuovo periodo non arriva nel metafield, poi torna alla cadenza giornaliera.
// Anche un diritto non scritto nel metafield viene ritentato ogni ora. Un conto mai tentato dopo
// la migrazione 0026 ha priorità una sola volta; `is_test` resta NULL per chi non ha mai avuto un
// addebito e non può quindi segnare il backfill senza riproporre lo store a ogni ora.
const RENEWAL_WINDOW_DAYS = 3;

type Options = {
  now?: Date;
  adminForShop?: (shopDomain: string) => Promise<Admin>;
  reconciler?: typeof reconcileBillingAccount;
};

export async function reconcileNextStaleBilling(db: D1Database, options: Options = {}) {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const candidate = await db
    .prepare(
      `SELECT s.shop_domain,
            (b.entitlement_status IN ('active', 'ending')
             AND b.plan_kind IN ('monthly', 'annual')
             AND b.current_period_end <= date(?)
             AND b.current_period_end >= date(?, '-${RENEWAL_WINDOW_DAYS} days')) AS renewal_due
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND EXISTS (
            SELECT 1 FROM shopify_sessions ss
             WHERE ss.shop_id = s.id AND ss.is_online = 0
          )
          AND (renewal_due
               OR b.reconciliation_error_code IN ('entitlement_readback_failed', 'entitlement_write_failed')
               OR b.reconciliation_attempted_at IS NULL
               OR b.last_reconciled_at IS NULL
               OR datetime(b.last_reconciled_at) <= datetime(?, '-${BILLING_RECONCILIATION_HOURS} hours'))
          AND (b.reconciliation_attempted_at IS NULL
               OR datetime(b.reconciliation_attempted_at) <= datetime(?, '-${BILLING_RETRY_HOURS} hours'))
        ORDER BY renewal_due DESC, b.reconciliation_attempted_at IS NOT NULL, b.last_reconciled_at,
                 b.shop_id
        LIMIT 1`,
    )
    .bind(nowIso, nowIso, nowIso, nowIso)
    .first<{ shop_domain: string }>();
  if (!candidate) return { attempted: false, shopDomain: null, errorCode: null };

  await markAttempt(db, candidate.shop_domain, nowIso, null);
  try {
    const admin = options.adminForShop
      ? await options.adminForShop(candidate.shop_domain)
      : (await unauthenticated.admin(candidate.shop_domain)).admin;
    const state = await (options.reconciler ?? reconcileBillingAccount)(
      admin,
      db,
      candidate.shop_domain,
    );
    if (state.retryable) throw new Error(state.errorCode ?? "billing_reconciliation_retryable");
    await markAttempt(db, candidate.shop_domain, nowIso, state.errorCode ?? null);
    return {
      attempted: true,
      shopDomain: candidate.shop_domain,
      errorCode: state.errorCode ?? null,
    };
  } catch (error) {
    const errorCode = stableErrorCode(error);
    await markAttempt(db, candidate.shop_domain, nowIso, errorCode);
    return { attempted: true, shopDomain: candidate.shop_domain, errorCode };
  }
}

// Stessa riconciliazione di Home e webhook: il diritto arriva anche nel metafield letto dalla
// Function, e un rinnovo non osservato dal merchant non spegne la validazione.
export async function reconcileBillingAccount(admin: Admin, db: D1Database, shopDomain: string) {
  const { errorCode, retryable } = await reconcile(admin, db, shopDomain);
  return { retryable, errorCode };
}

function markAttempt(
  db: D1Database,
  shopDomain: string,
  attemptedAt: string,
  errorCode: string | null,
) {
  return db
    .prepare(
      `UPDATE billing_accounts
          SET reconciliation_attempted_at = ?, reconciliation_error_code = ?, updated_at = ?
        WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
    )
    .bind(attemptedAt, errorCode, attemptedAt, shopDomain)
    .run();
}

function stableErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "billing_reconciliation_failed";
}
