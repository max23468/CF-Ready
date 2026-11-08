import { PARTNER_RELATIONSHIP_EVENT_TYPES as TYPES } from "../owner-notifications/model";
import {
  forEachPartnerPage,
  partnerEvents,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-api.server";
import { readCachedReport } from "./repository.server";

const GROWTH_CACHE_KEY = "growth_v1";
const GROWTH_CACHE_TTL_MS = 15 * 60 * 1000;

const GROWTH_QUERY = `#graphql
  query OwnerControlGrowth(
    $appId: ID!, $after: String, $occurredAtMin: DateTime!,
    $occurredAtMax: DateTime!, $first: Int!
  ) {
    app(id: $appId) {
      events(
        first: $first, after: $after,
        occurredAtMin: $occurredAtMin, occurredAtMax: $occurredAtMax,
        types: [
          RELATIONSHIP_INSTALLED RELATIONSHIP_REACTIVATED
          RELATIONSHIP_DEACTIVATED RELATIONSHIP_UNINSTALLED
        ]
      ) {
        edges { cursor node { type occurredAt } }
        pageInfo { hasNextPage }
      }
    }
  }
`;

type GrowthType = (typeof TYPES)[number];
type GrowthCounts = Record<GrowthType, number>;
type GrowthReport = {
  generatedAt: string;
  days7: GrowthCounts;
  days28: GrowthCounts;
};

export function readGrowthReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean } = {},
) {
  const now = options.now ?? new Date();
  return readCachedReport(
    db,
    GROWTH_CACHE_KEY,
    { now, force: options.force, ttlMs: GROWTH_CACHE_TTL_MS },
    () => fetchGrowthReport(config, now),
  );
}

async function fetchGrowthReport(config: PartnerInstallConfig, now: Date): Promise<GrowthReport> {
  const start28 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const days28 = emptyCounts();
  const days7 = emptyCounts();

  await forEachPartnerPage<{ type?: string; occurredAt?: string }>(
    config,
    GROWTH_QUERY,
    { occurredAtMin: start28.toISOString(), occurredAtMax: now.toISOString() },
    { connection: partnerEvents },
    (nodes) => {
      for (const node of nodes) {
        if (
          !node ||
          !TYPES.includes(node.type as GrowthType) ||
          typeof node.occurredAt !== "string" ||
          !Number.isFinite(Date.parse(node.occurredAt))
        ) {
          throw new Error("partner_api_invalid_growth_event");
        }
        const type = node.type as GrowthType;
        days28[type] += 1;
        if (Date.parse(node.occurredAt) >= start7.getTime()) days7[type] += 1;
      }
    },
  );
  return { generatedAt: now.toISOString(), days7, days28 };
}

function emptyCounts(): GrowthCounts {
  return Object.fromEntries(TYPES.map((type) => [type, 0])) as GrowthCounts;
}
