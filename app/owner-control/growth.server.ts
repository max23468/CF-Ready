import {
  requestPartnerApi,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-source.server";
import { readOwnerControlState, writeOwnerControlState } from "./repository.server";

const GROWTH_CACHE_KEY = "growth_v1";
const GROWTH_CACHE_TTL_MS = 15 * 60 * 1000;
const GROWTH_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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

const TYPES = [
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_DEACTIVATED",
  "RELATIONSHIP_UNINSTALLED",
] as const;
type GrowthType = (typeof TYPES)[number];
type GrowthCounts = Record<GrowthType, number>;
export type GrowthReport = {
  generatedAt: string;
  days7: GrowthCounts;
  days28: GrowthCounts;
};

type GrowthPayload = {
  data?: {
    app?: {
      events?: {
        edges?: Array<{
          cursor?: string;
          node?: { type?: string; occurredAt?: string };
        }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    } | null;
  };
};

export async function readGrowthReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean; fetcher?: typeof fetch } = {},
) {
  const now = options.now ?? new Date();
  const cached = await readOwnerControlState<GrowthReport>(db, GROWTH_CACHE_KEY);
  const cacheAge = cached ? now.getTime() - Date.parse(cached.updatedAt) : Number.POSITIVE_INFINITY;
  const maxAge = options.force ? GROWTH_REFRESH_COOLDOWN_MS : GROWTH_CACHE_TTL_MS;
  if (cached && cacheAge >= 0 && cacheAge < maxAge) {
    return { ...cached.value, cachedAt: cached.updatedAt };
  }

  const report = await fetchGrowthReport(config, now, options.fetcher);
  await writeOwnerControlState(db, GROWTH_CACHE_KEY, report, now);
  return { ...report, cachedAt: now.toISOString() };
}

export async function fetchGrowthReport(
  config: PartnerInstallConfig,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<GrowthReport> {
  const start28 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const days28 = emptyCounts();
  const days7 = emptyCounts();
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload: GrowthPayload = await requestPartnerApi<GrowthPayload>(
      config,
      GROWTH_QUERY,
      {
        appId: config.appId,
        after,
        occurredAtMin: start28.toISOString(),
        occurredAtMax: now.toISOString(),
        first: PAGE_SIZE,
      },
      fetcher,
    );
    const events: NonNullable<NonNullable<GrowthPayload["data"]>["app"]>["events"] =
      payload.data?.app?.events;
    if (!events || !Array.isArray(events.edges) || !events.pageInfo) {
      throw new Error("partner_api_invalid_payload");
    }
    for (const { node } of events.edges) {
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
    if (!events.pageInfo.hasNextPage) {
      return { generatedAt: now.toISOString(), days7, days28 };
    }
    const cursor: string | undefined = events.edges.at(-1)?.cursor;
    if (!cursor || cursor === after) throw new Error("partner_api_invalid_cursor");
    after = cursor;
  }
  throw new Error("partner_api_page_limit");
}

function emptyCounts(): GrowthCounts {
  return Object.fromEntries(TYPES.map((type) => [type, 0])) as GrowthCounts;
}
