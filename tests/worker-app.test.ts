import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestHandler: vi.fn(),
  consumeWebhookMessage: vi.fn(),
  processWebhookJob: vi.fn(),
  applyRetention: vi.fn(),
  pollPartnerEvents: vi.fn(),
  pollLocalNotifications: vi.fn(),
  deliverOwnerNotifications: vi.fn(),
  recordEvent: vi.fn(),
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
vi.mock("../app/owner-notifications.server", () => ({
  pollPartnerEvents: mocks.pollPartnerEvents,
  pollLocalNotifications: mocks.pollLocalNotifications,
  deliverOwnerNotifications: mocks.deliverOwnerNotifications,
}));
vi.mock("../app/events.server", () => ({ recordEvent: mocks.recordEvent }));

import worker from "../workers/app";
import { waitUntilContext } from "../app/context.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestHandler.mockResolvedValue(new Response("app", { status: 201 }));
  mocks.consumeWebhookMessage.mockResolvedValue(undefined);
  mocks.applyRetention.mockResolvedValue(undefined);
  mocks.pollPartnerEvents.mockResolvedValue(undefined);
  mocks.pollLocalNotifications.mockResolvedValue(undefined);
  mocks.deliverOwnerNotifications.mockResolvedValue(undefined);
  mocks.recordEvent.mockResolvedValue(undefined);
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
    expect(await limited.text()).toBe("intent=enable");
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

  test("pianifica retention e lascia inattivi i cron non applicabili", async () => {
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };

    worker.scheduled({ cron: "0 * * * *" } as never, env, context as never);
    worker.scheduled({ cron: "1 1 * * *" } as never, env, context as never);
    await Promise.all(pending);

    expect(mocks.applyRetention).toHaveBeenCalledOnce();
    expect(pending).toHaveLength(1);
  });

  test("esegue separatamente le tre fasi delle notifiche owner", async () => {
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

    worker.scheduled({ cron: "*/5 * * * *" } as never, notificationEnv as never, context as never);
    await Promise.all(pending);

    expect(mocks.pollPartnerEvents.mock.calls[0][1]).toEqual({
      organizationId: "org",
      appId: "app",
      accessToken: "token",
    });
    expect(mocks.pollLocalNotifications).toHaveBeenCalledOnce();
    expect(mocks.deliverOwnerNotifications.mock.calls[0][1]).toEqual({
      botToken: "bot",
      chatId: "chat",
    });
    expect(mocks.recordEvent).not.toHaveBeenCalled();
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
  });
});
