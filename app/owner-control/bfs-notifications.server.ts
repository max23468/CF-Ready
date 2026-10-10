import { notificationBody } from "../owner-notifications/presentation";
import {
  PERFORMANCE_THRESHOLDS,
  PERFORMANCE_MINIMUM_SAMPLES,
  PERFORMANCE_WINDOW_DAYS,
} from "../reporting/performance";
import { readBFSReport, type BFSHistoryPoint } from "./bfs.server";
import { BFS_TARGET } from "./model";
import { readPerformance } from "./queries.server";

type ProgressState = {
  baseline: number;
  notified: number;
  goalNotified: boolean;
  history: BFSHistoryPoint[];
};
type MetricState = "pass" | "preliminary_fail" | "fail" | "insufficient";
type PerformanceState = Record<string, MetricState>;
type Notification = { subject: string; body: string };

// Il confronto e l'outbox nello stesso batch impediscono doppioni da cron sovrapposti.
async function saveObservation<T>(
  db: D1Database,
  key: string,
  evaluate: (previous: T | null) => { state: T; notification?: Notification },
  now: Date,
) {
  const previous = await db
    .prepare("SELECT state_value FROM owner_control_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string }>();
  const result = evaluate(previous ? (JSON.parse(previous.state_value) as T) : null);
  const expected = previous?.state_value ?? null;
  const timestamp = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  if (result.notification) {
    statements.push(
      db
        .prepare(
          `INSERT INTO owner_notifications (dedupe_key, notification_kind, shop_domain, subject,
         body_text, source_occurred_at, status, available_at, created_at, updated_at)
       SELECT ?, 'operational', NULL, ?, ?, ?, 'pending', ?, ?, ?
       WHERE (SELECT state_value FROM owner_control_state WHERE state_key = ?) IS ?`,
        )
        .bind(
          `${key}:${crypto.randomUUID()}`,
          result.notification.subject,
          result.notification.body,
          timestamp,
          timestamp,
          timestamp,
          timestamp,
          key,
          expected,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO owner_control_state (state_key, state_value, updated_at)
     SELECT ?, ?, ? WHERE (SELECT state_value FROM owner_control_state WHERE state_key = ?) IS ?
     ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(result.state), timestamp, key, expected),
  );
  await db.batch(statements);
}

export async function pollBFSProgress(db: D1Database, now = new Date()) {
  const report = await readBFSReport(db, now);
  if (report.unknown) return;
  await saveObservation<ProgressState>(
    db,
    "bfs_progress_v1",
    (previous) => {
      const state = previous ?? {
        baseline: report.eligible,
        notified: report.eligible,
        goalNotified: false,
        history: [],
      };
      const milestone = state.baseline + Math.floor((report.eligible - state.baseline) / 5) * 5;
      const reached = report.eligible >= BFS_TARGET && !state.goalNotified;
      const advanced = milestone >= state.notified + 5;
      const next = {
        ...state,
        notified: advanced ? milestone : state.notified,
        goalNotified: state.goalNotified || reached,
        history: [
          ...state.history.filter(
            ({ day }) =>
              day !== now.toISOString().slice(0, 10) &&
              day >= new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10),
          ),
          { day: now.toISOString().slice(0, 10), count: report.eligible },
        ],
      };
      return {
        state: next,
        ...(advanced || reached
          ? {
              notification: {
                subject: reached
                  ? "🎯 CF Ready · Soglia di 50 store stimata raggiunta"
                  : "📈 CF Ready · Progresso verso 50 store",
                body: notificationBody(
                  "Stima interna BFS: installazioni attive su piani Shopify a pagamento.",
                  now.toISOString(),
                  [
                    {
                      title: "🎯 Obiettivo BFS",
                      lines: [
                        `Store stimati: ${report.eligible}/${BFS_TARGET}`,
                        `Mancano: ${Math.max(0, BFS_TARGET - report.eligible)}`,
                        `Incremento dalla baseline: +${report.eligible - state.baseline}`,
                        "La conferma del requisito resta nella pagina Distribution di Shopify.",
                      ],
                    },
                  ],
                ),
              },
            }
          : {}),
      };
    },
    now,
  );
}

export async function pollBFSPerformance(db: D1Database, now = new Date()) {
  const report = await readPerformance(db);
  await saveObservation<PerformanceState>(
    db,
    "bfs_performance_v1",
    (previous) => {
      const state = { ...previous };
      const lines: string[] = [];
      for (const [metric, threshold] of Object.entries(PERFORMANCE_THRESHOLDS)) {
        const group = report.groups.find(
          (row) => row.metric === metric && row.app_version === "all" && row.app_route === "all",
        );
        const enough = (group?.sample_count ?? 0) >= PERFORMANCE_MINIMUM_SAMPLES;
        const failed = group && group.p75 > threshold;
        const status: MetricState = failed
          ? enough
            ? "fail"
            : "preliminary_fail"
          : enough
            ? "pass"
            : "insufficient";
        const wasFailed =
          previous?.[metric] === "fail" || previous?.[metric] === "preliminary_fail";
        if (
          failed &&
          (!wasFailed || (status === "fail" && previous?.[metric] === "preliminary_fail"))
        ) {
          lines.push(
            `${metric}: p75 ${group.p75}${metric === "CLS" ? "" : " ms"} > ${threshold}${metric === "CLS" ? "" : " ms"} · ${group.sample_count}/${PERFORMANCE_MINIMUM_SAMPLES} campioni · ${enough ? "Fuori soglia" : "Avviso preliminare"}`,
          );
        } else if (status === "pass" && wasFailed) {
          lines.push(
            `${metric}: rientrato · p75 ${group!.p75} ≤ ${threshold} · ${group!.sample_count} campioni`,
          );
        }
        // La perdita di campioni non prova il rientro e non riapre lo stesso avviso.
        state[metric] =
          (status === "insufficient" && wasFailed) ||
          (status === "preliminary_fail" && previous?.[metric] === "fail")
            ? previous![metric]
            : status;
      }
      return {
        state,
        ...(lines.length
          ? {
              notification: {
                subject: "⚠️ CF Ready · Aggiornamento prestazioni BFS",
                body: notificationBody(
                  `p75 sugli ultimi ${PERFORMANCE_WINDOW_DAYS} giorni, tutte le versioni e le rotte.`,
                  now.toISOString(),
                  [
                    {
                      title: "🎯 Prestazioni",
                      lines: [
                        ...lines,
                        "Stima dai campioni CF Ready; lo stato autorevole resta nel Partner Dashboard.",
                      ],
                    },
                  ],
                ),
              },
            }
          : {}),
      };
    },
    now,
  );
}
