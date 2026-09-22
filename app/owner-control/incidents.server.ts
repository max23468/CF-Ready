import { trialLedgerHash } from "../hash.server";
import { formatDate, notificationBody, storeSection } from "../owner-notifications/presentation";
import { notificationKey } from "../owner-notifications/repository.server";
import { UNRESOLVED_WEBHOOK_FILTER } from "./queries.server";

export const PARTNER_STALE_MINUTES = 15;
export const WEBHOOK_FAILED_MINUTES = 15;
export const WEBHOOK_PROCESSING_MINUTES = 5;
export const CHECKOUT_LABEL_OBSERVATIONS = 3;
export const CHECKOUT_LABEL_OBSERVATION_MINUTES = 10;
const RESOLVED_INCIDENT_RETENTION_DAYS = 90;
export const FINANCIAL_OBSERVATION_DAYS = 37;

// Il diritto commerciale non è arrivato nel metafield: la Function può restare fail-open anche
// per un merchant pagante.
const ENTITLEMENT_SYNC_ERRORS = [
  "entitlement_readback_failed",
  "entitlement_write_failed",
] as const;

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
  incident_kind: "webhooks" | "partner" | "checkout_labels" | "billing";
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
  display_name: string | null;
  error_code: string;
};

type BillingIssueRow = {
  incident_key: string;
  shop_id: number;
  shop_domain: string;
  display_name: string | null;
  issue:
    | "sale"
    | "credit"
    | "credit_review"
    | "conversion_sale"
    | "reconciliation_stale"
    | "entitlement_sync";
  reference_at: string;
};

export async function reconcileOwnerIncidents(db: D1Database, now = new Date()) {
  const nowIso = now.toISOString();
  const failedCutoff = new Date(now.getTime() - WEBHOOK_FAILED_MINUTES * 60 * 1000).toISOString();
  const processingCutoff = new Date(
    now.getTime() - WEBHOOK_PROCESSING_MINUTES * 60 * 1000,
  ).toISOString();
  const [webhooks, partner, labels, billingIssues, entitlementIssues, incidents] = await db.batch([
    db
      .prepare(
        `SELECT
         COUNT(*) FILTER (WHERE ${UNRESOLVED_WEBHOOK_FILTER}) AS failed,
         COUNT(*) FILTER (WHERE w.status = 'processing') AS processing
       FROM webhook_events w
       WHERE (w.status = 'failed' AND w.received_at <= ?)
          OR (w.status = 'processing' AND w.received_at <= ?)`,
      )
      .bind(failedCutoff, processingCutoff),
    db.prepare(
      `SELECT state_value AS synced_at
           FROM owner_notification_state
          WHERE state_key = 'partner_events_polled_at'`,
    ),
    db
      .prepare(
        `SELECT s.id AS shop_id, s.shop_domain, s.display_name,
              a.checkout_labels_last_error_code AS error_code
         FROM app_state a
         JOIN shops s ON s.id = a.shop_id
        WHERE s.installation_status = 'active'
          AND a.checkout_labels_mode != 'off'
          AND a.checkout_labels_last_error_code IN (${CHECKOUT_LABEL_SYNC_ERRORS.map(() => "?").join(", ")})`,
      )
      .bind(...CHECKOUT_LABEL_SYNC_ERRORS),
    db
      .prepare(
        `SELECT 'billing_sale:' || s.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'sale' AS issue,
              CASE
                WHEN b.plan_kind = 'one_time'
                  THEN COALESCE(b.charge_accepted_at, b.charge_activated_at,
                                b.one_time_purchased_at, b.created_at)
                WHEN b.current_period_start IS NOT NULL
                 AND date(b.current_period_start) > date(COALESCE(b.charge_accepted_at,
                                                                  b.charge_activated_at,
                                                                  b.current_period_start))
                  THEN b.current_period_start
                ELSE COALESCE(b.charge_accepted_at, b.charge_activated_at,
                              b.current_period_start, b.created_at)
              END AS reference_at
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND b.plan_kind IN ('monthly', 'annual', 'one_time')
          AND b.entitlement_status IN ('active', 'ending')
          AND b.is_test = 0
          AND b.sale_checked_at IS NOT NULL
          AND (b.plan_kind = 'one_time' OR b.current_period_start IS NOT NULL)
          AND (b.plan_kind = 'one_time' OR date(b.current_period_start) <= date(?))
          AND (b.sale_observed_at IS NULL
               OR b.sale_charge_gid IS NOT b.shopify_charge_gid
               OR (b.plan_kind IN ('monthly', 'annual')
                   AND b.sale_cycle_start IS NOT b.current_period_start))
          AND datetime(CASE
                WHEN b.plan_kind = 'one_time'
                  THEN COALESCE(b.charge_accepted_at, b.charge_activated_at,
                                b.one_time_purchased_at, b.created_at)
                WHEN b.current_period_start IS NOT NULL
                 AND date(b.current_period_start) > date(COALESCE(b.charge_accepted_at,
                                                                  b.charge_activated_at,
                                                                  b.current_period_start))
                  THEN b.current_period_start
                ELSE COALESCE(b.charge_accepted_at, b.charge_activated_at,
                              b.current_period_start, b.created_at)
              END) <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_credit:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'credit' AS issue,
              c.cancelled_at AS reference_at
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status = 'pending' AND c.is_test = 0
          AND c.cancelled_at IS NOT NULL
          AND c.last_checked_at IS NOT NULL
          AND datetime(c.cancelled_at) <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_credit_review:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'credit_review' AS issue,
              c.credit_observed_at AS reference_at
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status = 'needs_review' AND c.is_test = 0
          AND c.credit_transaction_gid IS NOT NULL
       UNION ALL
       SELECT 'billing_source_sale:' || c.id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'conversion_sale' AS issue,
              COALESCE(c.subscription_accepted_at, c.subscription_activated_at,
                       c.requested_at) AS reference_at
         FROM billing_conversions c
         JOIN shops s ON s.id = c.shop_id
        WHERE c.credit_status IN ('pending', 'confirmed', 'needs_review')
          AND c.is_test = 0
          AND c.subscription_sale_transaction_gid IS NULL
          AND c.last_checked_at IS NOT NULL
          AND datetime(COALESCE(c.subscription_accepted_at, c.subscription_activated_at,
                                c.requested_at))
              <= datetime(?, '-${FINANCIAL_OBSERVATION_DAYS} days')
       UNION ALL
       SELECT 'billing_reconciliation:' || b.shop_id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'reconciliation_stale' AS issue,
              COALESCE(b.last_reconciled_at, b.created_at) AS reference_at
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND datetime(COALESCE(b.last_reconciled_at, b.created_at)) <= datetime(?, '-1 day')`,
      )
      .bind(nowIso, nowIso, nowIso, nowIso, nowIso),
    // D1 accetta al massimo cinque termini in una SELECT composta.
    db
      .prepare(
        `SELECT 'billing_entitlement:' || b.shop_id AS incident_key, s.id AS shop_id,
              s.shop_domain, s.display_name, 'entitlement_sync' AS issue,
              b.reconciliation_attempted_at AS reference_at
         FROM billing_accounts b
         JOIN shops s ON s.id = b.shop_id
        WHERE s.installation_status = 'active'
          AND b.reconciliation_attempted_at IS NOT NULL
          AND b.reconciliation_error_code IN (${ENTITLEMENT_SYNC_ERRORS.map(() => "?").join(", ")})`,
      )
      .bind(...ENTITLEMENT_SYNC_ERRORS),
    db.prepare(`SELECT incident_key, incident_kind, shop_id, status, fingerprint,
                       consecutive_observations, first_observed_at, opened_at
                  FROM owner_operational_incidents`),
  ]);
  if (
    ![webhooks, partner, labels, billingIssues, entitlementIssues, incidents].every(
      ({ success }) => success,
    )
  ) {
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
        [
          `Ultimo ciclo completo: ${formatDate(partnerRow!.synced_at)}`,
          `Soglia: ${PARTNER_STALE_MINUTES} min`,
        ],
      ),
      resolvedSubject: "🟢 CF Ready · Acquisizione Partner ripristinata",
      resolvedBody: operationalBody(
        "L'acquisizione degli eventi Shopify Partner è tornata regolare.",
        nowIso,
        [`Ultimo ciclo completo: ${formatDate(partnerRow!.synced_at)}`],
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
      previous?.status === "active" || (previous?.status === "observing" && sameFailure)
        ? previous.first_observed_at
        : nowIso;
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
          row,
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

  const currentBillingKeys = new Set<string>();
  for (const row of [...billingIssues.results, ...entitlementIssues.results] as BillingIssueRow[]) {
    currentBillingKeys.add(row.incident_key);
    // L'ordine degli statement definisce l'ordine stabile degli alert per lo stesso ciclo.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const shopHash = await trialLedgerHash(row.shop_domain);
    const copy = billingIssueCopy(row.issue);
    const details =
      row.issue === "entitlement_sync"
        ? [`Ultimo tentativo: ${formatDate(row.reference_at)}`]
        : [
            `Soglia: ${FINANCIAL_OBSERVATION_DAYS} giorni`,
            `Riferimento: ${formatDate(row.reference_at)}`,
          ];
    await openIncident(db, statements, existing.get(row.incident_key) ?? null, {
      key: row.incident_key,
      kind: "billing",
      shopId: row.shop_id,
      shopDomain: row.shop_domain,
      shopHash,
      fingerprint: row.reference_at,
      observations: 1,
      firstObservedAt: row.reference_at,
      nowIso,
      subject: copy.subject,
      body: storeOperationalBody(copy.description, row, nowIso, details),
    });
  }

  for (const incident of existing.values()) {
    if (incident.incident_kind !== "billing" || currentBillingKeys.has(incident.incident_key)) {
      continue;
    }
    if (incident.status === "active" && incident.shop_id !== null) {
      // Le risoluzioni restano nello stesso ordine degli incidenti letti e dei relativi alert.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const shop = await db
        .prepare("SELECT shop_domain, display_name FROM shops WHERE id = ?")
        .bind(incident.shop_id)
        .first<{ shop_domain: string; display_name: string | null }>();
      if (!shop) continue;
      const entitlement = incident.incident_key.startsWith("billing_entitlement:");
      await resolveIncident(db, statements, incident, {
        nowIso,
        shopDomain: shop.shop_domain,
        shopHash: await trialLedgerHash(shop.shop_domain),
        subject: entitlement
          ? "🟢 CF Ready · Diritto sincronizzato nel checkout"
          : "🟢 CF Ready · Anomalia billing risolta",
        body: storeOperationalBody(
          entitlement
            ? "Il metafield della Validation riporta di nuovo il diritto commerciale corrente."
            : "L'osservazione finanziaria non presenta più l'anomalia segnalata.",
          shop,
          nowIso,
          ["Stato: regolare"],
        ),
      });
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
        .prepare("SELECT shop_domain, display_name FROM shops WHERE id = ?")
        .bind(incident.shop_id)
        .first<{ shop_domain: string; display_name: string | null }>();
      if (!shop) continue;
      await resolveIncident(db, statements, incident, {
        nowIso,
        shopDomain: shop.shop_domain,
        shopHash: await trialLedgerHash(shop.shop_domain),
        subject: "🟢 CF Ready · Sincronizzazione etichette ripristinata",
        body: storeOperationalBody(
          "La sincronizzazione delle etichette checkout non presenta più l'errore persistente.",
          shop,
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

function billingIssueCopy(issue: BillingIssueRow["issue"]) {
  if (issue === "sale") {
    return {
      subject: `🔴 CF Ready · Vendita Partner non osservata dopo ${FINANCIAL_OBSERVATION_DAYS} giorni`,
      description:
        "Il contratto Shopify risulta attivo, ma la vendita del ciclo corrente non è ancora osservabile nelle transazioni Partner.",
    };
  }
  if (issue === "conversion_sale") {
    return {
      subject: `🔴 CF Ready · Vendita del piano sostituito non osservata dopo ${FINANCIAL_OBSERVATION_DAYS} giorni`,
      description:
        "La conversione è stata completata, ma non è osservabile alcuna vendita Partner per l'abbonamento sostituito.",
    };
  }
  if (issue === "reconciliation_stale") {
    return {
      subject: "🔴 CF Ready · Billing Shopify da riconciliare",
      description:
        "Il readback Admin API del billing è obsoleto. Verificare la sessione offline e rieseguire la riconciliazione senza dedurre lo stato dalle transazioni Partner.",
    };
  }
  if (issue === "entitlement_sync") {
    return {
      subject: "🔴 CF Ready · Diritto non sincronizzato nel checkout",
      description:
        "La riconciliazione periodica non è riuscita a scrivere il diritto commerciale nel metafield della Validation: il checkout può restare senza controlli. Il ciclo riprova ogni ora.",
    };
  }
  if (issue === "credit_review") {
    return {
      subject: "🔴 CF Ready · Credito pro-rata da verificare",
      description:
        "È stata osservata una rettifica finanziaria, ma tipo, importo o valuta non coincidono con il credito pro-rata atteso.",
    };
  }
  return {
    subject: `🔴 CF Ready · Credito pro-rata non osservato dopo ${FINANCIAL_OBSERVATION_DAYS} giorni`,
    description:
      "La conversione è stata completata, ma il credito pro-rata non è ancora osservabile nei dati finanziari Partner.",
  };
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
  return notificationBody(description, occurredAt, [{ title: "⚙️ Stato operativo", lines }]);
}

function storeOperationalBody(
  description: string,
  shop: { shop_domain: string; display_name: string | null },
  occurredAt: string,
  lines: string[],
) {
  return notificationBody(description, occurredAt, [
    storeSection(shop.display_name, shop.shop_domain),
    { title: "⚙️ Stato operativo", lines },
  ]);
}
