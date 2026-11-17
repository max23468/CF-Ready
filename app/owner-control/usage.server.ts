import { ORDER_BACKFILL_DAYS } from "../order-normalization/domain";
import { countFiscalOrders, emptyFiscalOrderCounts, sinceDays } from "../order-usage.server";
import { readCachedReport } from "./repository.server";
import type { ShopifyAdminForShop } from "./shopify-plans.server";

// D-225: totali d'uso per il Control Center. Si leggono solo dagli store che hanno già concesso
// `read_orders`; per gli altri la fonte è la Dev Dashboard.
const USAGE_CACHE_KEY = "store_usage_v1";
const USAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ORDERS_PAGE_SIZE = 100;
// 30 pagine da 100 ordini: oltre questa soglia il totale si mostra come parziale.
const MAX_PAGES = 30;

type UsageShop = { id: number; shop_domain: string; display_name: string | null };

export type StoreUsageRow = {
  shopId: number;
  status: "ok" | "no_scope" | "unavailable";
  orders: number;
  taxCode: number;
  pec: number;
  either: number;
  truncated: boolean;
};

export type StoreUsageReport = { since: string; days: number; rows: StoreUsageRow[] };

// Il valore `scope` della sessione offline è in chiaro: `write_orders` implica la lettura.
export async function readUsageShops(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT s.id, s.shop_domain, s.display_name
       FROM shops s
       JOIN shopify_sessions ss ON ss.shop_id = s.id AND ss.is_online = 0
       WHERE s.installation_status = 'active'
         AND (',' || REPLACE(COALESCE(ss.scope, ''), ' ', '') || ',' LIKE '%,read_orders,%'
           OR ',' || REPLACE(COALESCE(ss.scope, ''), ' ', '') || ',' LIKE '%,write_orders,%')
       ORDER BY s.id`,
    )
    .all<UsageShop>();
  return results;
}

export async function readStoreUsage(
  db: D1Database,
  adminForShop: ShopifyAdminForShop,
  options: { now: Date; force?: boolean },
) {
  // Nomi e domini non entrano nella cache (D-189): si uniscono al momento della lettura.
  const shops = await readUsageShops(db);
  const report = await readCachedReport<StoreUsageReport>(
    db,
    USAGE_CACHE_KEY,
    { now: options.now, force: options.force, ttlMs: USAGE_CACHE_TTL_MS },
    async () => {
      const since = sinceDays(options.now, ORDER_BACKFILL_DAYS);
      const rows = await Promise.all(
        shops.map((shop) => countShopOrders(shop, adminForShop, since)),
      );
      return { since, days: ORDER_BACKFILL_DAYS, rows: rankUsage(rows) };
    },
  );
  const names = new Map(shops.map((shop) => [shop.id, shop.display_name ?? shop.shop_domain]));
  return {
    ...report,
    rows: report.rows
      .filter((row) => names.has(row.shopId))
      .map((row) => ({ ...row, name: names.get(row.shopId) ?? "" })),
  };
}

export async function countShopOrders(
  shop: Pick<UsageShop, "id" | "shop_domain">,
  adminForShop: ShopifyAdminForShop,
  since: string,
): Promise<StoreUsageRow> {
  let admin;
  try {
    admin = await adminForShop(shop.shop_domain);
  } catch (error) {
    return {
      shopId: shop.id,
      ...emptyFiscalOrderCounts(),
      status: JSON.stringify(error).includes("ACCESS_DENIED") ? "no_scope" : "unavailable",
    };
  }
  const counts = await countFiscalOrders(admin, {
    since,
    pageSize: ORDERS_PAGE_SIZE,
    maxPages: MAX_PAGES,
  });
  return { shopId: shop.id, ...counts };
}

export function rankUsage(rows: StoreUsageRow[]) {
  return [...rows].sort(
    (a, b) => b.either - a.either || b.orders - a.orders || a.shopId - b.shopId,
  );
}
