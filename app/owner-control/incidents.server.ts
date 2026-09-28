import { trialLedgerHash } from "../hash.server";
import { formatDate, notificationBody, storeSection } from "../owner-notifications/presentation";
import { notificationKey } from "../owner-notifications/repository.server";
import {
  PARTNER_STALE_MINUTES,
  WEBHOOK_FAILED_MINUTES,
  WEBHOOK_PROCESSING_MINUTES,
  CHECKOUT_LABEL_OBSERVATIONS,
  CHECKOUT_LABEL_OBSERVATION_MINUTES,
  RESOLVED_INCIDENT_RETENTION_DAYS,
  FINANCIAL_OBSERVATION_DAYS,
  BILLING_READBACK_STALE_HOURS,
} from "./model";
import {
  readIncidentObservations,
  type IncidentRow,
  type LabelErrorRow,
  type BillingIssueRow,
} from "./incident-observations.server";

export async function reconcileOwnerIncidents(db: D1Database, now = new Date()) {
  const { webhookCounts, partner, labels, billing, existing } = await readIncidentObservations(
    db,
    now,
  );
  const nowIso = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  // Mantiene l'ordine degli alert e applica notifiche e stati nello stesso batch.
  await reconcileWebhookIncident(db, statements, existing, now, webhookCounts);
  await reconcilePartnerIncident(db, statements, existing, now, partner);
  const currentLabelKeys = await observeLabelIncidents(db, statements, existing, now, labels);
  await reconcileBillingIncidents(db, statements, existing, now, billing);
  await resolveLabelIncidents(db, statements, existing, now, currentLabelKeys);
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

async function reconcileWebhookIncident(
  db: D1Database,
  statements: D1PreparedStatement[],
  existing: Map<string, IncidentRow>,
  now: Date,
  webhookCounts: Awaited<ReturnType<typeof readIncidentObservations>>["webhookCounts"],
) {
  const nowIso = now.toISOString();
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
}
async function reconcilePartnerIncident(
  db: D1Database,
  statements: D1PreparedStatement[],
  existing: Map<string, IncidentRow>,
  now: Date,
  partnerRow: { synced_at: string } | undefined,
) {
  const nowIso = now.toISOString();
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
}
async function observeLabelIncidents(
  db: D1Database,
  statements: D1PreparedStatement[],
  existing: Map<string, IncidentRow>,
  now: Date,
  labels: LabelErrorRow[],
) {
  const nowIso = now.toISOString();
  const currentLabelKeys = new Set<string>();
  for (const row of labels) {
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

  return currentLabelKeys;
}
async function reconcileBillingIncidents(
  db: D1Database,
  statements: D1PreparedStatement[],
  existing: Map<string, IncidentRow>,
  now: Date,
  billing: BillingIssueRow[],
) {
  const nowIso = now.toISOString();
  const currentBillingKeys = new Set<string>();
  for (const row of billing) {
    currentBillingKeys.add(row.incident_key);
    // L'ordine degli statement definisce l'ordine stabile degli alert per lo stesso ciclo.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const shopHash = await trialLedgerHash(row.shop_domain);
    const copy = billingIssueCopy(row.issue);
    const details =
      row.issue === "entitlement_sync"
        ? [`Ultimo tentativo: ${formatDate(row.reference_at)}`]
        : row.issue === "reconciliation_stale"
          ? [
              `Soglia: ${BILLING_READBACK_STALE_HOURS} ore`,
              `Ultima lettura riuscita: ${formatDate(row.reference_at)}`,
              `Ultimo tentativo: ${row.attempted_at ? formatDate(row.attempted_at) : "non registrato"}`,
              `Ultimo errore: ${row.error_code ?? "nessuno registrato"}`,
            ]
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
        .prepare(
          `SELECT s.shop_domain, s.display_name, s.installation_status,
                  b.last_reconciled_at
             FROM shops s LEFT JOIN billing_accounts b ON b.shop_id = s.id
            WHERE s.id = ?`,
        )
        .bind(incident.shop_id)
        .first<{
          shop_domain: string;
          display_name: string | null;
          installation_status: string;
          last_reconciled_at: string | null;
        }>();
      if (!shop) continue;
      const entitlement = incident.incident_key.startsWith("billing_entitlement:");
      const readback = incident.incident_key.startsWith("billing_reconciliation:");
      if (
        readback &&
        (shop.installation_status !== "active" ||
          !shop.last_reconciled_at ||
          Date.parse(shop.last_reconciled_at) <=
            now.getTime() - BILLING_READBACK_STALE_HOURS * 60 * 60 * 1000)
      ) {
        statements.push(
          db
            .prepare(
              `UPDATE owner_operational_incidents
                  SET status = 'resolved', resolved_at = ?, updated_at = ?
                WHERE incident_key = ? AND status = 'active'`,
            )
            .bind(nowIso, nowIso, incident.incident_key),
        );
        continue;
      }
      await resolveIncident(db, statements, incident, {
        nowIso,
        shopDomain: shop.shop_domain,
        shopHash: await trialLedgerHash(shop.shop_domain),
        subject: entitlement
          ? "🟢 CF Ready · Diritto sincronizzato nel checkout"
          : readback
            ? "🟢 CF Ready · Readback billing Shopify ripristinato"
            : "🟢 CF Ready · Anomalia billing risolta",
        body: storeOperationalBody(
          entitlement
            ? "Il metafield della Validation riporta di nuovo il diritto commerciale corrente."
            : readback
              ? "La lettura del billing dalla Shopify Admin API è tornata aggiornata."
              : "L'osservazione finanziaria non presenta più l'anomalia segnalata.",
          shop,
          nowIso,
          readback
            ? [`Ultima lettura riuscita: ${formatDate(shop.last_reconciled_at!)}`]
            : ["Stato: regolare"],
        ),
      });
    }
  }
}
async function resolveLabelIncidents(
  db: D1Database,
  statements: D1PreparedStatement[],
  existing: Map<string, IncidentRow>,
  now: Date,
  currentLabelKeys: Set<string>,
) {
  const nowIso = now.toISOString();
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
