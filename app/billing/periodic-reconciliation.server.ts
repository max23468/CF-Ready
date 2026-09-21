import { unauthenticated } from "../shopify.server";
import { queryContext } from "../validation.server";
import type { Admin } from "../validation/types";
import { localDate } from "./domain";
import { readCommercialInputs, syncCommercialEntitlement } from "./commercial-entitlement.server";
import { readBilling } from "./shopify.server";

export const BILLING_RECONCILIATION_HOURS = 24;
const BILLING_RETRY_HOURS = 1;

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
      `SELECT s.shop_domain
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND EXISTS (
            SELECT 1 FROM shopify_sessions ss
             WHERE ss.shop_id = s.id AND ss.is_online = 0
          )
          AND (b.is_test IS NULL
               OR b.last_reconciled_at IS NULL
               OR datetime(b.last_reconciled_at) <= datetime(?, '-${BILLING_RECONCILIATION_HOURS} hours'))
          AND (b.reconciliation_attempted_at IS NULL
               OR datetime(b.reconciliation_attempted_at) <= datetime(?, '-${BILLING_RETRY_HOURS} hours'))
        ORDER BY b.is_test IS NOT NULL, b.last_reconciled_at, b.shop_id
        LIMIT 1`,
    )
    .bind(nowIso, nowIso)
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

export async function reconcileBillingAccount(admin: Admin, db: D1Database, shopDomain: string) {
  const [{ shop }, billing] = await Promise.all([queryContext(admin), readBilling(admin)]);
  const today = localDate(shop.ianaTimezone);
  const inputs = await readCommercialInputs(db, shopDomain, today);
  await syncCommercialEntitlement(db, shopDomain, {
    billing,
    inputs,
    timeZone: shop.ianaTimezone,
    today,
  });
  return { retryable: false, errorCode: null };
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
