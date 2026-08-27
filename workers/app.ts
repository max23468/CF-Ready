import { createRequestHandler } from "react-router";
import { createAppContext } from "../app/context.server";
import { recordEvent } from "../app/events.server";
import {
  deliverOwnerNotifications,
  pollLocalNotifications,
  pollPartnerEvents,
} from "../app/owner-notifications.server";
import { applyRetention } from "../app/shop.server";
import { processWebhookJob } from "../app/webhook-jobs.server";
import { consumeWebhookMessage, type WebhookJob } from "../app/webhooks.server";
import { limitFormBody } from "./form-body";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

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
    const limited = await limitFormBody(request);
    if (limited instanceof Response) return limited;
    return requestHandler(
      limited,
      createAppContext(env.DB, env.WEBHOOK_QUEUE, (promise) => ctx.waitUntil(promise)),
    );
  },
  async queue(batch, env) {
    const message = batch.messages[0];
    if (!message) return;
    await consumeWebhookMessage(
      env.DB,
      message,
      batch.queue.endsWith("-failures"),
      processWebhookJob,
    );
  },
  scheduled(controller, env, ctx) {
    if (controller.cron === "0 * * * *") ctx.waitUntil(applyRetention(env.DB));
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(runOwnerNotificationCycle(env as NotificationBindings));
    }
  },
} satisfies ExportedHandler<Env, WebhookJob>;

async function runOwnerNotificationCycle(env: NotificationBindings) {
  if (env.OWNER_NOTIFICATIONS_ENABLED !== "true") return;

  const stages = [
    () =>
      pollPartnerEvents(env.DB, {
        organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID ?? "",
        appId: env.SHOPIFY_PARTNER_APP_ID ?? "",
        accessToken: env.SHOPIFY_PARTNER_ACCESS_TOKEN ?? "",
      }),
    () => pollLocalNotifications(env.DB),
    () => {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
        throw new Error("owner_notification_configuration_incomplete");
      }
      return deliverOwnerNotifications(env.DB, {
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
      });
    },
  ];

  // Le tre fasi restano indipendenti: un errore Partner non deve impedire l'invio delle prove
  // già registrate, e un errore Telegram non deve perdere i nuovi eventi acquisiti.
  for (const stage of stages) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await stage();
    } catch (error) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await recordEvent(env.DB, {
        name: "owner_notification_cycle_failed",
        class: "error",
        metadata: { error_code: notificationErrorCode(error) },
      });
    }
  }
}

function notificationErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "owner_notification_failed";
}
