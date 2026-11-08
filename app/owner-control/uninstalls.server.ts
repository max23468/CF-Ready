import {
  forEachPartnerPage,
  partnerEvents,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-api.server";
import { ownerControlErrorCode, readCachedReport } from "./repository.server";
import { BILLING_STATUS_CATEGORIES, type BillingStatusCategory } from "./billing";
import { storeKind, type StoreKind } from "./review-stores";

const UNINSTALLS_CACHE_KEY = "uninstalls_v2";
const UNINSTALLS_CACHE_TTL_MS = 60 * 60 * 1000;
// Nessun evento Partner dell'app può precedere l'avvio del progetto.
const PARTNER_HISTORY_START = "2026-07-28T00:00:00.000Z";

const UNINSTALLS_QUERY = `#graphql
  query OwnerControlUninstalls(
    $appId: ID!, $after: String, $occurredAtMin: DateTime!,
    $occurredAtMax: DateTime!, $first: Int!
  ) {
    app(id: $appId) {
      events(
        first: $first, after: $after,
        occurredAtMin: $occurredAtMin, occurredAtMax: $occurredAtMax,
        types: [RELATIONSHIP_UNINSTALLED]
      ) {
        edges {
          cursor
          node {
            type occurredAt shop { id name myshopifyDomain }
            ... on RelationshipUninstalled { reason description }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

// Nome, dominio e motivo restano in memoria per la vista dal vivo e non entrano in D1.
export type PartnerUninstallEvent = {
  occurredAt: string;
  shopId: string;
  name: string | null;
  domain: string | null;
  reason: string | null;
  description: string | null;
  kind: StoreKind;
};

// Solo aggregati: è ciò che la cache conserva.
type PartnerUninstalls = {
  generatedAt: string;
  merchant: { total: number; stores: number; days28: number };
  review: number;
};

export type UninstallReport = {
  partner: (PartnerUninstalls & { cachedAt: string }) | { unavailable: string };
  local: { total: number; review: number; startedAt: string } | null;
};

type UninstallNode = {
  type?: string;
  occurredAt?: string;
  shop?: { id?: string; name?: string | null; myshopifyDomain?: string | null };
  reason?: string | null;
  description?: string | null;
};

export async function readUninstallReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean } = {},
): Promise<UninstallReport> {
  const [partner, local] = await Promise.all([
    readPartnerUninstalls(db, config, options).catch((error: unknown) => ({
      unavailable: ownerControlErrorCode(error),
    })),
    db
      .prepare(
        `SELECT value, review_value, started_at FROM owner_metric_counters
         WHERE metric = 'app_uninstalled'`,
      )
      .first<{ value: number; review_value: number; started_at: string }>(),
  ]);
  return {
    partner,
    local: local
      ? { total: local.value, review: local.review_value, startedAt: local.started_at }
      : null,
  };
}

function readPartnerUninstalls(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean },
) {
  const now = options.now ?? new Date();
  return readCachedReport(
    db,
    UNINSTALLS_CACHE_KEY,
    { now, force: options.force, ttlMs: UNINSTALLS_CACHE_TTL_MS },
    async () => summarizeUninstalls(await fetchPartnerUninstallEvents(config, now), now),
  );
}

function summarizeUninstalls(events: PartnerUninstallEvent[], now = new Date()): PartnerUninstalls {
  const start28 = now.getTime() - 28 * 24 * 60 * 60 * 1000;
  const merchants = events.filter((event) => event.kind === "merchant");
  return {
    generatedAt: now.toISOString(),
    merchant: {
      total: merchants.length,
      stores: new Set(merchants.map((event) => event.shopId)).size,
      days28: merchants.filter((event) => Date.parse(event.occurredAt) >= start28).length,
    },
    review: events.length - merchants.length,
  };
}

export async function fetchPartnerUninstallEvents(
  config: PartnerInstallConfig,
  now = new Date(),
): Promise<PartnerUninstallEvent[]> {
  const events: PartnerUninstallEvent[] = [];

  await forEachPartnerPage<UninstallNode>(
    config,
    UNINSTALLS_QUERY,
    { occurredAtMin: PARTNER_HISTORY_START, occurredAtMax: now.toISOString() },
    { connection: partnerEvents },
    (nodes) => {
      for (const node of nodes) {
        if (
          node?.type !== "RELATIONSHIP_UNINSTALLED" ||
          typeof node.occurredAt !== "string" ||
          !Number.isFinite(Date.parse(node.occurredAt)) ||
          typeof node.shop?.id !== "string" ||
          !node.shop.id
        ) {
          throw new Error("partner_api_invalid_uninstall_event");
        }
        const name = text(node.shop.name);
        const domain = text(node.shop.myshopifyDomain);
        events.push({
          occurredAt: node.occurredAt,
          shopId: node.shop.id,
          name,
          domain,
          reason: text(node.reason),
          description: text(node.description),
          kind: storeKind({ name, domain }),
        });
      }
    },
  );
  return events.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}

export type UninstallHistory = {
  startedAt: string | null;
  review: number;
  merchant: {
    total: number;
    status: Record<BillingStatusCategory, number>;
    averageDays: number | null;
    validationEnabled: number;
    onboardingCompleted: number;
  };
};

export async function readUninstallHistory(db: D1Database): Promise<UninstallHistory> {
  const [{ results }, started] = await Promise.all([
    db
      .prepare(
        `SELECT store_kind, billing_category, COUNT(*) AS count,
                SUM(installed_days) AS days, SUM(validation_enabled) AS validation,
                SUM(onboarding_completed) AS onboarding
         FROM uninstall_history GROUP BY store_kind, billing_category`,
      )
      .all<{
        store_kind: StoreKind;
        billing_category: BillingStatusCategory;
        count: number;
        days: number;
        validation: number;
        onboarding: number;
      }>(),
    // La migrazione registra l'inizio: le disinstallazioni precedenti non sono ricostruibili.
    db
      .prepare(
        `SELECT json_extract(state_value, '$.startedAt') AS started_at
         FROM owner_control_state WHERE state_key = 'uninstall_history_v1'`,
      )
      .first<{ started_at: string | null }>(),
  ]);
  const status = Object.fromEntries(
    BILLING_STATUS_CATEGORIES.map((category) => [category, 0]),
  ) as Record<BillingStatusCategory, number>;
  let total = 0;
  let days = 0;
  let validationEnabled = 0;
  let onboardingCompleted = 0;
  let review = 0;
  for (const row of results) {
    if (row.store_kind === "review") {
      review += row.count;
      continue;
    }
    status[row.billing_category] += row.count;
    total += row.count;
    days += row.days;
    validationEnabled += row.validation;
    onboardingCompleted += row.onboarding;
  }
  return {
    startedAt: started?.started_at ?? null,
    review,
    merchant: {
      total,
      status,
      averageDays: total ? Math.round(days / total) : null,
      validationEnabled,
      onboardingCompleted,
    },
  };
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
