import {
  localBillingPlan,
  normalizeShopDomain,
  planLabel,
  validCalendarDate,
  validLocalBillingEvent,
  validMinorMoney,
  type LocalBillingEvent,
} from "./model";
import {
  formatCalendarDate,
  formatMinorMoney,
  localBillingCopy,
  localBillingState,
  notificationBody,
  operationalSection,
  storeSection,
} from "./presentation";
import {
  BILLING_EVENT_CURSOR_KEY,
  MAX_NOTIFICATION_PAGES,
  NOTIFICATION_PAGE_SIZE,
  billingEventCursor,
  billingNotificationKey,
  hasEquivalentNotification,
  notificationShopHash,
  notificationStatement,
  writeNotificationState,
} from "./repository.server";

export async function pollLocalBillingEvents(db: D1Database, now: Date) {
  let afterId = await billingEventCursor(db, now);
  let inserted = 0;
  for (let page = 0; page < MAX_NOTIFICATION_PAGES; page += 1) {
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
         WHERE e.id > ? ORDER BY e.id LIMIT ?`,
      )
      .bind(afterId, NOTIFICATION_PAGE_SIZE)
      .all<LocalBillingEvent>();
    const statements = (
      await Promise.all(
        results.map((event) => {
          if (!event.shop_domain) return null;
          if (!validLocalBillingEvent(event)) throw new Error("billing_event_invalid_payload");
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
      await writeNotificationState(db, BILLING_EVENT_CURSOR_KEY, String(afterId), now);
    }
    if (results.length < NOTIFICATION_PAGE_SIZE) return { inserted, afterId, pages: page + 1 };
  }
  throw new Error("billing_notification_page_limit");
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
    shopHash: await notificationShopHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      { title: "💳 Billing", lines: details },
      operationalSection(event, { plan: null }),
    ]),
    occurredAt: event.occurred_at,
  });
}
