import { createRequestHandler } from "react-router";
import { createAppContext } from "../app/context.server";
import { applyRetention } from "../app/shop.server";
import { processWebhookJob } from "../app/webhook-jobs.server";
import { failClaimedWebhook, type WebhookJob } from "../app/webhooks.server";
import { limitFormBody } from "./form-body";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    const limited = await limitFormBody(request);
    if (limited instanceof Response) return limited;
    return requestHandler(limited, createAppContext(env.DB, env.WEBHOOK_QUEUE));
  },
  async queue(batch, env) {
    const message = batch.messages[0];
    if (!message) return;

    try {
      await processWebhookJob(env.DB, message.body);
      message.ack();
    } catch (error) {
      if (message.attempts < 6) {
        message.retry({ delaySeconds: 10 });
      } else {
        await failClaimedWebhook(env.DB, message.body, error);
        message.ack();
      }
    }
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(applyRetention(env.DB));
  },
} satisfies ExportedHandler<Env, WebhookJob>;
