import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestHandler: vi.fn(),
  authenticateWebhook: vi.fn(),
  findOfflineSession: vi.fn(),
  applyRetention: vi.fn(),
  reconcileStaleBilling: vi.fn(),
  refreshExpiringOfflineSessions: vi.fn(),
  pollPartnerEvents: vi.fn(),
  syncPartnerFinancialObservations: vi.fn(),
  pollLocalNotifications: vi.fn(),
  reconcileOwnerIncidents: vi.fn(),
  refreshBFSPlans: vi.fn(),
  pollBFSPerformance: vi.fn(),
  deliverOwnerNotifications: vi.fn(),
  syncOwnerControlMenu: vi.fn(),
  handleOwnerControlWebhook: vi.fn(),
}));

// Il router merchant richiede la build virtuale; ogni fase del ciclo owner ha i propri test sul
// comportamento. Qui i moduli caricati dinamicamente restano simulati per osservare il dispatch.
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  createRequestHandler: vi.fn(() => mocks.requestHandler),
}));
vi.mock("../app/shopify.server", () => ({
  findOfflineSession: mocks.findOfflineSession,
  unauthenticated: { admin: vi.fn() },
}));
vi.mock("../app/webhooks/shopify-webhook.server", () => ({
  authenticateWebhook: mocks.authenticateWebhook,
}));
vi.mock("../app/retention.server", () => ({ applyRetention: mocks.applyRetention }));
vi.mock("../app/billing/periodic-reconciliation.server", () => ({
  reconcileStaleBilling: mocks.reconcileStaleBilling,
}));
vi.mock("../app/offline-token-refresh.server", () => ({
  refreshExpiringOfflineSessions: mocks.refreshExpiringOfflineSessions,
}));
vi.mock("../app/owner-notifications/partner-source.server", () => ({
  pollPartnerEvents: mocks.pollPartnerEvents,
}));
vi.mock("../app/owner-notifications/financial-source.server", () => ({
  syncPartnerFinancialObservations: mocks.syncPartnerFinancialObservations,
}));
vi.mock("../app/owner-notifications/local-billing-source.server", () => ({
  pollLocalNotifications: mocks.pollLocalNotifications,
}));
vi.mock("../app/owner-control/incidents.server", () => ({
  reconcileOwnerIncidents: mocks.reconcileOwnerIncidents,
}));
vi.mock("../app/owner-notifications/delivery.server", () => ({
  deliverOwnerNotifications: mocks.deliverOwnerNotifications,
}));
vi.mock("../app/owner-control/bfs.server", () => ({ refreshBFSPlans: mocks.refreshBFSPlans }));
vi.mock("../app/owner-control/bfs-notifications.server", () => ({
  pollBFSPerformance: mocks.pollBFSPerformance,
}));
vi.mock("../app/owner-control/menu.server", () => ({
  syncOwnerControlMenu: mocks.syncOwnerControlMenu,
}));
vi.mock("../app/owner-control/handler.server", () => ({
  handleOwnerControlWebhook: mocks.handleOwnerControlWebhook,
}));

import worker from "../workers/app";
import { waitUntilContext } from "../app/context.server";
import { ORDER_BACKFILL_TOPIC } from "../app/order-normalization/backfill-queue.server";
import { claimWebhook, type WebhookJob } from "../app/webhooks/webhook-ingress.server";
import { insertShop, webhookQueue } from "./support/lifecycle";
import { eventsOfWebhook } from "./support/merchant";

let lastEventBeforeTest = 0;

// Gli eventi senza store scritti dal test corrente: il ciclo owner non è legato a uno shop.
async function recordedEvents() {
  const { results } = await env.DB.prepare(
    "SELECT event_name, metadata_json FROM app_events WHERE id > ? ORDER BY id",
  )
    .bind(lastEventBeforeTest)
    .all<{ event_name: string; metadata_json: string }>();
  return results.map(({ event_name, metadata_json }) => ({
    name: event_name,
    ...(JSON.parse(metadata_json) as { error_code: string; reason?: string }),
  }));
}

const errorCodes = async () => (await recordedEvents()).map(({ error_code }) => error_code).sort();

beforeEach(async () => {
  vi.clearAllMocks();
  const latest = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM app_events").first<{
    id: number;
  }>();
  lastEventBeforeTest = latest!.id;
  mocks.requestHandler.mockResolvedValue(new Response("app", { status: 201 }));
  mocks.findOfflineSession.mockResolvedValue(undefined);
  mocks.applyRetention.mockResolvedValue(undefined);
  mocks.reconcileStaleBilling.mockResolvedValue(undefined);
  mocks.refreshExpiringOfflineSessions.mockResolvedValue({ refreshed: 0 });
  mocks.pollPartnerEvents.mockResolvedValue(undefined);
  mocks.syncPartnerFinancialObservations.mockResolvedValue(undefined);
  mocks.pollLocalNotifications.mockResolvedValue(undefined);
  mocks.reconcileOwnerIncidents.mockResolvedValue(undefined);
  mocks.refreshBFSPlans.mockResolvedValue(undefined);
  mocks.pollBFSPerformance.mockResolvedValue(undefined);
  mocks.deliverOwnerNotifications.mockResolvedValue(undefined);
  mocks.syncOwnerControlMenu.mockResolvedValue("aligned");
  mocks.handleOwnerControlWebhook.mockResolvedValue(new Response("control", { status: 202 }));
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

  function deliverShopUpdate({ ackOnly = false } = {}) {
    const webhookId = `wh-${crypto.randomUUID()}`;
    const shop = `worker-${crypto.randomUUID()}.myshopify.com`;
    mocks.authenticateWebhook.mockResolvedValue({
      webhookId,
      topic: "SHOP_UPDATE",
      shop,
      payload: {},
    });
    const jobs: WebhookJob[] = [];
    return {
      shop,
      jobs,
      webhookId,
      response: worker.fetch(
        new Request("https://cf-ready.test/webhooks/shop/update", { method: "POST" }) as never,
        {
          DB: env.DB,
          WEBHOOK_QUEUE: webhookQueue((job) => jobs.push(job)),
          SHOP_UPDATE_ACK_ONLY_SHOP: ackOnly ? shop : "",
        } as never,
        { waitUntil() {} } as never,
      ),
    };
  }

  test("intercetta i webhook Shopify dichiarati prima del router merchant", async () => {
    const delivery = deliverShopUpdate();

    expect((await delivery.response).status).toBe(200);

    expect(delivery.jobs).toEqual([
      expect.objectContaining({ webhookId: delivery.webhookId, shop: delivery.shop }),
    ]);
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("conferma senza accodare il solo store escluso dall'ambiente", async () => {
    const delivery = deliverShopUpdate({ ackOnly: true });

    expect((await delivery.response).status).toBe(200);

    expect(delivery.jobs).toEqual([]);
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("restituisce il rifiuto dell'autenticazione webhook", async () => {
    mocks.authenticateWebhook.mockRejectedValueOnce(new Response(null, { status: 401 }));

    const response = await worker.fetch(
      new Request("https://cf-ready.test/webhooks/shop/update", { method: "POST" }) as never,
      env,
      { waitUntil() {} } as never,
    );

    expect(response.status).toBe(401);
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
    expect(mocks.authenticateWebhook).not.toHaveBeenCalled();
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("risponde 404 ai percorsi webhook sconosciuti senza caricare il router merchant", async () => {
    const response = await worker.fetch(
      new Request("https://cf-ready.test/webhooks/sconosciuto", { method: "POST" }) as never,
      env,
      { waitUntil() {} } as never,
    );

    expect(response.status).toBe(404);
    expect(mocks.authenticateWebhook).not.toHaveBeenCalled();
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  test("consuma il lotto e dà ai job la coda dell'ambiente", async () => {
    const shop = await insertShop(`coda-${crypto.randomUUID()}.myshopify.com`);
    const webhookId = `order-fields-backfill:${crypto.randomUUID()}`;
    const claim = await claimWebhook(env.DB, webhookId, ORDER_BACKFILL_TOPIC, shop);
    if (!claim.acquired) throw new Error("claim non acquisito");
    const message = {
      attempts: 1,
      body: { webhookId, claimToken: claim.token, shop, backfill: { since: "s", cursor: null } },
      ack: vi.fn(),
      retry: vi.fn(),
    };

    // Senza coda la correzione ordini fallirebbe con un retry: l'ack prova che è arrivata al job.
    await worker.queue(
      { queue: "webhooks", messages: [message] } as never,
      { DB: env.DB, WEBHOOK_QUEUE: webhookQueue() } as never,
    );

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(await eventsOfWebhook(webhookId)).toEqual([
      {
        name: "order_fields_skipped",
        class: "lifecycle",
        metadata: { error_code: "missing_admin_context" },
      },
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
    expect(mocks.reconcileStaleBilling).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
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

    expect(await recordedEvents()).toEqual([
      { name: "retention_failed", error_code: "retention_failed" },
    ]);
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
    expect(await recordedEvents()).toEqual([]);
  });

  test.each([
    [5, ["menu"]],
    [10, []],
    [20, ["financials"]],
    [35, ["plans"]],
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
    // `telegram_menu` è il nome che il runbook operativo indica per ritrovare l'errore.
    expect(await recordedEvents()).toContainEqual({
      name: "owner_notification_cycle_failed",
      error_code: "owner_control_configuration_incomplete",
      reason: "telegram_menu",
    });

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
    expect(await recordedEvents()).toContainEqual({
      name: "owner_notification_cycle_failed",
      error_code: "telegram_api_failed",
      reason: "telegram_menu",
    });
    expect(mocks.deliverOwnerNotifications).toHaveBeenCalled();
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
    expect(await errorCodes()).toEqual([
      "owner_notification_configuration_incomplete",
      "owner_notification_failed",
      "partner_failed",
    ]);
    // Ogni errore indica la propria fase; i nomi esatti appartengono al ciclo.
    const reasons = (await recordedEvents()).map(({ reason }) => reason);
    expect(reasons.every(Boolean)).toBe(true);
    expect(new Set(reasons).size).toBe(3);
  });

  test("un errore della riconciliazione billing non ferma le fasi owner", async () => {
    mocks.reconcileStaleBilling.mockRejectedValueOnce(new Error("D1_ERROR: dettaglio"));
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
    expect(await recordedEvents()).toEqual([
      {
        name: "billing_reconciliation_cycle_failed",
        error_code: "billing_reconciliation_failed",
      },
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
    expect(mocks.reconcileStaleBilling).toHaveBeenCalledOnce();
    expect(await recordedEvents()).toEqual([
      { name: "offline_token_refresh_failed", error_code: "offline_token_refresh_failed" },
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

    expect(await errorCodes()).toEqual([
      "owner_notification_configuration_incomplete",
      "owner_notification_failed",
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
    expect(mocks.reconcileStaleBilling).toHaveBeenCalledOnce();
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
    expect(mocks.refreshBFSPlans.mock.calls[0]).toEqual([env.DB, { now: expect.any(Date) }]);
    expect(mocks.deliverOwnerNotifications).toHaveBeenCalledOnce();
    expect(await errorCodes()).toContain("bfs_read_failed");
  });
});
