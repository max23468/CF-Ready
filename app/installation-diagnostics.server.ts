export type EngagementEvent = "app_opened" | "onboarding_started";

export type InstallationEngagement = {
  first_opened_at: string | null;
  onboarding_started_at: string | null;
  tracking_started_at: string | null;
};

export type UninstallFeedback = {
  occurred_at: string;
  reason: string | null;
  description: string | null;
  fetched_at: string;
};

export type FeedbackEvent = {
  type?: string;
  occurredAt?: string;
  shop?: { myshopifyDomain?: string };
  reason?: unknown;
  description?: unknown;
};

export function parseEngagementHeaders(
  headers: Headers,
): { event: EngagementEvent; installedAt: string } | null {
  const event = headers.get("X-CF-Ready-Event");
  const installedAt = headers.get("X-CF-Ready-Installation");
  if (event !== "app_opened" && event !== "onboarding_started") return null;
  if (!installedAt || installedAt.length > 32 || !Number.isFinite(Date.parse(installedAt))) {
    return null;
  }
  return { event, installedAt };
}

export async function readInstallationStartedAt(db: D1Database, shopDomain: string) {
  const shop = await db
    .prepare(
      `SELECT installed_at FROM shops
       WHERE shop_domain = ? AND installation_status = 'active'`,
    )
    .bind(shopDomain)
    .first<{ installed_at: string }>();
  return shop?.installed_at ?? null;
}

export async function recordInstallationEngagement(
  db: D1Database,
  shopDomain: string,
  installedAt: string,
  event: EngagementEvent,
  now = new Date(),
) {
  const observedAt = now.toISOString();
  const onboarding = event === "onboarding_started";
  const firstEvent = (name: EngagementEvent) =>
    db
      .prepare(
        `INSERT INTO app_events (shop_id, event_name, event_class, occurred_at)
         SELECT s.id, ?, ?, ? FROM shops s
         WHERE s.shop_domain = ? AND s.installed_at = ? AND s.installation_status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM installation_engagement e
             WHERE e.shop_id = s.id AND e.installed_at = s.installed_at
               AND ${name === "app_opened" ? "e.first_opened_at" : "e.onboarding_started_at"} IS NOT NULL
           )`,
      )
      .bind(
        name,
        name === "app_opened" ? "lifecycle" : "onboarding",
        observedAt,
        shopDomain,
        installedAt,
      );

  // Eventi e riepilogo sono atomici: schede concorrenti e retry non duplicano la prima visita.
  const results = await db.batch([
    firstEvent("app_opened"),
    ...(onboarding ? [firstEvent("onboarding_started")] : []),
    db
      .prepare(
        `INSERT INTO installation_engagement (shop_id, installed_at, first_opened_at, onboarding_started_at)
         SELECT id, installed_at, ?, ? FROM shops
         WHERE shop_domain = ? AND installed_at = ? AND installation_status = 'active'
         ON CONFLICT(shop_id) DO UPDATE SET
           onboarding_started_at = COALESCE(installation_engagement.onboarding_started_at, excluded.onboarding_started_at)
         WHERE installation_engagement.installed_at = excluded.installed_at
           AND installation_engagement.onboarding_started_at IS NULL
           AND excluded.onboarding_started_at IS NOT NULL`,
      )
      .bind(observedAt, onboarding ? observedAt : null, shopDomain, installedAt),
  ]);
  return results.some((result) => result.meta.changes > 0);
}

export async function readInstallationEngagement(
  db: D1Database,
  shopId: number,
  installedAt: string,
) {
  const [engagement, tracking] = await Promise.all([
    db
      .prepare(
        `SELECT first_opened_at, onboarding_started_at FROM installation_engagement
         WHERE shop_id = ? AND installed_at = ?`,
      )
      .bind(shopId, installedAt)
      .first<{ first_opened_at: string; onboarding_started_at: string | null }>(),
    db
      .prepare(
        `SELECT state_value FROM owner_notification_state
         WHERE state_key = 'engagement_tracking_started_at'`,
      )
      .first<{ state_value: string }>(),
  ]);
  return {
    first_opened_at: engagement?.first_opened_at ?? null,
    onboarding_started_at: engagement?.onboarding_started_at ?? null,
    tracking_started_at: tracking?.state_value ?? null,
  } satisfies InstallationEngagement;
}

export function normalizeFeedbackText(value: string | null, limit: number) {
  if (value === null) return null;
  // Testo letterale: niente caratteri di controllo o direzioni invisibili nel messaggio owner.
  const text = value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : text || null;
}

export function normalizeUninstallFeedback(event: FeedbackEvent) {
  if (
    event.type !== "RELATIONSHIP_UNINSTALLED" ||
    !event.occurredAt ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    (event.reason !== null && typeof event.reason !== "string") ||
    (event.description !== null && typeof event.description !== "string")
  ) {
    return null;
  }
  return {
    occurred_at: new Date(event.occurredAt).toISOString(),
    reason: normalizeFeedbackText(event.reason, 300),
    description: normalizeFeedbackText(event.description, 1200),
  };
}

export async function saveUninstallFeedback(
  db: D1Database,
  event: FeedbackEvent,
  now = new Date(),
) {
  const feedback = normalizeUninstallFeedback(event);
  if (!feedback || !event.shop?.myshopifyDomain) return false;
  const result = await db
    .prepare(
      `INSERT INTO uninstall_feedback (shop_id, installed_at, occurred_at, reason, description, fetched_at)
       SELECT id, installed_at, ?, ?, ?, ? FROM shops
       WHERE shop_domain = ? AND julianday(installed_at) <= julianday(?)
       ON CONFLICT(shop_id) DO UPDATE SET
         installed_at = excluded.installed_at, occurred_at = excluded.occurred_at,
         reason = excluded.reason, description = excluded.description, fetched_at = excluded.fetched_at
       WHERE julianday(excluded.occurred_at) >= julianday(uninstall_feedback.occurred_at)`,
    )
    .bind(
      feedback.occurred_at,
      feedback.reason,
      feedback.description,
      now.toISOString(),
      event.shop.myshopifyDomain.trim().toLowerCase(),
      feedback.occurred_at,
    )
    .run();
  return result.meta.changes > 0;
}

export function readUninstallFeedback(db: D1Database, shopId: number, installedAt: string) {
  return db
    .prepare(
      `SELECT occurred_at, reason, description, fetched_at FROM uninstall_feedback
       WHERE shop_id = ? AND installed_at = ?`,
    )
    .bind(shopId, installedAt)
    .first<UninstallFeedback>();
}

export function uninstallFeedbackSection(event: FeedbackEvent) {
  const feedback = normalizeUninstallFeedback(event);
  return {
    title: "Motivo della disinstallazione · Shopify Partner",
    lines: feedback
      ? [
          `Motivo: ${feedback.reason ?? "Nessun motivo fornito"}`,
          `Commento: ${feedback.description ?? "Nessun commento fornito"}`,
        ]
      : ["Motivo non ancora disponibile; consulta il dettaglio /shop."],
  };
}
