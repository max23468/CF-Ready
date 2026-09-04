import { trialLedgerHash as notificationShopHash } from "../hash.server";
import {
  localNotificationEvent,
  normalizeShopDomain,
  planLabel,
  validCalendarDate,
  validIsoDate,
  type LocalNotificationEvent,
  type PartnerEventType,
} from "./model";
import {
  formatCalendarDate,
  formatDuration,
  notificationBody,
  operationalPlan,
  operationalSection,
  relationshipCopy,
  relationshipStatus,
  storeSection,
  trialDaysRemaining,
} from "./presentation";
import {
  LOCAL_EVENT_CURSOR_KEY,
  MAX_NOTIFICATION_PAGES,
  NOTIFICATION_PAGE_SIZE,
  hasEquivalentNotification,
  localEventCursor,
  notificationKey,
  notificationStatement,
  relationshipNotificationKey,
  writeNotificationState,
} from "./repository.server";

export async function pollLocalAppEvents(db: D1Database, now: Date) {
  let afterId = await localEventCursor(db);
  let inserted = 0;
  for (let page = 0; page < MAX_NOTIFICATION_PAGES; page += 1) {
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
         WHERE e.id > ? ORDER BY e.id LIMIT ?`,
      )
      .bind(afterId, NOTIFICATION_PAGE_SIZE)
      .all<LocalNotificationEvent>();
    const statements = (
      await Promise.all(
        results.map((event) => {
          if (!localNotificationEvent(event) || !event.shop_domain) return null;
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
      await writeNotificationState(db, LOCAL_EVENT_CURSOR_KEY, String(afterId), now);
    }
    if (results.length < NOTIFICATION_PAGE_SIZE) return { inserted, afterId, pages: page + 1 };
  }
  throw new Error("local_notification_page_limit");
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
    shopHash: await notificationShopHash(shopDomain),
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
    shopHash: await notificationShopHash(shopDomain),
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
    shopHash: await notificationShopHash(shopDomain),
    subject: copy.subject,
    body: notificationBody(copy.description, event.occurred_at, [
      storeSection(event.display_name, shopDomain, event),
      { title: "🧪 Prova", lines: trialDetails },
      operationalSection(event, { plan: null }),
    ]),
    occurredAt: event.occurred_at,
  });
}
