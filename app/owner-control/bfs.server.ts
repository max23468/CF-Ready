import { unauthenticated } from "../shopify.server";
import { readOwnerControlState, writeOwnerControlState } from "./repository.server";
import { readShopifyPlanDetails, type ShopifyAdminForShop } from "./shopify-plans.server";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const REFRESH_LIMIT = 3;
const PREFIX = "bfs_plan_v1:";
type Classification = "eligible" | "development" | "excluded" | "unknown";
type PlanObservation = { classification: Classification; installedAt: string };
type Store = {
  id: number;
  shop_domain: string;
  installed_at: string;
  state_value: string | null;
  updated_at: string | null;
};
export type BFSReport = {
  eligible: number;
  development: number;
  excluded: number;
  unknown: number;
  checkedAt: string | null;
  days7: number | null;
};
export type BFSHistoryPoint = { day: string; count: number };

export function classifyBFSPlan(
  plan: Awaited<ReturnType<typeof readShopifyPlanDetails>>,
): Classification {
  if (!plan || plan.partnerDevelopment === null) return "unknown";
  if (plan.partnerDevelopment || plan.name === "Development") return "development";
  if (["Basic", "Grow", "Advanced", "Plus", "Starter", "Lite"].includes(plan.name))
    return "eligible";
  if (["Inactive", "Paused", "Trial", "Plus Trial"].includes(plan.name)) return "excluded";
  // shortcut: i piani speciali non provano il requisito BFS; ampliare solo con conferma Shopify.
  return "unknown";
}

async function readStores(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT s.id, s.shop_domain, s.installed_at, c.state_value, c.updated_at
       FROM shops s LEFT JOIN owner_control_state c ON c.state_key = '${PREFIX}' || s.id
      WHERE s.installation_status = 'active' ORDER BY c.updated_at, s.id`,
    )
    .all<Store>();
  return rows.results;
}

function observation(store: Store): PlanObservation | null {
  if (!store.state_value) return null;
  const value = JSON.parse(store.state_value) as PlanObservation | null;
  return value &&
    value.installedAt === store.installed_at &&
    ["eligible", "development", "excluded", "unknown"].includes(value.classification)
    ? value
    : null;
}

export async function readBFSReport(db: D1Database, now = new Date()): Promise<BFSReport> {
  const [stores, progress] = await Promise.all([
    readStores(db),
    readOwnerControlState<{ history: BFSHistoryPoint[] }>(db, "bfs_progress_v1"),
  ]);
  const report: BFSReport = {
    eligible: 0,
    development: 0,
    excluded: 0,
    unknown: 0,
    checkedAt: null,
    days7: null,
  };
  for (const store of stores) {
    const cached = observation(store);
    const age = store.updated_at ? now.getTime() - Date.parse(store.updated_at) : Infinity;
    const fresh = age >= 0 && age < DAY_MS;
    report[fresh && cached ? cached.classification : "unknown"] += 1;
    if (fresh && cached && (!report.checkedAt || store.updated_at! < report.checkedAt)) {
      report.checkedAt = store.updated_at;
    }
  }
  const previous = progress?.value.history?.find(
    ({ day }) => day === new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10),
  );
  if (previous && !report.unknown) report.days7 = report.eligible - previous.count;
  return report;
}

export async function refreshBFSPlans(
  db: D1Database,
  options: { now?: Date; force?: boolean; adminForShop?: ShopifyAdminForShop } = {},
) {
  const now = options.now ?? new Date();
  const stores = await readStores(db);
  const candidates = stores
    .filter((store) => {
      const cached = observation(store);
      const age = store.updated_at ? now.getTime() - Date.parse(store.updated_at) : Infinity;
      return (
        !cached ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >=
          (cached.classification === "unknown" ? RETRY_MS : options.force ? 5 * 60 * 1000 : DAY_MS)
      );
    })
    .slice(0, REFRESH_LIMIT);
  const adminForShop =
    options.adminForShop ?? (async (domain) => (await unauthenticated.admin(domain)).admin);
  await Promise.all(
    candidates.map(async (store) => {
      const plan = await readShopifyPlanDetails(store.shop_domain, adminForShop);
      await writeOwnerControlState(
        db,
        `${PREFIX}${store.id}`,
        {
          classification: classifyBFSPlan(plan),
          installedAt: store.installed_at,
        } satisfies PlanObservation,
        now,
      );
    }),
  );
  await db
    .prepare(
      `DELETE FROM owner_control_state WHERE state_key LIKE '${PREFIX}%'
       AND NOT EXISTS (SELECT 1 FROM shops WHERE state_key = '${PREFIX}' || shops.id
         AND installation_status = 'active')`,
    )
    .run();
  return readBFSReport(db, now);
}
