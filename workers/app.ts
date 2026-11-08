import type { RecordedEventName } from "../app/events.server";
import type { OwnerControlBindings } from "../app/owner-control/handler.server";
import { OWNER_CONTROL_PATH } from "../app/telegram/owner-webhook";
import { handleWebhookRequest, WEBHOOK_PATHS } from "../app/webhooks/webhook-request.server";
import type { WebhookJob } from "../app/webhooks/webhook-ingress.server";
import { stableErrorCode } from "../app/primitives";
import { CRON_INTERVAL_MINUTES } from "../app/worker-triggers";
import { limitFormBody } from "./form-body";

const WEBHOOK_PATH_PREFIX = "/webhooks/";
let requestHandler: ReturnType<(typeof import("react-router"))["createRequestHandler"]> | undefined;

type NotificationBindings = Omit<Env, "OWNER_NOTIFICATIONS_ENABLED" | keyof OwnerControlBindings> &
  OwnerControlBindings & { OWNER_NOTIFICATIONS_ENABLED?: string };

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
    const [{ consumeWebhookBatch }, { processWebhookJob }] = await Promise.all([
      import("../app/webhooks/webhooks.server"),
      import("../app/webhooks/webhook-jobs.server"),
    ]);
    await consumeWebhookBatch(env.DB, batch, (db, job) =>
      processWebhookJob(db, job, env.WEBHOOK_QUEUE),
    );
  },
  scheduled(controller, env, ctx) {
    // Un solo trigger per ambiente: il tick delle :00 resta alla retention, in un'invocazione
    // separata dal ciclo owner, così il budget CPU di ciascuna non si somma.
    const minute = new Date(controller.scheduledTime).getUTCMinutes();
    if (minute === 0) {
      ctx.waitUntil(runRetention(env.DB));
      return;
    }
    ctx.waitUntil(runOwnerNotificationCycle(env as NotificationBindings, minute));
  },
} satisfies ExportedHandler<Env, WebhookJob>;

async function runOwnerNotificationCycle(env: NotificationBindings, minute: number) {
  const [{ reconcileNextStaleBilling }, { refreshExpiringOfflineSessions }, { recordEvent }] =
    await Promise.all([
      import("../app/billing/periodic-reconciliation.server"),
      import("../app/offline-token-refresh.server"),
      import("../app/events.server"),
    ]);
  const recordStageFailure = (
    name: RecordedEventName,
    error: unknown,
    fallback: string,
    reason?: string,
  ) =>
    recordEvent(env.DB, {
      name,
      class: "error",
      metadata: { error_code: stableErrorCode(error, fallback), ...(reason ? { reason } : {}) },
    });

  try {
    await refreshExpiringOfflineSessions(env.DB);
  } catch (error) {
    await recordStageFailure("offline_token_refresh_failed", error, "offline_token_refresh_failed");
  }

  // La riconciliazione billing non dipende dalle notifiche owner: un suo errore D1 non deve
  // fermare le fasi successive né restare un rifiuto non gestito in waitUntil.
  try {
    // Shopify e la riconciliazione si caricano solo con un candidato: i cicli senza store da
    // rileggere non pagano in CPU la valutazione di quei moduli.
    await reconcileNextStaleBilling(env.DB, {
      adminForShop: async (shopDomain) =>
        (await (await import("../app/shopify.server")).unauthenticated.admin(shopDomain)).admin,
      reconciler: async (admin, db, shopDomain) =>
        (await import("../app/reconcile-account.server")).reconcileBillingAccount(
          admin,
          db,
          shopDomain,
        ),
    });
  } catch (error) {
    await recordStageFailure(
      "billing_reconciliation_cycle_failed",
      error,
      "billing_reconciliation_failed",
    );
  }
  if (env.OWNER_NOTIFICATIONS_ENABLED !== "true") return;

  const [
    { partnerConfigFromEnv },
    { pollPartnerEvents },
    { syncPartnerFinancialObservations },
    { pollLocalNotifications },
    { reconcileOwnerIncidents },
    { deliverOwnerNotifications },
    { refreshBFSPlans },
    { pollBFSProgress, pollBFSPerformance },
    { syncOwnerControlMenu },
  ] = await Promise.all([
    import("../app/owner-notifications/partner-api.server"),
    import("../app/owner-notifications/partner-source.server"),
    import("../app/owner-notifications/financial-source.server"),
    import("../app/owner-notifications/local-billing-source.server"),
    import("../app/owner-control/incidents.server"),
    import("../app/owner-notifications/delivery.server"),
    import("../app/owner-control/bfs.server"),
    import("../app/owner-control/bfs-notifications.server"),
    import("../app/owner-control/menu.server"),
  ]);
  const partnerConfig = partnerConfigFromEnv(env);

  // D-182: le fasi con `minute` osservano ore o giorni e girano una volta all'ora, ciascuna in un
  // tick diverso dalle altre e dalla retention delle :00, multiplo del cron da cinque minuti.
  // Ogni invocazione porta così al più una fase pesante, e la CPU per minuto attribuisce il
  // costo di ciascuna senza strumenti aggiuntivi.
  const stages: Array<{ name: string; minute?: number; run: () => Promise<unknown> }> = [
    { name: "partner_events", run: () => pollPartnerEvents(env.DB, partnerConfig) },
    {
      name: "partner_financials",
      minute: CRON_INTERVAL_MINUTES * 4,
      run: () => syncPartnerFinancialObservations(env.DB, partnerConfig),
    },
    { name: "local_notifications", run: () => pollLocalNotifications(env.DB) },
    { name: "incidents", run: () => reconcileOwnerIncidents(env.DB) },
    {
      name: "bfs_progress",
      minute: CRON_INTERVAL_MINUTES * 7,
      run: async () => {
        const now = new Date();
        await pollBFSProgress(env.DB, now, await refreshBFSPlans(env.DB, { now }));
      },
    },
    {
      name: "bfs_performance",
      minute: CRON_INTERVAL_MINUTES * 10,
      run: () => pollBFSPerformance(env.DB),
    },
    {
      name: "telegram_menu",
      minute: CRON_INTERVAL_MINUTES,
      // Il menu serve solo dove il Control Center risponde: Development lo tiene spento.
      run: async () => {
        if (env.OWNER_TELEGRAM_CONTROL_ENABLED !== "true") return;
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
          throw new Error("owner_control_configuration_incomplete");
        }
        await syncOwnerControlMenu({
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
        });
      },
    },
    {
      name: "delivery",
      run: async () => {
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
          throw new Error("owner_notification_configuration_incomplete");
        }
        return deliverOwnerNotifications(env.DB, {
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
        });
      },
    },
  ];

  // Le fasi restano indipendenti: un errore Partner non deve impedire la verifica degli
  // altri incidenti o l'invio delle prove già registrate; un errore Telegram non deve perdere i
  // nuovi eventi acquisiti.
  for (const stage of stages) {
    if (stage.minute !== undefined && stage.minute !== minute) continue;
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await stage.run();
    } catch (error) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await recordStageFailure(
        "owner_notification_cycle_failed",
        error,
        "owner_notification_failed",
        stage.name,
      );
    }
  }
}

async function runRetention(db: D1Database) {
  const [{ applyRetention }, { recordEvent }] = await Promise.all([
    import("../app/retention.server"),
    import("../app/events.server"),
  ]);
  try {
    await applyRetention(db);
  } catch (error) {
    await recordEvent(db, {
      name: "retention_failed",
      class: "error",
      metadata: { error_code: stableErrorCode(error, "retention_failed") },
    });
  }
}
