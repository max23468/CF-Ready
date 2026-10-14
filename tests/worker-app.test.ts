import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestHandler: vi.fn(),
  consumeWebhookMessage: vi.fn(),
  processWebhookJob: vi.fn(),
  applyRetention: vi.fn(),
  reconcileNextStaleBilling: vi.fn(),
  refreshExpiringOfflineSessions: vi.fn(),
  pollPartnerEvents: vi.fn(),
  syncPartnerFinancialObservations: vi.fn(),
  pollLocalNotifications: vi.fn(),
  reconcileOwnerIncidents: vi.fn(),
  refreshBFSPlans: vi.fn(),
  pollBFSProgress: vi.fn(),
  pollBFSPerformance: vi.fn(),
  deliverOwnerNotifications: vi.fn(),
  syncOwnerControlMenu: vi.fn(),
  recordEvent: vi.fn(),
  handleOwnerControlWebhook: vi.fn(),
  handleWebhookRequest: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  createRequestHandler: vi.fn(() => mocks.requestHandler),
}));
vi.mock("../app/webhooks.server", () => ({
  consumeWebhookMessage: mocks.consumeWebhookMessage,
}));
vi.mock("../app/webhook-jobs.server", () => ({
  processWebhookJob: mocks.processWebhookJob,
}));
vi.mock("../app/shop.server", () => ({ applyRetention: mocks.applyRetention }));
vi.mock("../app/billing/periodic-reconciliation.server", () => ({
  reconcileNextStaleBilling: mocks.reconcileNextStaleBilling,
}));
vi.mock("../app/offline-token-refresh.server", () => ({
  refreshExpiringOfflineSessions: mocks.refreshExpiringOfflineSessions,
}));
vi.mock("../app/owner-notifications.server", () => ({
  pollPartnerEvents: mocks.pollPartnerEvents,
  syncPartnerFinancialObservations: mocks.syncPartnerFinancialObservations,
  pollLocalNotifications: mocks.pollLocalNotifications,
  reconcileOwnerIncidents: mocks.reconcileOwnerIncidents,
  deliverOwnerNotifications: mocks.deliverOwnerNotifications,
}));
vi.mock("../app/events.server", () => ({ recordEvent: mocks.recordEvent }));
vi.mock("../app/owner-control/bfs.server", () => ({ refreshBFSPlans: mocks.refreshBFSPlans }));
vi.mock("../app/owner-control/bfs-notifications.server", () => ({
  pollBFSProgress: mocks.pollBFSProgress,
  pollBFSPerformance: mocks.pollBFSPerformance,
}));
vi.mock("../app/owner-control/menu.server", () => ({
  syncOwnerControlMenu: mocks.syncOwnerControlMenu,
}));
vi.mock("../app/owner-control/handler.server", () => ({
  handleOwnerControlWebhook: mocks.handleOwnerControlWebhook,
}));
vi.mock("../app/webhook-request.server", () => ({
  WEBHOOK_PATHS: new Set(["/webhooks/shop/update"]),
  handleWebhookRequest: mocks.handleWebhookRequest,
}));

import worker from "../workers/app";
import { waitUntilContext } from "../app/context.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestHandler.mockResolvedValue(new Response("app", { status: 201 }));
  mocks.consumeWebhookMessage.mockResolvedValue(undefined);
  mocks.applyRetention.mockResolvedValue(undefined);
  mocks.reconcileNextStaleBilling.mockResolvedValue(undefined);
  mocks.refreshExpiringOfflineSessions.mockResolvedValue({ refreshed: 0 });
  mocks.pollPartnerEvents.mockResolvedValue(undefined);
  mocks.syncPartnerFinancialObservations.mockResolvedValue(undefined);
  mocks.pollLocalNotifications.mockResolvedValue(undefined);
  mocks.reconcileOwnerIncidents.mockResolvedValue(undefined);
  mocks.refreshBFSPlans.mockResolvedValue(undefined);
  mocks.pollBFSProgress.mockResolvedValue(undefined);
  mocks.pollBFSPerformance.mockResolvedValue(undefined);
  mocks.deliverOwnerNotifications.mockResolvedValue(undefined);
  mocks.syncOwnerControlMenu.mockResolvedValue("aligned");
  mocks.recordEvent.mockResolvedValue(undefined);
  mocks.handleOwnerControlWebhook.mockResolvedValue(new Response("control", { status: 202 }));
  mocks.handleWebhookRequest.mockResolvedValue(new Response(null, { status: 200 }));
});

describe("entrypoint Worker", () => {
  test("inoltra una richiesta locale e registra i task del contesto", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    const request = new Request("https://cf-ready.test/app", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "intent=enable",
    });

    const response = await worker.fetch(request as never, env, context as never);

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("app");
    expect(mocks.requestHandler).toHaveBeenCalledOnce();
    const [limited, appContext] = mocks.requestHandler.mock.calls[0];
    expect(Object.fromEntries(await limited.formData())).toEqual({ intent: "enable" });
    expect(appContext).toBeDefined();
    const background = Promise.resolve();
    appContext.get(waitUntilContext)?.(background);
    expect(pending).toEqual([background]);
  });

  test("ferma un form sovradimensionato prima del router", async () => {
    const response = await worker.fetch(
      new Request("https://cf-ready.test/app", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "20000",
        },
        body: "intent=enable",
      }) as never,
      env,
      { waitUntil() {} } as never,
    );

    expect(response.status).toBe(413);
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("intercetta il webhook Telegram prima del router merchant", async () => {
    const request = new Request("https://cf-ready.test/internal/telegram/webhook", {
      method: "POST",
    });
    const response = await worker.fetch(request as never, env, { waitUntil() {} } as never);

    expect(response.status).toBe(202);
    expect(mocks.handleOwnerControlWebhook).toHaveBeenCalledWith(request, env);
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("intercetta i webhook Shopify dichiarati prima del router merchant", async () => {
    const request = new Request("https://cf-ready.test/webhooks/shop/update", {
      method: "POST",
    });
    const response = await worker.fetch(request as never, env, { waitUntil() {} } as never);

    expect(response.status).toBe(200);
    expect(mocks.handleWebhookRequest).toHaveBeenCalledWith(
      "/webhooks/shop/update",
      request,
      env.DB,
      env.WEBHOOK_QUEUE,
      env.SHOP_UPDATE_ACK_ONLY_SHOP,
    );
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("rifiuta metodi diversi da POST senza caricare il router merchant", async () => {
    const response = await worker.fetch(
      new Request("https://cf-ready.test/webhooks/shop/update") as never,
      env,
      { waitUntil() {} } as never,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mocks.handleWebhookRequest).not.toHaveBeenCalled();
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("risponde 404 ai percorsi webhook sconosciuti senza caricare il router merchant", async () => {
    const response = await worker.fetch(
      new Request("https://cf-ready.test/webhooks/sconosciuto", { method: "POST" }) as never,
      env,
      { waitUntil() {} } as never,
    );

    expect(response.status).toBe(404);
    expect(mocks.handleWebhookRequest).not.toHaveBeenCalled();
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("consuma il primo messaggio distinguendo la coda fallimenti", async () => {
    const message = { body: { webhookId: "webhook-1" } };
    await worker.queue({ queue: "webhooks", messages: [message] } as never, env);
    await worker.queue({ queue: "webhooks-failures", messages: [message] } as never, env);
    await worker.queue({ queue: "webhooks", messages: [] } as never, env);

    expect(mocks.consumeWebhookMessage).toHaveBeenCalledTimes(2);
    expect(mocks.consumeWebhookMessage.mock.calls[0].slice(1)).toEqual([
      message,
      false,
      mocks.processWebhookJob,
    ]);
    expect(mocks.consumeWebhookMessage.mock.calls[1].slice(1)).toEqual([
      message,
      true,
      mocks.processWebhookJob,
    ]);
  });

  test("il tick delle :00 esegue soltanto la retention", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };

    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 0) } as never,
      env,
      context as never,
    );
    await Promise.all(pending);

    expect(mocks.applyRetention).toHaveBeenCalledOnce();
    expect(mocks.refreshExpiringOfflineSessions).not.toHaveBeenCalled();
    expect(mocks.reconcileNextStaleBilling).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
  });

  test("il vecchio trigger orario in propagazione non duplica la retention", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };

    worker.scheduled(
      { cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 0) } as never,
      env,
      context as never,
    );

    expect(pending).toHaveLength(0);
    expect(mocks.applyRetention).not.toHaveBeenCalled();
  });

  test("registra l'errore della retention senza rifiuti non gestiti", async () => {
    mocks.applyRetention.mockRejectedValueOnce(
      new AggregateError([], "Retention store incompleta"),
    );
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };

    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 0) } as never,
      env,
      context as never,
    );
    await Promise.all(pending);

    expect(mocks.recordEvent).toHaveBeenCalledWith(env.DB, {
      name: "retention_failed",
      class: "error",
      metadata: { error_code: "retention_failed" },
    });
  });

  test("un cron notifiche ancora in propagazione avvia comunque il ciclo owner", async () => {
    const pending: Promise<unknown>[] = [];
    const notificationEnv = { DB: env.DB, OWNER_NOTIFICATIONS_ENABLED: "true" };

    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 55) } as never,
      notificationEnv as never,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as never,
    );
    await Promise.all(pending);

    expect(mocks.applyRetention).not.toHaveBeenCalled();
    expect(mocks.pollPartnerEvents).toHaveBeenCalledOnce();
  });

  test("esegue separatamente acquisizione, incidenti e consegna owner", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    const notificationEnv = {
      DB: env.DB,
      OWNER_NOTIFICATIONS_ENABLED: "true",
      SHOPIFY_PARTNER_ORGANIZATION_ID: "org",
      SHOPIFY_PARTNER_APP_ID: "app",
      SHOPIFY_PARTNER_ACCESS_TOKEN: "token",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat",
    };

    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 20) } as never,
      notificationEnv as never,
      context as never,
    );
    await Promise.all(pending);

    expect(mocks.pollPartnerEvents.mock.calls[0][1]).toEqual({
      organizationId: "org",
      appId: "app",
      accessToken: "token",
    });
    expect(mocks.syncPartnerFinancialObservations.mock.calls[0][1]).toEqual({
      organizationId: "org",
      appId: "app",
      accessToken: "token",
    });
    expect(mocks.pollLocalNotifications).toHaveBeenCalledOnce();
    expect(mocks.reconcileOwnerIncidents).toHaveBeenCalledOnce();
    expect(mocks.deliverOwnerNotifications.mock.calls[0][1]).toEqual({
      botToken: "bot",
      chatId: "chat",
    });
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  test.each([
    [5, ["menu"]],
    [10, []],
    [20, ["financials"]],
    [35, ["plans", "progress"]],
    [50, ["performance"]],
  ])("al minuto %i esegue soltanto le fasi orarie di quel tick", async (minute, expected) => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, minute) } as never,
      {
        DB: env.DB,
        OWNER_NOTIFICATIONS_ENABLED: "true",
        OWNER_TELEGRAM_CONTROL_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "bot",
        TELEGRAM_CHAT_ID: "chat",
      } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never,
    );
    await Promise.all(pending);

    const ran = Object.entries({
      financials: mocks.syncPartnerFinancialObservations,
      plans: mocks.refreshBFSPlans,
      progress: mocks.pollBFSProgress,
      performance: mocks.pollBFSPerformance,
      menu: mocks.syncOwnerControlMenu,
    })
      .filter(([, mock]) => mock.mock.calls.length > 0)
      .map(([name]) => name);
    expect(ran).toEqual(expected);
    expect(mocks.pollPartnerEvents).toHaveBeenCalledOnce();
    expect(mocks.reconcileOwnerIncidents).toHaveBeenCalledOnce();
  });

  test("il menu Telegram resta spento senza Control Center e fail-open senza configurazione", async () => {
    const run = async (extra: Record<string, string>) => {
      const pending: Promise<unknown>[] = [];
      worker.scheduled(
        { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 5) } as never,
        { DB: env.DB, OWNER_NOTIFICATIONS_ENABLED: "true", ...extra } as never,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never,
      );
      await Promise.all(pending);
    };
    await run({ TELEGRAM_BOT_TOKEN: "bot", TELEGRAM_CHAT_ID: "chat" });
    expect(mocks.syncOwnerControlMenu).not.toHaveBeenCalled();

    await run({ OWNER_TELEGRAM_CONTROL_ENABLED: "true" });
    expect(mocks.syncOwnerControlMenu).not.toHaveBeenCalled();
    expect(mocks.recordEvent.mock.calls[0][1].metadata).toEqual({
      error_code: "owner_control_configuration_incomplete",
      reason: "telegram_menu",
    });

    mocks.recordEvent.mockClear();
    mocks.syncOwnerControlMenu.mockRejectedValueOnce(new Error("telegram_api_failed"));
    await run({
      OWNER_TELEGRAM_CONTROL_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat",
    });
    expect(mocks.syncOwnerControlMenu.mock.calls.at(-1)?.[0]).toEqual({
      botToken: "bot",
      chatId: "chat",
    });
    expect(mocks.recordEvent.mock.calls[0][1].metadata).toEqual({
      error_code: "telegram_api_failed",
      reason: "telegram_menu",
    });
    expect(mocks.deliverOwnerNotifications).toHaveBeenCalled();
  });

  test("il controllo progresso BFS riusa il report appena aggiornato", async () => {
    const report = { eligible: 3 };
    mocks.refreshBFSPlans.mockResolvedValueOnce(report);
    const pending: Promise<unknown>[] = [];
    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 35) } as never,
      { DB: env.DB, OWNER_NOTIFICATIONS_ENABLED: "true" } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never,
    );
    await Promise.all(pending);

    const [, { now }] = mocks.refreshBFSPlans.mock.calls[0];
    expect(mocks.pollBFSProgress.mock.calls[0]).toEqual([env.DB, now, report]);
  });

  test("resta fail-open e registra codici minimizzati per ogni errore di fase", async () => {
    mocks.pollPartnerEvents.mockRejectedValueOnce(new Error("partner_failed"));
    mocks.pollLocalNotifications.mockRejectedValueOnce(new Error("dettaglio riservato"));
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    const notificationEnv = { DB: env.DB, OWNER_NOTIFICATIONS_ENABLED: "true" };

    worker.scheduled({ cron: "*/5 * * * *" } as never, notificationEnv as never, context as never);
    await Promise.all(pending);

    expect(mocks.deliverOwnerNotifications).not.toHaveBeenCalled();
    expect(mocks.recordEvent).toHaveBeenCalledTimes(3);
    expect(mocks.recordEvent.mock.calls.map(([, event]) => event.metadata.error_code)).toEqual([
      "partner_failed",
      "owner_notification_failed",
      "owner_notification_configuration_incomplete",
    ]);
    expect(mocks.recordEvent.mock.calls.map(([, event]) => event.metadata.reason)).toEqual([
      "partner_events",
      "local_notifications",
      "delivery",
    ]);
  });

  test("un errore della riconciliazione billing non ferma le fasi owner", async () => {
    mocks.reconcileNextStaleBilling.mockRejectedValueOnce(new Error("D1_ERROR: dettaglio"));
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    const notificationEnv = {
      DB: env.DB,
      OWNER_NOTIFICATIONS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat",
    };

    worker.scheduled({ cron: "*/5 * * * *" } as never, notificationEnv as never, context as never);
    await Promise.all(pending);

    expect(mocks.pollPartnerEvents).toHaveBeenCalledOnce();
    expect(mocks.deliverOwnerNotifications).toHaveBeenCalledOnce();
    expect(mocks.recordEvent.mock.calls.map(([, event]) => [event.name, event.metadata])).toEqual([
      ["billing_reconciliation_cycle_failed", { error_code: "billing_reconciliation_failed" }],
    ]);
  });

  test("un rinnovo dei token fallito non ferma la riconciliazione billing", async () => {
    mocks.refreshExpiringOfflineSessions.mockRejectedValueOnce(
      new Error("offline_token_refresh_failed"),
    );
    const pending: Promise<unknown>[] = [];
    worker.scheduled({ cron: "*/5 * * * *" } as never, env, {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as never);
    await Promise.all(pending);

    expect(mocks.refreshExpiringOfflineSessions.mock.calls[0]?.[0]).toBe(env.DB);
    expect(mocks.reconcileNextStaleBilling).toHaveBeenCalledOnce();
    expect(mocks.recordEvent.mock.calls.map(([, event]) => [event.name, event.metadata])).toEqual([
      ["offline_token_refresh_failed", { error_code: "offline_token_refresh_failed" }],
    ]);
  });

  test("minimizza anche errori non Error e una chat Telegram mancante", async () => {
    mocks.pollPartnerEvents.mockRejectedValueOnce("errore esterno");
    const pending: Promise<unknown>[] = [];
    const notificationEnv = {
      DB: env.DB,
      OWNER_NOTIFICATIONS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "bot",
    };

    worker.scheduled(
      { cron: "*/5 * * * *" } as never,
      notificationEnv as never,
      {
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      } as never,
    );
    await Promise.all(pending);

    expect(mocks.recordEvent.mock.calls.map(([, event]) => event.metadata.error_code)).toEqual([
      "owner_notification_failed",
      "owner_notification_configuration_incomplete",
    ]);
  });

  test("non avvia il ciclo notifiche quando è disabilitato", async () => {
    const pending: Promise<unknown>[] = [];
    worker.scheduled({ cron: "*/5 * * * *" } as never, env, {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as never);
    await Promise.all(pending);

    expect(mocks.pollPartnerEvents).not.toHaveBeenCalled();
    expect(mocks.refreshBFSPlans).not.toHaveBeenCalled();
    expect(mocks.pollBFSPerformance).not.toHaveBeenCalled();
    expect(mocks.reconcileNextStaleBilling).toHaveBeenCalledOnce();
  });

  test("una lettura BFS fallita non impedisce la consegna", async () => {
    mocks.refreshBFSPlans.mockRejectedValueOnce(new Error("bfs_read_failed"));
    const pending: Promise<unknown>[] = [];
    worker.scheduled(
      { cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 11, 10, 35) } as never,
      {
        DB: env.DB,
        OWNER_NOTIFICATIONS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "bot",
        TELEGRAM_CHAT_ID: "chat",
      } as never,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never,
    );
    await Promise.all(pending);
    expect(mocks.pollBFSProgress).not.toHaveBeenCalled();
    expect(mocks.deliverOwnerNotifications).toHaveBeenCalledOnce();
    expect(mocks.recordEvent.mock.calls.map(([, event]) => event.metadata.error_code)).toContain(
      "bfs_read_failed",
    );
    expect(mocks.recordEvent.mock.calls.map(([, event]) => event.metadata.reason)).toContain(
      "bfs_progress",
    );
  });
});
