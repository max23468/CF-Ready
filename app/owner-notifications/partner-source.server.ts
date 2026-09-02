import {
  type PartnerEventNode,
  type PartnerEventType,
  normalizeShopDomain,
  planKindFromCharge,
  planLabel,
  safePlanName,
  validIsoDate,
  validPartnerEvent,
} from "./model";
import {
  billingCopy,
  formatDate,
  formatDuration,
  formatMoney,
  notificationBody,
  operationalPlan,
  operationalSection,
  partnerBillingState,
  relationshipCopy,
  relationshipStatus,
  storeSection,
} from "./presentation";
import { persistShopDisplayName } from "../shop-profile.server";
import {
  MAX_NOTIFICATION_PAGES,
  NOTIFICATION_PAGE_SIZE,
  billingNotificationKey,
  hasEquivalentNotification,
  notificationShopHash,
  notificationStatement,
  partnerPollStart,
  previousPlanKind,
  readOperationalSnapshot,
  relationshipNotificationKey,
  writeNotificationState,
} from "./repository.server";

const PARTNER_API_VERSION = "2026-07";

type PartnerInstallConfig = { organizationId: string; appId: string; accessToken: string };
type PartnerEventPage = {
  data?: {
    app?: {
      events?: {
        edges?: Array<{ cursor?: string; node?: PartnerEventNode }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

const PARTNER_EVENTS_QUERY = `#graphql
  query OwnerAppNotifications($appId: ID!, $after: String, $occurredAtMin: DateTime!, $first: Int!) {
    app(id: $appId) {
      events(first: $first, after: $after, occurredAtMin: $occurredAtMin, types: [
        RELATIONSHIP_INSTALLED RELATIONSHIP_REACTIVATED RELATIONSHIP_DEACTIVATED
        RELATIONSHIP_UNINSTALLED SUBSCRIPTION_CHARGE_ACCEPTED SUBSCRIPTION_CHARGE_ACTIVATED
        SUBSCRIPTION_CHARGE_CANCELED SUBSCRIPTION_CHARGE_DECLINED SUBSCRIPTION_CHARGE_EXPIRED
        SUBSCRIPTION_CHARGE_FROZEN SUBSCRIPTION_CHARGE_UNFROZEN ONE_TIME_CHARGE_ACCEPTED
        ONE_TIME_CHARGE_ACTIVATED ONE_TIME_CHARGE_DECLINED ONE_TIME_CHARGE_EXPIRED
      ]) {
        edges {
          cursor
          node {
            type occurredAt
            shop { id myshopifyDomain name }
            ... on AppSubscriptionEvent {
              charge { id name amount { amount currencyCode } billingOn test }
            }
            ... on AppPurchaseOneTimeEvent {
              charge { id name amount { amount currencyCode } test }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`;

export async function pollPartnerEvents(
  db: D1Database,
  config: PartnerInstallConfig,
  options: { now?: Date; fetcher?: typeof fetch } = {},
) {
  requirePartnerConfig(config);
  const now = options.now ?? new Date();
  const cycleStartedAt = now.toISOString();
  const occurredAtMin = await partnerPollStart(db, "partner_events_polled_at", now);
  const fetcher = options.fetcher ?? fetch;
  let after: string | null = null;
  let inserted = 0;

  for (let page = 0; page < MAX_NOTIFICATION_PAGES; page += 1) {
    const response = await fetcher(
      `https://partners.shopify.com/${encodeURIComponent(config.organizationId)}/api/${PARTNER_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": config.accessToken,
        },
        body: JSON.stringify({
          query: PARTNER_EVENTS_QUERY,
          variables: {
            appId: config.appId,
            after,
            occurredAtMin,
            first: NOTIFICATION_PAGE_SIZE,
          },
        }),
      },
    );
    if (!response.ok) throw new Error("partner_api_request_failed");
    const payload = await readPartnerPayload(response);
    const events = payload.data?.app?.events;
    if (!events || !Array.isArray(events.edges) || !events.pageInfo) {
      throw new Error("partner_api_invalid_payload");
    }
    const notifications = (
      await Promise.all(
        events.edges.map(async ({ node }) => {
          if (!validPartnerEvent(node)) throw new Error("partner_api_invalid_payload");
          return partnerEventNotification(db, node);
        }),
      )
    ).filter((notification) => notification !== null);
    if (notifications.length) {
      const results = await db.batch(notifications);
      inserted += results.reduce((total, result) => total + result.meta.changes, 0);
    }
    if (!events.pageInfo.hasNextPage) {
      await writeNotificationState(db, "partner_events_polled_at", cycleStartedAt);
      return { inserted, occurredAtMin, pages: page + 1 };
    }
    const endCursor = events.edges.at(-1)?.cursor;
    if (!endCursor || endCursor === after) throw new Error("partner_api_invalid_cursor");
    after = endCursor;
  }
  throw new Error("partner_api_page_limit");
}

async function partnerEventNotification(db: D1Database, event: PartnerEventNode) {
  const type = event.type as PartnerEventType;
  const occurredAt = event.occurredAt!;
  const shopDomain = normalizeShopDomain(event.shop!.myshopifyDomain!);
  const [displayName, snapshot] = await Promise.all([
    persistShopDisplayName(db, shopDomain, event.shop!.name),
    readOperationalSnapshot(db, shopDomain),
  ]);
  if (type.startsWith("RELATIONSHIP_")) {
    const relationshipType = type as Extract<PartnerEventType, `RELATIONSHIP_${string}`>;
    const lifecycle = relationshipCopy(relationshipType);
    if (await hasEquivalentNotification(db, shopDomain, lifecycle.subject, occurredAt)) return null;
    return notificationStatement(db, {
      dedupeKey: await relationshipNotificationKey(
        shopDomain,
        relationshipType,
        snapshot?.installed_at ?? occurredAt,
      ),
      kind: "lifecycle",
      shopDomain,
      shopHash: await notificationShopHash(shopDomain),
      subject: lifecycle.subject,
      body: notificationBody(lifecycle.description, occurredAt, [
        storeSection(displayName, shopDomain, snapshot),
        operationalSection(snapshot, {
          appStatus: relationshipStatus(relationshipType),
          plan: operationalPlan(snapshot),
          installationDuration:
            type === "RELATIONSHIP_UNINSTALLED"
              ? formatDuration(snapshot?.installed_at, occurredAt)
              : null,
        }),
      ]),
      occurredAt,
    });
  }
  const charge = event.charge!;
  const currentKind = planKindFromCharge(type, charge.name);
  const previousKind = type.endsWith("_ACTIVATED")
    ? await previousPlanKind(db, shopDomain, charge.id!, currentKind)
    : null;
  const billing = billingCopy(type, previousKind !== null);
  if (await hasEquivalentNotification(db, shopDomain, billing.subject, occurredAt)) return null;
  const plan = safePlanName(charge.name) ?? planLabel(currentKind) ?? operationalPlan(snapshot);
  const billingDetails = [
    ...(previousKind ? [`Da: ${planLabel(previousKind)}`] : []),
    `${previousKind ? "A" : "Piano"}: ${plan}`,
    `Importo: ${formatMoney(charge.amount!, currentKind)}`,
    ...(validIsoDate(charge.billingOn ?? undefined)
      ? [`Prossimo addebito: ${formatDate(charge.billingOn!)}`]
      : []),
    ...(charge.test ? ["Modalità: test"] : []),
  ];
  return notificationStatement(db, {
    dedupeKey: await billingNotificationKey(charge.id!, partnerBillingState(type)),
    kind: "billing",
    shopDomain,
    shopHash: await notificationShopHash(shopDomain),
    subject: billing.subject,
    body: notificationBody(billing.description, occurredAt, [
      storeSection(displayName, shopDomain, snapshot),
      { title: "💳 Billing", lines: billingDetails },
      operationalSection(snapshot, { plan: null }),
    ]),
    occurredAt,
  });
}

async function readPartnerPayload(response: Response) {
  let payload: PartnerEventPage;
  try {
    payload = (await response.json()) as PartnerEventPage;
  } catch {
    throw new Error("partner_api_invalid_json");
  }
  if (payload.errors?.length) throw new Error("partner_api_graphql_error");
  return payload;
}

function requirePartnerConfig(config: PartnerInstallConfig) {
  if (!config.organizationId.trim() || !config.appId.trim() || !config.accessToken.trim()) {
    throw new Error("partner_api_configuration_incomplete");
  }
}
