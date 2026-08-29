import { trialLedgerHash } from "./hash.server";
import {
  type LocalBillingEvent,
  type LocalNotificationEvent,
  type OperationalSnapshot,
  type PartnerEventNode,
  type PartnerEventType,
  localBillingPlan,
  localNotificationEvent,
  normalizeShopDomain,
  planKindFromCharge,
  planLabel,
  safePlanName,
  validCalendarDate,
  validIsoDate,
  validLocalBillingEvent,
  validMinorMoney,
  validPartnerEvent,
} from "./owner-notifications/model";
import {
  billingCopy,
  formatCalendarDate,
  formatDate,
  formatDuration,
  formatMinorMoney,
  formatMoney,
  localBillingCopy,
  localBillingState,
  notificationBody,
  operationalPlan,
  operationalSection,
  partnerBillingState,
  relationshipCopy,
  relationshipStatus,
  storeSection,
  trialDaysRemaining,
} from "./owner-notifications/presentation";
import { persistShopDisplayName } from "./shop-profile.server";

export { deliverOwnerNotifications } from "./owner-notifications/delivery.server";

const PARTNER_API_VERSION = "2026-07";
const PARTNER_POLL_REPLAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const LOCAL_EVENT_CURSOR_KEY = "local_notification_event_id";
const BILLING_EVENT_CURSOR_KEY = "billing_notification_event_id";

type PartnerInstallConfig = {
  organizationId: string;
  appId: string;
  accessToken: string;
};

type PartnerEventPage = {
  data?: {
    app?: {
      events?: {
        edges?: Array<{
          cursor?: string;
          node?: PartnerEventNode;
        }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

const PARTNER_EVENTS_QUERY = `#graphql
  query OwnerAppNotifications(
    $appId: ID!
    $after: String
    $occurredAtMin: DateTime!
    $first: Int!
  ) {
    app(id: $appId) {
      events(
        first: $first
        after: $after
        occurredAtMin: $occurredAtMin
        types: [
          RELATIONSHIP_INSTALLED
          RELATIONSHIP_REACTIVATED
          RELATIONSHIP_DEACTIVATED
          RELATIONSHIP_UNINSTALLED
          SUBSCRIPTION_CHARGE_ACCEPTED
          SUBSCRIPTION_CHARGE_ACTIVATED
          SUBSCRIPTION_CHARGE_CANCELED
          SUBSCRIPTION_CHARGE_DECLINED
          SUBSCRIPTION_CHARGE_EXPIRED
          SUBSCRIPTION_CHARGE_FROZEN
          SUBSCRIPTION_CHARGE_UNFROZEN
          ONE_TIME_CHARGE_ACCEPTED
          ONE_TIME_CHARGE_ACTIVATED
          ONE_TIME_CHARGE_DECLINED
          ONE_TIME_CHARGE_EXPIRED
        ]
      ) {
        edges {
          cursor
          node {
            type
            occurredAt
            shop { id myshopifyDomain name }
            ... on AppSubscriptionEvent {
              charge {
                id
                name
                amount { amount currencyCode }
                billingOn
                test
              }
            }
            ... on AppPurchaseOneTimeEvent {
              charge {
                id
                name
                amount { amount currencyCode }
                test
              }
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
  const occurredAtMin = await pollStart(db, "partner_events_polled_at", now);
  const fetcher = options.fetcher ?? fetch;
  let after: string | null = null;
  let inserted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
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
          variables: { appId: config.appId, after, occurredAtMin, first: PAGE_SIZE },
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
          if (!validPartnerEvent(node)) {
            throw new Error("partner_api_invalid_payload");
          }
          return partnerEventNotification(db, node);
        }),
      )
    ).filter((notification) => notification !== null);
    if (notifications.length) {
      const results = await db.batch(notifications);
      inserted += results.reduce((total, result) => total + result.meta.changes, 0);
    }

    const pageInfo = events.pageInfo;
    if (!pageInfo.hasNextPage) {
      await writeState(db, "partner_events_polled_at", cycleStartedAt);
      return { inserted, occurredAtMin, pages: page + 1 };
    }
    const endCursor = events.edges.at(-1)?.cursor;
    if (!endCursor || endCursor === after) {
      throw new Error("partner_api_invalid_cursor");
    }
    after = endCursor;
  }

  throw new Error("partner_api_page_limit");
}

export async function pollLocalNotifications(db: D1Database, now = new Date()) {
  const local = await pollLocalAppEvents(db, now);
  // Il bootstrap billing usa l'istante della prima riga outbox, che il poll locale può avere
  // appena creato: l'ordine evita di escludere transizioni precedenti al primo ciclo completo.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const billing = await pollLocalBillingEvents(db, now);
  return {
    inserted: local.inserted + billing.inserted,
    pages: local.pages + billing.pages,
    localAfterId: local.afterId,
    billingAfterId: billing.afterId,
  };
}

async function pollLocalAppEvents(db: D1Database, now: Date) {
  let afterId = await localEventCursor(db);
  let inserted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { results } = await db
      .prepare(
        `SELECT e.id, e.event_name, e.occurred_at, s.shop_domain, s.display_name,
                s.installation_status, s.country_code, s.shop_currency, s.billing_currency,
                s.installed_at, a.onboarding_status, a.onboarding_step, a.validation_enabled,
                t.status AS trial_status, t.ends_at, b.plan_kind, b.entitlement_status,
                EXISTS (
                  SELECT 1 FROM app_events previous
                  WHERE previous.shop_id = e.shop_id
                    AND previous.event_name = 'app_uninstalled'
                    AND previous.id < e.id
                ) AS reinstalled
         FROM app_events e
         LEFT JOIN shops s ON s.id = e.shop_id
         LEFT JOIN app_state a ON a.shop_id = s.id
         LEFT JOIN trials t ON t.shop_id = s.id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         WHERE e.id > ?
         ORDER BY e.id
         LIMIT ?`,
      )
      .bind(afterId, PAGE_SIZE)
      .all<LocalNotificationEvent>();

    const statements = (
      await Promise.all(
        results.map((event) => {
          if (!localNotificationEvent(event)) return null;
          if (!event.shop_domain) return null;
          if (!validIsoDate(event.occurred_at)) throw new Error("billing_event_invalid_timestamp");
          return localEventNotification(db, event);
        }),
      )
    ).filter((statement) => statement !== null);
    if (statements.length) {
      const writes = await db.batch(statements);
      inserted += writes.reduce((total, result) => total + result.meta.changes, 0);
    }

    if (results.length) {
      afterId = results.at(-1)!.id;
      await writeState(db, LOCAL_EVENT_CURSOR_KEY, String(afterId), now);
    }
    if (results.length < PAGE_SIZE) {
      return { inserted, afterId, pages: page + 1 };
    }
  }

  throw new Error("local_notification_page_limit");
}

async function pollLocalBillingEvents(db: D1Database, now: Date) {
  let afterId = await billingEventCursor(db, now);
  let inserted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { results } = await db
      .prepare(
        `SELECT e.id, e.shopify_resource_gid, e.event_type, e.status, e.amount_minor,
                e.currency, e.period_end, e.occurred_at, e.previous_plan_kind,
                s.shop_domain, s.display_name, s.installation_status, s.country_code,
                s.shop_currency, s.billing_currency, s.installed_at,
                a.onboarding_status, a.onboarding_step, a.validation_enabled,
                t.status AS trial_status, t.ends_at AS trial_ends_at,
                b.plan_kind, b.entitlement_status
         FROM billing_events e
         LEFT JOIN shops s ON s.id = e.shop_id
         LEFT JOIN app_state a ON a.shop_id = s.id
         LEFT JOIN trials t ON t.shop_id = s.id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         WHERE e.id > ?
         ORDER BY e.id
         LIMIT ?`,
      )
      .bind(afterId, PAGE_SIZE)
      .all<LocalBillingEvent>();

    const statements = (
      await Promise.all(
        results.map((event) => {
          if (!event.shop_domain) return null;
          if (!validLocalBillingEvent(event)) {
            throw new Error("billing_event_invalid_payload");
          }
          return localBillingNotification(db, event);
        }),
      )
    ).filter((statement) => statement !== null);
    if (statements.length) {
      const writes = await db.batch(statements);
      inserted += writes.reduce((total, result) => total + result.meta.changes, 0);
    }

    if (results.length) {
      afterId = results.at(-1)!.id;
      await writeState(db, BILLING_EVENT_CURSOR_KEY, String(afterId), now);
    }
    if (results.length < PAGE_SIZE) {
      return { inserted, afterId, pages: page + 1 };
    }
  }

  throw new Error("billing_notification_page_limit");
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
    const appStatus = relationshipStatus(relationshipType);
    const installationDuration =
      type === "RELATIONSHIP_UNINSTALLED"
        ? formatDuration(snapshot?.installed_at, occurredAt)
        : null;
    return notificationStatement(db, {
      dedupeKey: await relationshipNotificationKey(
        shopDomain,
        relationshipType,
        snapshot?.installed_at ?? occurredAt,
      ),
      kind: "lifecycle",
      shopDomain,
      shopHash: await trialLedgerHash(shopDomain),
      subject: lifecycle.subject,
      body: notificationBody(lifecycle.description, occurredAt, [
        storeSection(displayName, shopDomain, snapshot),
        operationalSection(snapshot, {
          appStatus,
          plan: operationalPlan(snapshot),
          installationDuration,
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
    shopHash: await trialLedgerHash(shopDomain),
    subject: billing.subject,
    body: notificationBody(billing.description, occurredAt, [
      storeSection(displayName, shopDomain, snapshot),
      { title: "💳 Billing", lines: billingDetails },
      operationalSection(snapshot, { plan: null }),
    ]),
    occurredAt,
  });
}

async function localEventNotification(db: D1Database, event: LocalNotificationEvent) {
  if (event.event_name === "app_installed" || event.event_name === "app_uninstalled") {
    return localRelationshipNotification(db, event);
  }
  if (event.event_name.startsWith("trial_")) return trialNotification(db, event);

  const shopDomain = normalizeShopDomain(event.shop_domain);
  const eventName = event.event_name as
    | "onboarding_completed"
    | "validation_enabled"
    | "validation_disabled";
  const copy = {
    onboarding_completed: {
      subject: "✅ CF Ready · Onboarding completato",
      description: "Il merchant ha completato la configurazione iniziale.",
    },
    validation_enabled: {
      subject: "🟢 CF Ready · Validation attivata",
      description: "La Validation di CF Ready è stata attivata.",
    },
    validation_disabled: {
      subject: "🟡 CF Ready · Validation disattivata",
      description: "La Validation di CF Ready è stata disattivata.",
    },
  }[eventName];
  const validationStatus = eventName.startsWith("validation_")
    ? eventName === "validation_enabled"
      ? "Attiva"
      : "Non attiva"
    : undefined;
  return notificationStatement(db, {
    dedupeKey: await notificationKey("local", String(event.id)),
    kind: "lifecycle",
    shopDomain,
    shopHash: await trialLedgerHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      operationalSection(event, {
        onboardingStatus: eventName === "onboarding_completed" ? "Completato" : undefined,
        validationStatus,
        plan: operationalPlan(event),
      }),
    ]),
    occurredAt: event.occurred_at,
  });
}

async function localRelationshipNotification(db: D1Database, event: LocalNotificationEvent) {
  const shopDomain = normalizeShopDomain(event.shop_domain);
  const type: Extract<PartnerEventType, `RELATIONSHIP_${string}`> =
    event.event_name === "app_uninstalled"
      ? "RELATIONSHIP_UNINSTALLED"
      : event.reinstalled
        ? "RELATIONSHIP_REACTIVATED"
        : "RELATIONSHIP_INSTALLED";
  const copy = relationshipCopy(type);
  if (await hasEquivalentNotification(db, shopDomain, copy.subject, event.occurred_at)) return null;
  return notificationStatement(db, {
    dedupeKey: await relationshipNotificationKey(shopDomain, type, event.installed_at),
    kind: "lifecycle",
    shopDomain,
    shopHash: await trialLedgerHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      operationalSection(event, {
        appStatus: relationshipStatus(type),
        plan: operationalPlan(event),
        installationDuration:
          event.event_name === "app_uninstalled"
            ? formatDuration(event.installed_at, event.occurred_at)
            : null,
      }),
    ]),
    occurredAt: event.occurred_at,
  });
}

async function localBillingNotification(db: D1Database, event: LocalBillingEvent) {
  const shopDomain = normalizeShopDomain(event.shop_domain);
  const planKind = localBillingPlan(event);
  if (!planKind) throw new Error("billing_event_invalid_payload");
  const changed =
    event.event_type === "active" &&
    event.previous_plan_kind !== null &&
    event.previous_plan_kind !== "none" &&
    event.previous_plan_kind !== planKind;
  const copy = localBillingCopy(event.event_type, planKind, changed);
  if (await hasEquivalentNotification(db, shopDomain, copy.subject, event.occurred_at)) return null;
  const details = [
    ...(changed ? [`Da: ${planLabel(event.previous_plan_kind)}`] : []),
    `${changed ? "A" : "Piano"}: ${planLabel(planKind)}`,
    ...(validMinorMoney(event.amount_minor, event.currency)
      ? [`Importo: ${formatMinorMoney(event.amount_minor!, event.currency!, planKind)}`]
      : []),
    ...(validCalendarDate(event.period_end ?? undefined)
      ? [
          `${event.event_type === "ending" ? "Accesso fino al" : "Prossimo addebito"}: ${formatCalendarDate(event.period_end!)}`,
        ]
      : []),
  ];
  return notificationStatement(db, {
    dedupeKey: await billingNotificationKey(
      event.shopify_resource_gid,
      localBillingState(event.event_type),
    ),
    kind: "billing",
    shopDomain,
    shopHash: await trialLedgerHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      { title: "💳 Billing", lines: details },
      operationalSection(event, { plan: null }),
    ]),
    occurredAt: event.occurred_at,
  });
}

async function trialNotification(db: D1Database, event: LocalNotificationEvent) {
  const copy = {
    trial_started: {
      subject: "🧪 CF Ready · Prova gratuita attivata",
      description: "Il merchant ha attivato la prova gratuita.",
      status: "Attiva",
      plan: "Prova gratuita",
    },
    trial_expired: {
      subject: "🟡 CF Ready · Prova gratuita terminata",
      description: "La prova gratuita è terminata.",
      status: "Terminata",
      plan: "Prova gratuita (terminata)",
    },
    trial_converted: {
      subject: "🟢 CF Ready · Prova convertita",
      description: "La prova gratuita è stata convertita in un piano a pagamento.",
      status: "Convertita",
      plan: planLabel(event.plan_kind) ?? "Piano a pagamento",
    },
  }[event.event_name as "trial_started" | "trial_expired" | "trial_converted"];
  const shopDomain = normalizeShopDomain(event.shop_domain);
  const remainingDays = trialDaysRemaining(event.occurred_at, event.ends_at);
  const trialDetails = [
    `Stato: ${copy.status}`,
    `Piano: ${copy.plan}`,
    ...(event.event_name === "trial_started" && validCalendarDate(event.ends_at ?? undefined)
      ? [`Termine prova: ${formatCalendarDate(event.ends_at!)}`]
      : []),
    ...(event.event_name === "trial_started" && remainingDays !== null
      ? [`Giorni disponibili: ${remainingDays}`]
      : []),
  ];
  return notificationStatement(db, {
    dedupeKey: await notificationKey("trial", String(event.id)),
    kind: "trial",
    shopDomain,
    shopHash: await trialLedgerHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      { title: "🧪 Prova", lines: trialDetails },
      operationalSection(event, { plan: null }),
    ]),
    occurredAt: event.occurred_at,
  });
}

function notificationStatement(
  db: D1Database,
  notification: {
    dedupeKey: string;
    kind: "lifecycle" | "billing" | "trial";
    shopDomain: string;
    shopHash: string;
    subject: string;
    body: string;
    occurredAt: string;
  },
) {
  return db
    .prepare(
      `INSERT INTO owner_notifications (
         dedupe_key, notification_kind, shop_domain, subject, body_text, source_occurred_at,
         status, available_at, created_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM owner_notification_redactions
         WHERE shop_hash = ? AND redacted_at >= ?
       )
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .bind(
      notification.dedupeKey,
      notification.kind,
      notification.shopDomain,
      notification.subject,
      notification.body,
      notification.occurredAt,
      notification.occurredAt,
      notification.occurredAt,
      notification.occurredAt,
      notification.shopHash,
      notification.occurredAt,
    );
}

async function readOperationalSnapshot(db: D1Database, shopDomain: string) {
  return db
    .prepare(
      `SELECT s.display_name, s.installation_status, s.country_code, s.shop_currency,
              s.billing_currency, s.installed_at, a.onboarding_status, a.onboarding_step,
              a.validation_enabled, t.status AS trial_status, t.ends_at AS trial_ends_at,
              b.plan_kind, b.entitlement_status
       FROM shops s
       LEFT JOIN app_state a ON a.shop_id = s.id
       LEFT JOIN billing_accounts b ON b.shop_id = s.id
       LEFT JOIN trials t ON t.shop_id = s.id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<OperationalSnapshot>();
}

async function previousPlanKind(
  db: D1Database,
  shopDomain: string,
  chargeId: string,
  currentKind: "monthly" | "annual" | "one_time" | null,
) {
  if (!currentKind) return null;
  const transition = await db
    .prepare(
      `SELECT previous_plan_kind
       FROM billing_events
       WHERE shopify_resource_gid = ? AND event_type = 'active'
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(chargeId)
    .first<{ previous_plan_kind: string | null }>();
  const previous = transition?.previous_plan_kind;
  if (previous && previous !== "none" && previous !== currentKind) {
    return previous as "monthly" | "annual" | "one_time";
  }

  const account = await db
    .prepare(
      `SELECT b.plan_kind FROM billing_accounts b
       JOIN shops s ON s.id = b.shop_id WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{ plan_kind: string }>();
  return account?.plan_kind && account.plan_kind !== "none" && account.plan_kind !== currentKind
    ? (account.plan_kind as "monthly" | "annual" | "one_time")
    : null;
}

async function pollStart(db: D1Database, key: string, now: Date) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  const previous = state && validIsoDate(state.state_value) ? Date.parse(state.state_value) : null;
  return new Date(
    previous === null ? now.getTime() - PARTNER_POLL_REPLAY_MS : previous - PARTNER_POLL_REPLAY_MS,
  ).toISOString();
}

async function localEventCursor(db: D1Database) {
  const existing = await readIntegerState(db, LOCAL_EVENT_CURSOR_KEY);
  if (existing !== null) return existing;

  const legacy = await db
    .prepare(
      "SELECT state_value FROM owner_notification_state WHERE state_key = 'local_notifications_polled_at'",
    )
    .first<{ state_value: string }>();
  if (!legacy || !validIsoDate(legacy.state_value)) return 0;
  const row = await db
    .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM app_events WHERE occurred_at <= ?")
    .bind(legacy.state_value)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

async function billingEventCursor(db: D1Database, now: Date) {
  const existing = await readIntegerState(db, BILLING_EVENT_CURSOR_KEY);
  if (existing !== null) return existing;

  // Al primo avvio recupera le transizioni avvenute da quando l'outbox esiste. Questo include
  // eventi Partner persi, senza rispedire acquisti precedenti all'attivazione delle notifiche.
  const firstNotification = await db
    .prepare("SELECT MIN(created_at) AS created_at FROM owner_notifications")
    .first<{ created_at: string | null }>();
  const coverageStartedAt = validIsoDate(firstNotification?.created_at ?? undefined)
    ? firstNotification!.created_at!
    : new Date(now.getTime() - PARTNER_POLL_REPLAY_MS).toISOString();
  const row = await db
    .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM billing_events WHERE occurred_at < ?")
    .bind(coverageStartedAt)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

async function readIntegerState(db: D1Database, key: string) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  if (!state || !/^\d+$/.test(state.state_value)) return null;
  const value = Number(state.state_value);
  return Number.isSafeInteger(value) ? value : null;
}

async function writeState(db: D1Database, key: string, value: string, now = new Date()) {
  const updatedAt = now.toISOString();
  await db
    .prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         state_value = excluded.state_value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, value, updatedAt)
    .run();
}

async function relationshipNotificationKey(
  shopDomain: string,
  type: Extract<PartnerEventType, `RELATIONSHIP_${string}`>,
  installationStartedAt: string,
) {
  const transition = type.toLocaleLowerCase("en-US").replace("relationship_", "");
  return notificationKey("relationship", `${shopDomain}:${installationStartedAt}:${transition}`);
}

async function hasEquivalentNotification(
  db: D1Database,
  shopDomain: string,
  subject: string,
  occurredAt: string,
) {
  const match = await db
    .prepare(
      `SELECT id FROM owner_notifications
       WHERE shop_domain = ? AND subject = ?
         AND ABS(unixepoch(source_occurred_at) - unixepoch(?)) <= 300
       LIMIT 1`,
    )
    .bind(shopDomain, subject, occurredAt)
    .first<{ id: number }>();
  return match !== null;
}

function billingNotificationKey(resourceId: string, state: string) {
  return notificationKey("billing", `${resourceId}:${state}`);
}

async function notificationKey(kind: string, source: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${kind}:${source}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
