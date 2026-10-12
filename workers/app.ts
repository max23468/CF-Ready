import type { OwnerControlBindings } from "../app/owner-control/handler.server";
import { handleWebhookRequest, WEBHOOK_PATHS } from "../app/webhook-request.server";
import type { WebhookJob } from "../app/webhooks.server";
import { limitFormBody } from "./form-body";

const OWNER_CONTROL_PATH = "/internal/telegram/webhook";
const WEBHOOK_PATH_PREFIX = "/webhooks/";
let requestHandler: ReturnType<(typeof import("react-router"))["createRequestHandler"]> | undefined;

type NotificationBindings = Omit<Env, "OWNER_NOTIFICATIONS_ENABLED"> & {
  OWNER_NOTIFICATIONS_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SHOPIFY_PARTNER_ORGANIZATION_ID?: string;
  SHOPIFY_PARTNER_APP_ID?: string;
  SHOPIFY_PARTNER_ACCESS_TOKEN?: string;
};

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === OWNER_CONTROL_PATH) {
      const { handleOwnerControlWebhook } = await import("../app/owner-control/handler.server");
      return handleOwnerControlWebhook(request, env as OwnerControlBindings);
    }
    if (pathname.startsWith(WEBHOOK_PATH_PREFIX)) {
      if (WEBHOOK_PATHS.has(pathname)) {
        if (request.method !== "POST") {
          return new Response(null, { status: 405, headers: { Allow: "POST" } });
        }
        try {
          return await handleWebhookRequest(
            pathname,
            request,
            env.DB,
            env.WEBHOOK_QUEUE,
            env.SHOP_UPDATE_ACK_ONLY_SHOP,
          );
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }
      }
      return new Response(null, { status: 404 });
    }
    const limited = await limitFormBody(request);
    if (limited instanceof Response) return limited;
    const [{ createRequestHandler }, { createAppContext }] = await Promise.all([
      import("react-router"),
      import("../app/context.server"),
    ]);
    requestHandler ??= createRequestHandler(
      () => import("virtual:react-router/server-build"),
      import.meta.env.MODE,
    );
    return requestHandler(
      limited,
      createAppContext(env.DB, env.WEBHOOK_QUEUE, (promise) => ctx.waitUntil(promise)),
    );
  },
  async queue(batch, env) {
    const message = batch.messages[0];
    if (!message) return;
    const [{ consumeWebhookMessage }, { processWebhookJob }] = await Promise.all([
      import("../app/webhooks.server"),
      import("../app/webhook-jobs.server"),
    ]);
    await consumeWebhookMessage(
      env.DB,
      message,
      batch.queue.endsWith("-failures"),
      processWebhookJob,
    );
  },
  scheduled(controller, env, ctx) {
    // Il vecchio trigger orario può ancora scattare durante la propagazione: la retention la
    // esegue già il tick delle :00 e due passate parallele duplicherebbero le redazioni.
    if (controller.cron === "0 * * * *") return;
    // Un solo trigger per ambiente: il tick delle :00 resta alla retention, in un'invocazione
    // separata dal ciclo owner come prima, così il budget CPU di ciascuna non si somma.
    if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
      ctx.waitUntil(runRetention(env.DB));
      return;
    }
    // Qualsiasi altro cron avvia il ciclo owner: un cambio di frequenza resta attivo anche mentre
    // Cloudflare propaga ancora il trigger precedente.
    ctx.waitUntil(
      runOwnerNotificationCycle(
        env as NotificationBindings,
        new Date(controller.scheduledTime).getUTCMinutes(),
      ),
    );
  },
} satisfies ExportedHandler<Env, WebhookJob>;

// D-182: le fasi che osservano ore o giorni girano una volta all'ora, ciascuna in un tick
// diverso dalle altre e dalla retention delle :00. Ogni invocazione porta così al più una fase
// pesante, e la CPU per minuto attribuisce il costo di ciascuna senza strumenti aggiuntivi.
const HOURLY_STAGE_MINUTES: Partial<Record<string, number>> = {
  partner_financials: 20,
  bfs_progress: 35,
  bfs_performance: 50,
};

async function runOwnerNotificationCycle(env: NotificationBindings, minute: number) {
  const [{ reconcileNextStaleBilling }, { refreshExpiringOfflineSessions }, { recordEvent }] =
    await Promise.all([
      import("../app/billing/periodic-reconciliation.server"),
      import("../app/offline-token-refresh.server"),
      import("../app/events.server"),
    ]);
  const recordStageFailure = (name: string, error: unknown, fallback: string, reason?: string) =>
    recordEvent(env.DB, {
      name,
      class: "error",
      metadata: { error_code: stageErrorCode(error, fallback), ...(reason ? { reason } : {}) },
    });

  // Token offline validi alla prossima apertura: l'LCP a freddo non paga il token exchange.
  try {
    await refreshExpiringOfflineSessions(env.DB);
  } catch (error) {
    await recordStageFailure("offline_token_refresh_failed", error, "offline_token_refresh_failed");
  }

  // La riconciliazione billing non dipende dalle notifiche owner: un suo errore D1 non deve
  // fermare le fasi successive né restare un rifiuto non gestito in waitUntil.
  try {
    await reconcileNextStaleBilling(env.DB);
  } catch (error) {
    await recordStageFailure(
      "billing_reconciliation_cycle_failed",
      error,
      "billing_reconciliation_failed",
    );
  }
  if (env.OWNER_NOTIFICATIONS_ENABLED !== "true") return;

  const [notifications, { refreshBFSPlans }, { pollBFSProgress, pollBFSPerformance }] =
    await Promise.all([
      import("../app/owner-notifications.server"),
      import("../app/owner-control/bfs.server"),
      import("../app/owner-control/bfs-notifications.server"),
    ]);

  const stages = [
    () =>
      notifications.pollPartnerEvents(env.DB, {
        organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? "",
        appId: env.SHOPIFY_PARTNER_APP_ID ?? "",
        accessToken: env.SHOPIFY_PARTNER_ACCESS_TOKEN ?? "",
      }),
    () =>
      notifications.syncPartnerFinancialObservations(env.DB, {
        organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? "",
        appId: env.SHOPIFY_PARTNER_APP_ID ?? "",
        accessToken: env.SHOPIFY_PARTNER_ACCESS_TOKEN ?? "",
      }),
    () => notifications.pollLocalNotifications(env.DB),
    () => notifications.reconcileOwnerIncidents(env.DB),
    async () => {
      // Il report appena aggiornato basta al controllo progresso: niente seconda lettura store.
      const now = new Date();
      await pollBFSProgress(env.DB, now, await refreshBFSPlans(env.DB, { now }));
    },
    () => pollBFSPerformance(env.DB),
    () => {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
        throw new Error("owner_notification_configuration_incomplete");
      }
      return notifications.deliverOwnerNotifications(env.DB, {
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
      });
    },
  ];

  // Le fasi restano indipendenti: un errore Partner non deve impedire la verifica degli
  // altri incidenti o l'invio delle prove già registrate; un errore Telegram non deve perdere i
  // nuovi eventi acquisiti.
  const stageNames = [
    "partner_events",
    "partner_financials",
    "local_notifications",
    "incidents",
    "bfs_progress",
    "bfs_performance",
    "delivery",
  ];
  for (const [index, stage] of stages.entries()) {
    const hourlyMinute = HOURLY_STAGE_MINUTES[stageNames[index]];
    if (hourlyMinute !== undefined && hourlyMinute !== minute) continue;
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await stage();
    } catch (error) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await recordStageFailure(
        "owner_notification_cycle_failed",
        error,
        "owner_notification_failed",
        stageNames[index],
      );
    }
  }
}

async function runRetention(db: D1Database) {
  const [{ applyRetention }, { recordEvent }] = await Promise.all([
    import("../app/shop.server"),
    import("../app/events.server"),
  ]);
  try {
    await applyRetention(db);
  } catch (error) {
    await recordEvent(db, {
      name: "retention_failed",
      class: "error",
      metadata: { error_code: stageErrorCode(error, "retention_failed") },
    });
  }
}

function stageErrorCode(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : fallback;
}
