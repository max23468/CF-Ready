import { trialLedgerHash } from "../hash.server";
import { notificationKey } from "../owner-notifications/repository.server";
import { UNRESOLVED_WEBHOOK_FILTER } from "./queries.server";

export const PARTNER_STALE_MINUTES = 15;
export const WEBHOOK_FAILED_MINUTES = 15;
export const WEBHOOK_PROCESSING_MINUTES = 5;
export const CHECKOUT_LABEL_OBSERVATIONS = 3;
export const CHECKOUT_LABEL_OBSERVATION_MINUTES = 10;
const RESOLVED_INCIDENT_RETENTION_DAYS = 90;

const CHECKOUT_LABEL_SYNC_ERRORS = [
  "checkout_labels_locale_missing",
  "checkout_labels_partial_sync",
  "checkout_labels_readback_failed",
  "checkout_labels_resource_ambiguous",
  "checkout_labels_resource_missing",
  "checkout_labels_stale_digest",
] as const;

type IncidentRow = {
  incident_key: string;
  incident_kind: "webhooks" | "partner" | "checkout_labels";
  shop_id: number | null;
  status: "observing" | "active" | "resolved";
  fingerprint: string | null;
  consecutive_observations: number;
  first_observed_at: string;
  opened_at: string | null;
};

type LabelErrorRow = {
  shop_id: number;
  shop_domain: string;
  error_code: string;
};

export async function reconcileOwnerIncidents(db: D1Database, now = new Date()) {
  const nowIso = now.toISOString();
  const [webhooks, partner, labels, incidents] = await db.batch([
    db
      .prepare(
        `SELECT
         COUNT(*) FILTER (
           WHERE ${UNRESOLVED_WEBHOOK_FILTER}
             AND datetime(w.received_at) <= datetime(?, '-${WEBHOOK_FAILED_MINUTES} minutes')
         ) AS failed,
         COUNT(*) FILTER (
           WHERE w.status = 'processing'
             AND datetime(w.received_at) <= datetime(?, '-${WEBHOOK_PROCESSING_MINUTES} minutes')
         ) AS processing
       FROM webhook_events w`,
      )
      .bind(nowIso, nowIso),
    db.prepare(
      `SELECT state_value AS synced_at
           FROM owner_notification_state
          WHERE state_key = 'partner_events_polled_at'`,
    ),
    db
      .prepare(
        `SELECT s.id AS shop_id, s.shop_domain,
              a.checkout_labels_last_error_code AS error_code
         FROM app_state a
         JOIN shops s ON s.id = a.shop_id
        WHERE s.installation_status = 'active'
          AND a.checkout_labels_mode != 'off'
          AND a.checkout_labels_last_error_code IN (${CHECKOUT_LABEL_SYNC_ERRORS.map(() => "?").join(", ")})`,
      )
      .bind(...CHECKOUT_LABEL_SYNC_ERRORS),
    db.prepare(`SELECT incident_key, incident_kind, shop_id, status, fingerprint,
                       consecutive_observations, first_observed_at, opened_at
                  FROM owner_operational_incidents`),
  ]);
  if (![webhooks, partner, labels, incidents].every(({ success }) => success)) {
    throw new Error("owner_incident_read_failed");
  }

  const existing = new Map(
    (incidents.results as IncidentRow[]).map((incident) => [incident.incident_key, incident]),
  );
  const statements: D1PreparedStatement[] = [];
  const webhookCounts = webhooks.results[0] as
    | { failed: number | null; processing: number | null }
    | undefined;
  if (!webhookCounts) throw new Error("owner_incident_read_failed");
  await reconcileBinaryIncident(db, statements, existing.get("webhooks") ?? null, {
    key: "webhooks",
    kind: "webhooks",
    active: Number(webhookCounts.failed) + Number(webhookCounts.processing) > 0,
    fingerprint: `${Number(webhookCounts.failed)}:${Number(webhookCounts.processing)}`,
    nowIso,
    openedSubject: "🔴 CF Ready · Webhook bloccati",
    openedBody: operationalBody(
      "Il flusso webhook presenta eventi bloccati oltre la soglia operativa.",
      nowIso,
      [
        `Falliti aperti oltre ${WEBHOOK_FAILED_MINUTES} min: ${Number(webhookCounts.failed)}`,
        `In elaborazione oltre ${WEBHOOK_PROCESSING_MINUTES} min: ${Number(webhookCounts.processing)}`,
      ],
    ),
    resolvedSubject: "🟢 CF Ready · Webhook ripristinati",
    resolvedBody: operationalBody("Il flusso webhook non presenta più eventi bloccati.", nowIso, [
      "Stato: regolare",
    ]),
  });

  const partnerRow = partner.results[0] as { synced_at: string } | undefined;
  const partnerSyncedAt = partnerRow ? Date.parse(partnerRow.synced_at) : Number.NaN;
  if (Number.isFinite(partnerSyncedAt)) {
    const partnerStale = partnerSyncedAt <= now.getTime() - PARTNER_STALE_MINUTES * 60 * 1000;
    await reconcileBinaryIncident(db, statements, existing.get("partner") ?? null, {
      key: "partner",
      kind: "partner",
      active: partnerStale,
      fingerprint: partnerRow!.synced_at,
      nowIso,
      openedSubject: "🔴 CF Ready · Acquisizione Partner ferma",
      openedBody: operationalBody(
        "L'acquisizione degli eventi Shopify Partner non avanza entro la soglia prevista.",
        nowIso,
        [`Ultimo ciclo completo: ${partnerRow!.synced_at}`, `Soglia: ${PARTNER_STALE_MINUTES} min`],
      ),
      resolvedSubject: "🟢 CF Ready · Acquisizione Partner ripristinata",
      resolvedBody: operationalBody(
        "L'acquisizione degli eventi Shopify Partner è tornata regolare.",
        nowIso,
        [`Ultimo ciclo completo: ${partnerRow!.synced_at}`],
      ),
    });
  }

  const currentLabelKeys = new Set<string>();
  for (const row of labels.results as LabelErrorRow[]) {
    const key = `checkout_labels:${row.shop_id}`;
    currentLabelKeys.add(key);
    const previous = existing.get(key) ?? null;
    const sameFailure = previous?.fingerprint === row.error_code;
    const firstObservedAt =
      previous?.status === "observing" && sameFailure ? previous.first_observed_at : nowIso;
    const observations =
      previous?.status === "observing" && sameFailure
        ? previous.consecutive_observations + 1
        : previous?.status === "active"
          ? previous.consecutive_observations
          : 1;
    const persistent =
      previous?.status === "active" ||
      (observations >= CHECKOUT_LABEL_OBSERVATIONS &&
        Date.parse(firstObservedAt) <=
          now.getTime() - CHECKOUT_LABEL_OBSERVATION_MINUTES * 60 * 1000);

    if (persistent) {
      const shopHash = await trialLedgerHash(row.shop_domain);
      await openIncident(db, statements, previous, {
        key,
        kind: "checkout_labels",
        shopId: row.shop_id,
        shopDomain: row.shop_domain,
        shopHash,
        fingerprint: row.error_code,
        observations,
        firstObservedAt,
        nowIso,
        subject: "🔴 CF Ready · Sincronizzazione etichette in errore",
        body: storeOperationalBody(
          "La sincronizzazione delle etichette checkout è ancora in errore dopo controlli consecutivi.",
          row.shop_domain,
          nowIso,
          [`Errore: ${row.error_code}`, `Controlli consecutivi: ${observations}`],
        ),
      });
    } else {
      statements.push(
        upsertIncident(db, {
          key,
          kind: "checkout_labels",
          shopId: row.shop_id,
          status: "observing",
          fingerprint: row.error_code,
          observations,
          firstObservedAt,
          openedAt: null,
          resolvedAt: null,
          nowIso,
        }),
      );
    }
  }

  for (const incident of existing.values()) {
    if (
      incident.incident_kind !== "checkout_labels" ||
      currentLabelKeys.has(incident.incident_key)
    ) {
      continue;
    }
    if (incident.status === "active" && incident.shop_id !== null) {
      const shop = await db
        .prepare("SELECT shop_domain FROM shops WHERE id = ?")
        .bind(incident.shop_id)
        .first<{ shop_domain: string }>();
      if (!shop) continue;
      await resolveIncident(db, statements, incident, {
        nowIso,
        shopDomain: shop.shop_domain,
        shopHash: await trialLedgerHash(shop.shop_domain),
        subject: "🟢 CF Ready · Sincronizzazione etichette ripristinata",
        body: storeOperationalBody(
          "La sincronizzazione delle etichette checkout non presenta più l'errore persistente.",
          shop.shop_domain,
          nowIso,
          ["Stato: regolare"],
        ),
      });
    } else if (incident.status === "observing") {
      statements.push(
        db
          .prepare("DELETE FROM owner_operational_incidents WHERE incident_key = ?")
          .bind(incident.incident_key),
      );
    }
  }

  statements.push(
    db
      .prepare(
        `DELETE FROM owner_operational_incidents
          WHERE status = 'resolved'
            AND datetime(resolved_at) < datetime(?, '-${RESOLVED_INCIDENT_RETENTION_DAYS} days')`,
      )
      .bind(nowIso),
  );
  if (statements.length) await db.batch(statements);
}

async function reconcileBinaryIncident(
  db: D1Database,
  statements: D1PreparedStatement[],
  previous: IncidentRow | null,
  input: {
    key: "webhooks" | "partner";
    kind: "webhooks" | "partner";
    active: boolean;
    fingerprint: string;
    nowIso: string;
    openedSubject: string;
    openedBody: string;
    resolvedSubject: string;
    resolvedBody: string;
  },
) {
  if (input.active) {
    await openIncident(db, statements, previous, {
      key: input.key,
      kind: input.kind,
      shopId: null,
      shopDomain: null,
      shopHash: null,
      fingerprint: input.fingerprint,
      observations: 1,
      firstObservedAt: previous?.first_observed_at ?? input.nowIso,
      nowIso: input.nowIso,
      subject: input.openedSubject,
      body: input.openedBody,
    });
  } else if (previous?.status === "active") {
    await resolveIncident(db, statements, previous, {
      nowIso: input.nowIso,
      shopDomain: null,
      shopHash: null,
      subject: input.resolvedSubject,
      body: input.resolvedBody,
    });
  }
}

async function openIncident(
  db: D1Database,
  statements: D1PreparedStatement[],
  previous: IncidentRow | null,
  input: {
    key: string;
    kind: IncidentRow["incident_kind"];
    shopId: number | null;
    shopDomain: string | null;
    shopHash: string | null;
    fingerprint: string;
    observations: number;
    firstObservedAt: string;
    nowIso: string;
    subject: string;
    body: string;
  },
) {
  const openedAt = previous?.status === "active" ? previous.opened_at! : input.nowIso;
  if (previous?.status !== "active") {
    statements.push(
      await operationalNotification(db, {
        incidentKey: input.key,
        phase: "opened",
        shopDomain: input.shopDomain,
        shopHash: input.shopHash,
        subject: input.subject,
        body: input.body,
        occurredAt: input.nowIso,
      }),
    );
  }
  statements.push(
    upsertIncident(db, {
      key: input.key,
      kind: input.kind,
      shopId: input.shopId,
      status: "active",
      fingerprint: input.fingerprint,
      observations: input.observations,
      firstObservedAt: input.firstObservedAt,
      openedAt,
      resolvedAt: null,
      nowIso: input.nowIso,
    }),
  );
}

async function resolveIncident(
  db: D1Database,
  statements: D1PreparedStatement[],
  incident: IncidentRow,
  input: {
    nowIso: string;
    shopDomain: string | null;
    shopHash: string | null;
    subject: string;
    body: string;
  },
) {
  statements.push(
    await operationalNotification(db, {
      incidentKey: incident.incident_key,
      phase: "resolved",
      shopDomain: input.shopDomain,
      shopHash: input.shopHash,
      subject: input.subject,
      body: input.body,
      occurredAt: input.nowIso,
    }),
    db
      .prepare(
        `UPDATE owner_operational_incidents
            SET status = 'resolved', resolved_at = ?, updated_at = ?
          WHERE incident_key = ? AND status = 'active'`,
      )
      .bind(input.nowIso, input.nowIso, incident.incident_key),
  );
}

function upsertIncident(
  db: D1Database,
  input: {
    key: string;
    kind: IncidentRow["incident_kind"];
    shopId: number | null;
    status: IncidentRow["status"];
    fingerprint: string;
    observations: number;
    firstObservedAt: string;
    openedAt: string | null;
    resolvedAt: string | null;
    nowIso: string;
  },
) {
  return db
    .prepare(
      `INSERT INTO owner_operational_incidents
         (incident_key, incident_kind, shop_id, status, fingerprint,
          consecutive_observations, first_observed_at, opened_at, resolved_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(incident_key) DO UPDATE SET
         shop_id = excluded.shop_id,
         status = excluded.status,
         fingerprint = excluded.fingerprint,
         consecutive_observations = excluded.consecutive_observations,
         first_observed_at = excluded.first_observed_at,
         opened_at = excluded.opened_at,
         resolved_at = excluded.resolved_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.key,
      input.kind,
      input.shopId,
      input.status,
      input.fingerprint,
      input.observations,
      input.firstObservedAt,
      input.openedAt,
      input.resolvedAt,
      input.nowIso,
    );
}

async function operationalNotification(
  db: D1Database,
  input: {
    incidentKey: string;
    phase: "opened" | "resolved";
    shopDomain: string | null;
    shopHash: string | null;
    subject: string;
    body: string;
    occurredAt: string;
  },
) {
  const statement = db.prepare(
    `INSERT INTO owner_notifications
       (dedupe_key, notification_kind, shop_domain, subject, body_text,
        source_occurred_at, status, available_at, created_at, updated_at)
     SELECT ?, 'operational', ?, ?, ?, ?, 'pending', ?, ?, ?
      WHERE (
        (? = 'opened' AND NOT EXISTS (
          SELECT 1 FROM owner_operational_incidents
           WHERE incident_key = ? AND status = 'active'
        )) OR
        (? = 'resolved' AND EXISTS (
          SELECT 1 FROM owner_operational_incidents
           WHERE incident_key = ? AND status = 'active'
        ))
      ) AND (
        ? IS NULL OR NOT EXISTS (
          SELECT 1 FROM owner_notification_redactions
           WHERE shop_hash = ? AND redacted_at >= ?
        )
      )
     ON CONFLICT(dedupe_key) DO NOTHING`,
  );
  const dedupeKey = await notificationKey(
    "operational_incident",
    `${input.incidentKey}:${input.phase}:${input.occurredAt}`,
  );
  return statement.bind(
    dedupeKey,
    input.shopDomain,
    input.subject,
    input.body,
    input.occurredAt,
    input.occurredAt,
    input.occurredAt,
    input.occurredAt,
    input.phase,
    input.incidentKey,
    input.phase,
    input.incidentKey,
    input.shopHash,
    input.shopHash,
    input.occurredAt,
  );
}

function operationalBody(description: string, occurredAt: string, lines: string[]) {
  return [description, "", "⚙️ Stato operativo", ...lines, "", `🕒 Evento: ${occurredAt}`].join(
    "\n",
  );
}

function storeOperationalBody(
  description: string,
  shopDomain: string,
  occurredAt: string,
  lines: string[],
) {
  return [
    description,
    "",
    "🏪 Store",
    `URL: https://${shopDomain}`,
    "",
    "⚙️ Stato operativo",
    ...lines,
    "",
    `🕒 Evento: ${occurredAt}`,
  ].join("\n");
}
