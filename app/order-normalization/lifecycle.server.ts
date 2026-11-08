import type { Admin } from "../admin-graphql";
import type { AppErrorCode } from "../app-error";
import type { Rules } from "../config";
import type { WebhookJob } from "../webhooks/webhook-ingress.server";
import { enqueueOrderBackfill } from "./backfill-queue.server";
import { normalizedOrderFieldNames, normalizesOrderFields } from "./domain";
import { ensureOrderWebhook, removeOrderWebhooks } from "./subscription.server";

export type OrderNormalizationContext = {
  admin: Admin;
  db: D1Database;
  shop: string;
  orderScopesGranted?: boolean;
  queue?: Queue<WebhookJob>;
  appOrigin?: string;
  orderNormalizationAvailable?: boolean;
};

function startsNormalizing(rules: Rules, normalizedBefore: ReadonlySet<string>) {
  return normalizedOrderFieldNames(rules).some((field) => !normalizedBefore.has(field));
}

export async function prepareRulesSave(
  context: OrderNormalizationContext,
  rules: Rules,
  normalizedBefore: ReadonlySet<string>,
): Promise<AppErrorCode | null> {
  if (startsNormalizing(rules, normalizedBefore)) {
    if (!context.orderNormalizationAvailable) return "generic";
    // D-206: l'attivazione richiede gli scope ordini; chi li ha revocati dopo può comunque
    // salvare le altre regole.
    if (!context.orderScopesGranted) return "order_scopes_required";
  }
  // D-211: la sottoscrizione nasce prima del salvataggio; con scope revocati resta da
  // riattivare con un nuovo permesso.
  if (normalizesOrderFields(rules) && context.orderScopesGranted && context.appOrigin) {
    try {
      await ensureOrderWebhook(context.admin, context.appOrigin);
    } catch {
      return "order_webhook_failed";
    }
  }
  return null;
}

// Le regole sono già salvate: un errore di questi passi accessori non cambia l'esito.
export async function finishRulesSave(
  context: OrderNormalizationContext,
  rules: Rules,
  normalizedBefore: ReadonlySet<string>,
) {
  if (
    !normalizesOrderFields(rules) &&
    normalizedBefore.size > 0 &&
    context.orderScopesGranted &&
    context.appOrigin
  ) {
    await removeOrderWebhooks(context.admin, context.appOrigin).catch(() => undefined);
  }
  if (startsNormalizing(rules, normalizedBefore) && context.queue) {
    await enqueueOrderBackfill(context.db, context.queue, context.shop).catch(() => undefined);
  }
}

export async function resumeOrderNormalization(
  context: OrderNormalizationContext,
): Promise<AppErrorCode | null> {
  if (!context.orderNormalizationAvailable) return "generic";
  if (!context.orderScopesGranted) return "order_scopes_required";
  if (!context.queue || !context.appOrigin) return "generic";
  try {
    await ensureOrderWebhook(context.admin, context.appOrigin);
  } catch {
    return "order_webhook_failed";
  }
  await enqueueOrderBackfill(context.db, context.queue, context.shop);
  return null;
}

// D-206: durante la pausa gli ordini non vengono uniformati; alla riattivazione si recuperano
// quelli degli ultimi 60 giorni. La Validation è già attiva: un accodamento fallito non cambia l'esito.
export async function backfillAfterValidationEnabled(
  db: D1Database,
  queue: Queue<WebhookJob> | null,
  shop: string,
  rules: Rules,
) {
  if (queue && normalizesOrderFields(rules)) {
    await enqueueOrderBackfill(db, queue, shop).catch(() => undefined);
  }
}
