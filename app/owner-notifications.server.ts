import { recordEvent } from "./events.server";
import { trialLedgerHash } from "./hash.server";

const PARTNER_API_VERSION = "2026-07";
const FIRST_POLL_LOOKBACK_MS = 15 * 60 * 1000;
const POLL_OVERLAP_MS = 5 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const OWNER_NOTIFICATION_DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

type PartnerInstallConfig = {
  organizationId: string;
  appId: string;
  accessToken: string;
};

const PARTNER_EVENT_TYPES = [
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_DEACTIVATED",
  "RELATIONSHIP_UNINSTALLED",
  "SUBSCRIPTION_CHARGE_ACCEPTED",
  "SUBSCRIPTION_CHARGE_ACTIVATED",
  "SUBSCRIPTION_CHARGE_CANCELED",
  "SUBSCRIPTION_CHARGE_DECLINED",
  "SUBSCRIPTION_CHARGE_EXPIRED",
  "SUBSCRIPTION_CHARGE_FROZEN",
  "SUBSCRIPTION_CHARGE_UNFROZEN",
  "ONE_TIME_CHARGE_ACCEPTED",
  "ONE_TIME_CHARGE_ACTIVATED",
  "ONE_TIME_CHARGE_DECLINED",
  "ONE_TIME_CHARGE_EXPIRED",
] as const;

type PartnerEventType = (typeof PARTNER_EVENT_TYPES)[number];

type PartnerCharge = {
  id?: string;
  name?: string;
  billingOn?: string | null;
  test?: boolean;
};

type PartnerEventNode = {
  type?: string;
  occurredAt?: string;
  shop?: { id?: string; myshopifyDomain?: string };
  charge?: PartnerCharge;
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

type NotificationRow = {
  id: number;
  notification_kind: "lifecycle" | "billing" | "trial";
  subject: string;
  body_text: string;
  claim_token: string;
  attempts: number;
};

type TelegramConfig = {
  botToken: string;
  chatId: string;
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
            shop { id myshopifyDomain }
            ... on AppSubscriptionEvent {
              charge {
                id
                name
                billingOn
                test
              }
            }
            ... on AppPurchaseOneTimeEvent {
              charge {
                id
                name
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

    const notifications = await Promise.all(
      events.edges.map(async ({ node }) => {
        if (!validPartnerEvent(node)) {
          throw new Error("partner_api_invalid_payload");
        }
        return partnerEventNotification(db, node);
      }),
    );
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

export async function pollTrialNotifications(db: D1Database, now = new Date()) {
  const cycleStartedAt = now.toISOString();
  const occurredAtMin = await pollStart(db, "trial_notifications_polled_at", now);
  let afterId = 0;
  let inserted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { results } = await db
      .prepare(
        `SELECT e.id, e.event_name, e.occurred_at, s.shop_domain, t.ends_at,
                b.plan_kind
         FROM app_events e
         JOIN shops s ON s.id = e.shop_id
         LEFT JOIN trials t ON t.shop_id = s.id
         LEFT JOIN billing_accounts b ON b.shop_id = s.id
         WHERE e.event_name IN ('trial_started', 'trial_expired', 'trial_converted')
           AND e.occurred_at >= ? AND e.id > ?
         ORDER BY e.id
         LIMIT ?`,
      )
      .bind(occurredAtMin, afterId, PAGE_SIZE)
      .all<{
        id: number;
        event_name: "trial_started" | "trial_expired" | "trial_converted";
        shop_domain: string;
        ends_at: string | null;
        plan_kind: "monthly" | "annual" | "one_time" | "none" | null;
        occurred_at: string;
      }>();

    const statements = await Promise.all(
      results.map((event) => {
        if (!validIsoDate(event.occurred_at)) throw new Error("billing_event_invalid_timestamp");
        return trialNotification(db, event);
      }),
    );
    if (statements.length) {
      const writes = await db.batch(statements);
      inserted += writes.reduce((total, result) => total + result.meta.changes, 0);
    }

    if (results.length < PAGE_SIZE) {
      await writeState(db, "trial_notifications_polled_at", cycleStartedAt);
      return { inserted, occurredAtMin, pages: page + 1 };
    }
    afterId = results.at(-1)!.id;
  }

  throw new Error("trial_notification_page_limit");
}

export async function deliverOwnerNotifications(
  db: D1Database,
  config: TelegramConfig,
  options: { now?: Date; max?: number; fetcher?: typeof fetch } = {},
) {
  requireTelegramConfig(config);
  const now = options.now ?? new Date();
  const max = options.max ?? MAX_DELIVERIES_PER_RUN;
  const fetcher = options.fetcher ?? fetch;
  let sent = 0;
  let failed = 0;

  // Claim e invio sono intenzionalmente seriali: impediscono burst e rendono ogni retry
  // indipendente. La chiave univoca D1 evita doppie notifiche da poll e webhook ripetuti.
  for (let index = 0; index < max; index += 1) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const notification = await claimNotification(db, now);
    if (!notification) break;

    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const response = await fetcher(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: `${notification.subject}\n\n${notification.body_text}`,
          protect_content: true,
        }),
      });
      // Telegram può rispondere HTTP 200 con `ok: false`: entrambi i livelli sono necessari.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const result = await readTelegramResult(response);
      if (!response.ok || !result.ok) {
        throw new Error("telegram_send_failed");
      }
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (!(await markSent(db, notification, now)))
        throw new Error("owner_notification_claim_lost");
      sent += 1;
    } catch (error) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await markFailed(db, notification, now);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await recordEvent(db, {
        name: "owner_notification_send_failed",
        class: "error",
        metadata: {
          reason: notification.notification_kind,
          error_code: stableErrorCode(error),
        },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}

async function partnerEventNotification(db: D1Database, event: PartnerEventNode) {
  const type = event.type as PartnerEventType;
  const occurredAt = event.occurredAt!;
  const shopDomain = normalizeShopDomain(event.shop!.myshopifyDomain!);
  const source = `${type}:${event.shop!.id}:${event.charge?.id ?? "relationship"}:${occurredAt}`;
  const dedupeKey = await notificationKey("partner", source);

  if (type.startsWith("RELATIONSHIP_")) {
    const lifecycle = relationshipCopy(type);
    const localPlan = await localPlanForShop(db, shopDomain);
    return notificationStatement(db, {
      dedupeKey,
      kind: "lifecycle",
      shopDomain,
      shopHash: await trialLedgerHash(shopDomain),
      subject: lifecycle.subject,
      body: `${lifecycle.description}\n\nStore: ${shopDomain}\nPiano: ${localPlan}\nData: ${formatDate(occurredAt)}`,
      occurredAt,
    });
  }

  const charge = event.charge!;
  const currentKind = planKindFromCharge(type, charge.name);
  const [localPlan, previousKind] = await Promise.all([
    localPlanForShop(db, shopDomain),
    type.endsWith("_ACTIVATED")
      ? previousPlanKind(db, shopDomain, charge.id!, currentKind)
      : Promise.resolve(null),
  ]);
  const billing = billingCopy(type, previousKind !== null);
  const plan = safePlanName(charge.name) ?? planLabel(currentKind) ?? localPlan;
  const details = [
    `Store: ${shopDomain}`,
    ...(previousKind ? [`Da: ${planLabel(previousKind)}`] : []),
    `${previousKind ? "A" : "Piano"}: ${plan}`,
    ...(validIsoDate(charge.billingOn ?? undefined)
      ? [`Prossimo addebito: ${formatDate(charge.billingOn!)}`]
      : []),
    ...(charge.test ? ["Modalità: test"] : []),
    `Data: ${formatDate(occurredAt)}`,
  ];
  return notificationStatement(db, {
    dedupeKey,
    kind: "billing",
    shopDomain,
    shopHash: await trialLedgerHash(shopDomain),
    subject: billing.subject,
    body: `${billing.description}\n\n${details.join("\n")}`,
    occurredAt,
  });
}

async function trialNotification(
  db: D1Database,
  event: {
    id: number;
    event_name: "trial_started" | "trial_expired" | "trial_converted";
    shop_domain: string;
    ends_at: string | null;
    plan_kind: "monthly" | "annual" | "one_time" | "none" | null;
    occurred_at: string;
  },
) {
  const copy = {
    trial_started: {
      subject: "CF Ready: prova gratuita attivata",
      description: "Il merchant ha attivato la prova gratuita.",
      plan: "Prova gratuita",
    },
    trial_expired: {
      subject: "CF Ready: prova gratuita terminata",
      description: "La prova gratuita è terminata.",
      plan: "Prova gratuita (terminata)",
    },
    trial_converted: {
      subject: "CF Ready: prova convertita",
      description: "La prova gratuita è stata convertita in un piano a pagamento.",
      plan: planLabel(event.plan_kind) ?? "Piano a pagamento",
    },
  }[event.event_name];
  const details = [
    `Store: ${normalizeShopDomain(event.shop_domain)}`,
    `Piano: ${copy.plan}`,
    ...(event.event_name === "trial_started" && validIsoDate(event.ends_at ?? undefined)
      ? [`Termine prova: ${formatDate(event.ends_at!)}`]
      : []),
    `Data: ${formatDate(event.occurred_at)}`,
  ];
  return notificationStatement(db, {
    dedupeKey: await notificationKey("trial", String(event.id)),
    kind: "trial",
    shopDomain: normalizeShopDomain(event.shop_domain),
    shopHash: await trialLedgerHash(normalizeShopDomain(event.shop_domain)),
    subject: copy.subject,
    body: `${copy.description}\n\n${details.join("\n")}`,
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

async function localPlanForShop(db: D1Database, shopDomain: string) {
  const state = await db
    .prepare(
      `SELECT b.plan_kind, t.status AS trial_status
       FROM shops s
       LEFT JOIN billing_accounts b ON b.shop_id = s.id
       LEFT JOIN trials t ON t.shop_id = s.id
       WHERE s.shop_domain = ?`,
    )
    .bind(shopDomain)
    .first<{ plan_kind: string | null; trial_status: string | null }>();
  return (
    planLabel(state?.plan_kind) ??
    (state?.trial_status === "active" ? "Prova gratuita" : "Nessun piano attivo")
  );
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

function relationshipCopy(type: PartnerEventType) {
  return {
    RELATIONSHIP_INSTALLED: {
      subject: "CF Ready: nuova installazione",
      description: "Shopify ha registrato una nuova installazione di CF Ready.",
    },
    RELATIONSHIP_REACTIVATED: {
      subject: "CF Ready: reinstallazione",
      description: "Shopify ha registrato una reinstallazione o riattivazione di CF Ready.",
    },
    RELATIONSHIP_DEACTIVATED: {
      subject: "CF Ready: app disattivata",
      description: "Shopify ha disattivato la relazione con CF Ready.",
    },
    RELATIONSHIP_UNINSTALLED: {
      subject: "CF Ready: disinstallazione",
      description: "Shopify ha registrato la disinstallazione di CF Ready.",
    },
  }[type as Extract<PartnerEventType, `RELATIONSHIP_${string}`>];
}

function billingCopy(type: PartnerEventType, changed: boolean) {
  if (changed) {
    return {
      subject: "CF Ready: piano cambiato",
      description: "Shopify ha attivato il passaggio a un altro piano.",
    };
  }
  return {
    SUBSCRIPTION_CHARGE_ACCEPTED: {
      subject: "CF Ready: acquisto piano accettato",
      description: "Il merchant ha accettato l'acquisto del piano.",
    },
    SUBSCRIPTION_CHARGE_ACTIVATED: {
      subject: "CF Ready: piano attivato",
      description: "Shopify ha attivato il nuovo piano.",
    },
    SUBSCRIPTION_CHARGE_CANCELED: {
      subject: "CF Ready: abbonamento disdetto",
      description: "L'abbonamento è stato disdetto.",
    },
    SUBSCRIPTION_CHARGE_DECLINED: {
      subject: "CF Ready: acquisto piano rifiutato",
      description: "Il merchant ha rifiutato l'acquisto del piano.",
    },
    SUBSCRIPTION_CHARGE_EXPIRED: {
      subject: "CF Ready: richiesta piano scaduta",
      description: "La richiesta di attivazione del piano è scaduta.",
    },
    SUBSCRIPTION_CHARGE_FROZEN: {
      subject: "CF Ready: abbonamento sospeso",
      description: "Shopify ha sospeso l'abbonamento per un problema di fatturazione dello store.",
    },
    SUBSCRIPTION_CHARGE_UNFROZEN: {
      subject: "CF Ready: abbonamento riattivato",
      description: "Shopify ha riattivato l'abbonamento precedentemente sospeso.",
    },
    ONE_TIME_CHARGE_ACCEPTED: {
      subject: "CF Ready: pagamento unico accettato",
      description: "Il merchant ha accettato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_ACTIVATED: {
      subject: "CF Ready: pagamento unico attivato",
      description: "Shopify ha attivato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_DECLINED: {
      subject: "CF Ready: pagamento unico rifiutato",
      description: "Il merchant ha rifiutato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_EXPIRED: {
      subject: "CF Ready: pagamento unico scaduto",
      description: "La richiesta del piano con pagamento unico è scaduta.",
    },
  }[type as Exclude<PartnerEventType, `RELATIONSHIP_${string}`>];
}

async function pollStart(db: D1Database, key: string, now: Date) {
  const state = await db
    .prepare("SELECT state_value FROM owner_notification_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  const previous = state && validIsoDate(state.state_value) ? Date.parse(state.state_value) : null;
  return new Date(
    previous === null ? now.getTime() - FIRST_POLL_LOOKBACK_MS : previous - POLL_OVERLAP_MS,
  ).toISOString();
}

async function writeState(db: D1Database, key: string, value: string) {
  await db
    .prepare(
      `INSERT INTO owner_notification_state (state_key, state_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         state_value = excluded.state_value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, value, value)
    .run();
}

async function claimNotification(db: D1Database, now: Date) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  const token = crypto.randomUUID();
  await db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'failed', claim_token = NULL, claimed_at = NULL,
           last_error_code = 'telegram_send_interrupted', updated_at = ?
       WHERE status = 'processing' AND claimed_at <= ? AND attempts >= ?`,
    )
    .bind(nowIso, staleBefore, MAX_DELIVERY_ATTEMPTS)
    .run();
  return db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'processing', claim_token = ?, claimed_at = ?, attempts = attempts + 1,
           updated_at = ?
       WHERE id = (
         SELECT id FROM owner_notifications
         WHERE available_at <= ?
           AND attempts < ?
           AND (status = 'pending' OR (status = 'processing' AND claimed_at <= ?))
         ORDER BY id
         LIMIT 1
       )
       RETURNING id, notification_kind, subject, body_text, claim_token, attempts`,
    )
    .bind(token, nowIso, nowIso, nowIso, MAX_DELIVERY_ATTEMPTS, staleBefore)
    .first<NotificationRow>();
}

async function markSent(db: D1Database, notification: NotificationRow, now: Date) {
  const nowIso = now.toISOString();
  const result = await db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'sent', sent_at = ?, claim_token = NULL, claimed_at = NULL,
           last_error_code = NULL, updated_at = ?
       WHERE id = ? AND status = 'processing' AND claim_token = ?
       RETURNING id`,
    )
    .bind(nowIso, nowIso, notification.id, notification.claim_token)
    .first<{ id: number }>();
  return result !== null;
}

async function markFailed(db: D1Database, notification: NotificationRow, now: Date) {
  const terminal = notification.attempts >= MAX_DELIVERY_ATTEMPTS;
  const delayMinutes = Math.min(6 * 60, 5 * 2 ** Math.max(0, notification.attempts - 1));
  const availableAt = new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();
  await db
    .prepare(
      `UPDATE owner_notifications
       SET status = ?, available_at = ?, claim_token = NULL, claimed_at = NULL,
           last_error_code = 'telegram_send_failed', updated_at = ?
       WHERE id = ? AND status = 'processing' AND claim_token = ?`,
    )
    .bind(
      terminal ? "failed" : "pending",
      availableAt,
      now.toISOString(),
      notification.id,
      notification.claim_token,
    )
    .run();
}

async function notificationKey(kind: "partner" | "trial", source: string) {
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

function requireTelegramConfig(config: TelegramConfig) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.botToken.trim())) {
    throw new Error("telegram_bot_token_invalid");
  }
  if (!/^-?\d+$/.test(config.chatId.trim())) {
    throw new Error("telegram_chat_id_invalid");
  }
}

async function readTelegramResult(response: Response) {
  try {
    return (await response.json()) as { ok?: boolean };
  } catch {
    throw new Error("telegram_invalid_response");
  }
}

function formatDate(value: string) {
  return OWNER_NOTIFICATION_DATE_FORMATTER.format(new Date(value));
}

function planKindFromCharge(type: PartnerEventType, name: string | undefined) {
  if (type.startsWith("ONE_TIME_")) return "one_time" as const;
  const normalized = name?.toLocaleLowerCase("it-IT") ?? "";
  if (normalized.includes("annuale")) return "annual" as const;
  if (normalized.includes("mensile")) return "monthly" as const;
  return null;
}

function planLabel(kind: string | null | undefined) {
  return {
    monthly: "Mensile",
    annual: "Annuale",
    one_time: "Pagamento unico",
  }[kind ?? ""];
}

function safePlanName(value: string | undefined) {
  if (!value) return null;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function normalizeShopDomain(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error("partner_api_invalid_shop_domain");
  }
  return normalized;
}

function validPartnerEvent(node: PartnerEventNode | undefined): node is PartnerEventNode {
  if (
    !node ||
    !PARTNER_EVENT_TYPES.includes(node.type as PartnerEventType) ||
    !node.shop?.id ||
    !node.shop.myshopifyDomain ||
    !validIsoDate(node.occurredAt)
  ) {
    return false;
  }
  try {
    normalizeShopDomain(node.shop.myshopifyDomain);
  } catch {
    return false;
  }
  if ((node.type ?? "").startsWith("RELATIONSHIP_")) return true;
  return Boolean(node.charge?.id && safePlanName(node.charge.name));
}

function validIsoDate(value: string | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function stableErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "owner_notification_send_failed";
}
