import {
  requestPartnerApi,
  type PartnerInstallConfig,
} from "../owner-notifications/partner-source.server";
import {
  ownerControlErrorCode,
  readOwnerControlState,
  writeOwnerControlState,
} from "./repository.server";

const UNINSTALLS_CACHE_KEY = "uninstalls_v1";
const UNINSTALLS_CACHE_TTL_MS = 60 * 60 * 1000;
const UNINSTALLS_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
// Nessun evento Partner dell'app può precedere l'avvio del progetto.
export const PARTNER_HISTORY_START = "2026-07-28T00:00:00.000Z";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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
        edges { cursor node { type occurredAt shop { id } } }
        pageInfo { hasNextPage }
      }
    }
  }
`;

// Solo aggregati: gli ID degli store servono a contarli e non entrano nella cache.
export type PartnerUninstalls = {
  generatedAt: string;
  total: number;
  stores: number;
  days28: number;
};

export type UninstallReport = {
  partner: (PartnerUninstalls & { cachedAt: string }) | { unavailable: string };
  local: { total: number; startedAt: string } | null;
};

type UninstallsPayload = {
  data?: {
    app?: {
      events?: {
        edges?: Array<{
          cursor?: string;
          node?: { type?: string; occurredAt?: string; shop?: { id?: string } };
        }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    } | null;
  };
};

export async function readUninstallReport(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean; fetcher?: typeof fetch } = {},
): Promise<UninstallReport> {
  const [partner, local] = await Promise.all([
    readPartnerUninstalls(db, config, options).catch((error: unknown) => ({
      unavailable: ownerControlErrorCode(error),
    })),
    db
      .prepare(
        "SELECT value, started_at FROM owner_metric_counters WHERE metric = 'app_uninstalled'",
      )
      .first<{ value: number; started_at: string }>(),
  ]);
  return {
    partner,
    local: local ? { total: local.value, startedAt: local.started_at } : null,
  };
}

async function readPartnerUninstalls(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; force?: boolean; fetcher?: typeof fetch },
) {
  const now = options.now ?? new Date();
  const cached = await readOwnerControlState<PartnerUninstalls>(db, UNINSTALLS_CACHE_KEY);
  const cacheAge = cached ? now.getTime() - Date.parse(cached.updatedAt) : Number.POSITIVE_INFINITY;
  const maxAge = options.force ? UNINSTALLS_REFRESH_COOLDOWN_MS : UNINSTALLS_CACHE_TTL_MS;
  if (cached && cacheAge >= 0 && cacheAge < maxAge) {
    return { ...cached.value, cachedAt: cached.updatedAt };
  }

  const report = await fetchPartnerUninstalls(config, now, options.fetcher);
  await writeOwnerControlState(db, UNINSTALLS_CACHE_KEY, report, now);
  return { ...report, cachedAt: now.toISOString() };
}

export async function fetchPartnerUninstalls(
  config: PartnerInstallConfig,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<PartnerUninstalls> {
  const start28 = now.getTime() - 28 * 24 * 60 * 60 * 1000;
  const stores = new Set<string>();
  let total = 0;
  let days28 = 0;
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload: UninstallsPayload = await requestPartnerApi<UninstallsPayload>(
      config,
      UNINSTALLS_QUERY,
      {
        appId: config.appId,
        after,
        occurredAtMin: PARTNER_HISTORY_START,
        occurredAtMax: now.toISOString(),
        first: PAGE_SIZE,
      },
      fetcher,
    );
    const events: NonNullable<NonNullable<UninstallsPayload["data"]>["app"]>["events"] =
      payload.data?.app?.events;
    if (!events || !Array.isArray(events.edges) || !events.pageInfo) {
      throw new Error("partner_api_invalid_payload");
    }
    for (const { node } of events.edges) {
      if (
        node?.type !== "RELATIONSHIP_UNINSTALLED" ||
        typeof node.occurredAt !== "string" ||
        !Number.isFinite(Date.parse(node.occurredAt)) ||
        typeof node.shop?.id !== "string" ||
        !node.shop.id
      ) {
        throw new Error("partner_api_invalid_uninstall_event");
      }
      total += 1;
      stores.add(node.shop.id);
      if (Date.parse(node.occurredAt) >= start28) days28 += 1;
    }
    if (!events.pageInfo.hasNextPage) {
      return { generatedAt: now.toISOString(), total, stores: stores.size, days28 };
    }
    const cursor: string | undefined = events.edges.at(-1)?.cursor;
    if (!cursor || cursor === after) throw new Error("partner_api_invalid_cursor");
    after = cursor;
  }
  throw new Error("partner_api_page_limit");
}
