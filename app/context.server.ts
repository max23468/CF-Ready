import { createContext, RouterContextProvider } from "react-router";
import type { WebhookJob } from "./webhooks.server";

export const databaseContext = createContext<D1Database>();
export const webhookQueueContext = createContext<Queue<WebhookJob> | undefined>(undefined);

export function createAppContext(db: D1Database, webhookQueue?: Queue<WebhookJob>) {
  const context = new RouterContextProvider();
  context.set(databaseContext, db);
  if (webhookQueue) context.set(webhookQueueContext, webhookQueue);
  return context;
}
