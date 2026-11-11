import { trialLedgerHash as notificationShopHash } from "../hash.server";
import { recordEvent } from "../events.server";
import {
  normalizeUninstallFeedback,
  saveUninstallFeedback,
  uninstallFeedbackSection,
} from "../installation-diagnostics.server";
import {
  type PartnerEventNode,
  type PartnerEventType,
  normalizeShopDomain,
  partnerEventErrorCode,
  planKindFromCharge,
  planLabel,
  safePlanName,
  validIsoDate,
  validPartnerEvent,
} from "./model";
import {
  forEachPartnerPage,
  partnerEvents,
  requirePartnerConfig,
  type PartnerInstallConfig,
} from "./partner-api.server";
import {
  SECTION_BILLING,
  billingCopy,
  formatCalendarDate,
  formatDuration,
  formatMoney,
  notificationBody,
  notificationBodyField,
  operationalPlan,
  operationalSection,
  equivalentRelationshipSubjects,
  relationshipCopy,
  relationshipStatus,
  storeSection,
} from "./presentation";
import { persistShopDisplayName } from "../shop-profile.server";
import {
  PARTNER_EVENTS_POLLED_KEY,
  billingNotificationKey,
  hasEquivalentNotification,
  notificationKey,
  notificationStatement,
  partnerBillingState,
  partnerPollWindow,
  previousPlanKind,
  readEquivalentNotificationBody,
  readOperationalSnapshot,
  relationshipNotificationKey,
  replacePendingEquivalentBody,
  writeNotificationState,
} from "./repository.server";

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
            ... on RelationshipUninstalled { reason description }
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
  options: { now?: Date } = {},
) {
  requirePartnerConfig(config);
  const now = options.now ?? new Date();
  const cycleStartedAt = now.toISOString();
  const { checkpointAt, occurredAtMin } = await partnerPollWindow(
    db,
    PARTNER_EVENTS_POLLED_KEY,
    now,
  );
  let inserted = 0;
  let skipped = 0;
  const diagnosticErrorCodes = new Set<string>();

  const pages = await forEachPartnerPage<PartnerEventNode>(
    config,
    PARTNER_EVENTS_QUERY,
    { occurredAtMin },
    { connection: partnerEvents },
    async (nodes) => {
      const notifications = (
        await Promise.all(
          nodes.map(async (node) => {
            const event = node ?? undefined;
            if (!validPartnerEvent(event)) {
              skipped += 1;
              if (isNewInvalidEvent(event, checkpointAt)) {
                diagnosticErrorCodes.add(partnerEventErrorCode(event)!);
              }
              return null;
            }
            return partnerEventNotification(db, event, now);
          }),
        )
      ).filter((notification) => notification !== null);
      if (notifications.length) {
        const results = await db.batch(notifications);
        inserted += results.reduce((total, result) => total + result.meta.changes, 0);
      }
    },
  );
  await writeNotificationState(db, PARTNER_EVENTS_POLLED_KEY, cycleStartedAt);
  await Promise.all(
    [...diagnosticErrorCodes].map((errorCode) =>
      recordEvent(db, {
        name: "owner_notification_partner_event_skipped",
        class: "error",
        metadata: { error_code: errorCode },
      }),
    ),
  );
  return {
    inserted,
    skipped,
    diagnosticErrorCodes: [...diagnosticErrorCodes],
    occurredAtMin,
    pages,
  };
}

function isNewInvalidEvent(node: PartnerEventNode | undefined, checkpointAt: string | null) {
  if (checkpointAt === null) return true;
  return validIsoDate(node?.occurredAt) && Date.parse(node.occurredAt) > Date.parse(checkpointAt);
}

async function partnerEventNotification(db: D1Database, event: PartnerEventNode, now: Date) {
  const type = event.type as PartnerEventType;
  const occurredAt = event.occurredAt!;
  const shopDomain = normalizeShopDomain(event.shop!.myshopifyDomain!);
  // Il replay di 24 ore ripresenta a ogni ciclo eventi già notificati: nome, snapshot e corpo
  // servono soltanto a un evento nuovo o al feedback tardivo, non al controllo di deduplica.
  const storeContext = () =>
    Promise.all([
      persistShopDisplayName(db, shopDomain, event.shop!.name),
      readOperationalSnapshot(db, shopDomain),
    ]);
  if (type.startsWith("RELATIONSHIP_")) {
    const relationshipType = type as Extract<PartnerEventType, `RELATIONSHIP_${string}`>;
    const lifecycle = relationshipCopy(relationshipType);
    const uninstalled = type === "RELATIONSHIP_UNINSTALLED";
    // Conservare il feedback prima della deduplica: il webhook locale può avere già notificato.
    if (uninstalled) await saveUninstallFeedback(db, event, now);
    const duplicate = await hasEquivalentNotification(
      db,
      shopDomain,
      // Solo l'installazione ha un doppio locale; una riattivazione Partner resta un fatto a sé.
      type === "RELATIONSHIP_INSTALLED"
        ? equivalentRelationshipSubjects(relationshipType)
        : lifecycle.subject,
      occurredAt,
    );
    if (duplicate && !uninstalled) return null;
    const [displayName, snapshot] = await storeContext();
    const body = notificationBody(lifecycle.description, occurredAt, [
      storeSection(displayName, shopDomain, snapshot),
      operationalSection(snapshot, {
        appStatus: relationshipStatus(relationshipType),
        plan: operationalPlan(snapshot),
        ...(uninstalled
          ? {
              onboardingStatus: null,
              validationStatus: null,
              installationDuration: formatDuration(snapshot?.installed_at, occurredAt),
            }
          : {}),
      }),
      ...(uninstalled ? [uninstallFeedbackSection(event)] : []),
    ]);
    if (duplicate) {
      const enriched = await replacePendingEquivalentBody(db, {
        body,
        shopDomain,
        subject: lifecycle.subject,
        occurredAt,
        now,
      });
      if (enriched) return null;
      const feedback = normalizeUninstallFeedback(event);
      if (!feedback || (!feedback.reason && !feedback.description)) return null;
      const original = await readEquivalentNotificationBody(
        db,
        shopDomain,
        lifecycle.subject,
        occurredAt,
      );
      const sharedReason = original && notificationBodyField(original.body_text, "Motivo");
      const sharedComment = original && notificationBodyField(original.body_text, "Commento");
      // Il corpo in processing è già stato acquisito dal mittente: non modificarlo.
      // Anche i messaggi precedenti alla sezione feedback possono ricevere il seguito.
      if (
        !original ||
        (sharedReason && sharedReason !== "Nessun motivo fornito") ||
        (sharedComment && sharedComment !== "Nessun commento fornito")
      )
        return null;
      return notificationStatement(db, {
        dedupeKey: await notificationKey("uninstall-feedback", `${shopDomain}:${occurredAt}`),
        kind: "lifecycle",
        shopDomain,
        shopHash: await notificationShopHash(shopDomain),
        subject: "💬 CF Ready · Motivo della disinstallazione",
        body: notificationBody(
          "Shopify Partners ha reso disponibile il feedback della disinstallazione.",
          occurredAt,
          [storeSection(displayName, shopDomain, snapshot), uninstallFeedbackSection(event)],
        ),
        occurredAt,
      });
    }
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
      body,
      occurredAt,
    });
  }
  const charge = event.charge!;
  await observeChargeLifecycle(db, shopDomain, type, charge.id!, occurredAt, now.toISOString());
  const currentKind = planKindFromCharge(type, charge.name);
  const previousKind = type.endsWith("_ACTIVATED")
    ? await previousPlanKind(db, shopDomain, charge.id!, currentKind)
    : null;
  const billing = billingCopy(type, previousKind !== null);
  if (await hasEquivalentNotification(db, shopDomain, billing.subject, occurredAt)) return null;
  const [displayName, snapshot] = await storeContext();
  const plan = safePlanName(charge.name) ?? planLabel(currentKind) ?? operationalPlan(snapshot);
  const billingDetails = [
    ...(previousKind ? [`Da: ${planLabel(previousKind)}`] : []),
    `${previousKind ? "A" : "Piano"}: ${plan}`,
    `Importo: ${formatMoney(charge.amount!, currentKind)}`,
    ...(validIsoDate(charge.billingOn ?? undefined)
      ? [`Prossimo addebito: ${formatCalendarDate(charge.billingOn!.slice(0, 10))}`]
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
      { title: SECTION_BILLING, lines: billingDetails },
      operationalSection(snapshot, { plan: null }),
    ]),
    occurredAt,
  });
}

async function observeChargeLifecycle(
  db: D1Database,
  shopDomain: string,
  type: PartnerEventType,
  chargeId: string,
  occurredAt: string,
  updatedAt: string,
) {
  const column = type.endsWith("_ACCEPTED")
    ? "charge_accepted_at"
    : type.endsWith("_ACTIVATED")
      ? "charge_activated_at"
      : null;
  if (!column) return;
  const conversionColumn = type.endsWith("_ACCEPTED")
    ? "subscription_accepted_at"
    : "subscription_activated_at";
  await db.batch([
    db
      .prepare(
        `UPDATE billing_accounts SET ${column} = COALESCE(${column}, ?), updated_at = ?
          WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
            AND shopify_charge_gid = ? AND ${column} IS NULL`,
      )
      .bind(occurredAt, updatedAt, shopDomain, chargeId),
    db
      .prepare(
        `UPDATE billing_conversions
            SET ${conversionColumn} = COALESCE(${conversionColumn}, ?), updated_at = ?
          WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)
            AND subscription_gid = ? AND ${conversionColumn} IS NULL`,
      )
      .bind(occurredAt, updatedAt, shopDomain, chargeId),
  ]);
}
