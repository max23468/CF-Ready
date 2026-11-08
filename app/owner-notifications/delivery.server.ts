import { recordEvent } from "../events.server";
import { stableErrorCode } from "../primitives";
import {
  createTelegramClient,
  telegramTable,
  type TelegramClientConfig,
  type TelegramRichBlock,
} from "../telegram/client.server";
import {
  SECTION_STORE,
  STORE_NAME_LABEL,
  STORE_URL_LABEL,
  parseNotificationBody,
} from "./presentation";
import type { NotificationKind } from "./repository.server";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;

type NotificationRow = {
  id: number;
  notification_kind: NotificationKind;
  subject: string;
  body_text: string;
  claim_token: string;
  attempts: number;
};

export async function deliverOwnerNotifications(db: D1Database, config: TelegramClientConfig) {
  const client = createTelegramClient(config);
  const now = new Date();
  let sent = 0;
  let failed = 0;

  // Claim e invio sono intenzionalmente seriali: impediscono burst e rendono ogni retry
  // indipendente. La chiave univoca D1 evita doppie notifiche da poll e webhook ripetuti.
  for (let index = 0; index < MAX_DELIVERIES_PER_RUN; index += 1) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const notification = await claimNotification(db, now);
    if (!notification) break;

    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await client.sendRichMessage(
        telegramRichMessage(notification.subject, notification.body_text),
      );
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (!(await markSent(db, notification, now)))
        throw new Error("owner_notification_claim_lost");
      sent += 1;
    } catch (error) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await markFailed(db, notification, now);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await recordEvent(db, {
        name: "owner_notification_send_failed",
        class: "error",
        metadata: {
          reason: notification.notification_kind,
          error_code: stableErrorCode(error, "owner_notification_send_failed"),
        },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}

async function claimNotification(db: D1Database, now: Date) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  const token = crypto.randomUUID();
  await db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'failed', claim_token = NULL, claimed_at = NULL,
           last_error_code = 'telegram_send_interrupted', updated_at = ?
       WHERE status = 'processing' AND claimed_at <= ? AND attempts >= ?`,
    )
    .bind(nowIso, staleBefore, MAX_DELIVERY_ATTEMPTS)
    .run();
  return db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'processing', claim_token = ?, claimed_at = ?, attempts = attempts + 1,
           updated_at = ?
       WHERE id = (
         SELECT id FROM owner_notifications
         WHERE available_at <= ?
           AND attempts < ?
           AND (status = 'pending' OR (status = 'processing' AND claimed_at <= ?))
         ORDER BY id
         LIMIT 1
       )
       RETURNING id, notification_kind, subject, body_text, claim_token, attempts`,
    )
    .bind(token, nowIso, nowIso, nowIso, MAX_DELIVERY_ATTEMPTS, staleBefore)
    .first<NotificationRow>();
}

async function markSent(db: D1Database, notification: NotificationRow, now: Date) {
  const nowIso = now.toISOString();
  const result = await db
    .prepare(
      `UPDATE owner_notifications
       SET status = 'sent', sent_at = ?, claim_token = NULL, claimed_at = NULL,
           last_error_code = NULL, updated_at = ?
       WHERE id = ? AND status = 'processing' AND claim_token = ?
       RETURNING id`,
    )
    .bind(nowIso, nowIso, notification.id, notification.claim_token)
    .first<{ id: number }>();
  return result !== null;
}

async function markFailed(db: D1Database, notification: NotificationRow, now: Date) {
  const terminal = notification.attempts >= MAX_DELIVERY_ATTEMPTS;
  const delayMinutes = Math.min(6 * 60, 5 * 2 ** Math.max(0, notification.attempts - 1));
  const availableAt = new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();
  await db
    .prepare(
      `UPDATE owner_notifications
       SET status = ?, available_at = ?, claim_token = NULL, claimed_at = NULL,
           last_error_code = 'telegram_send_failed', updated_at = ?
       WHERE id = ? AND status = 'processing' AND claim_token = ?`,
    )
    .bind(
      terminal ? "failed" : "pending",
      availableAt,
      now.toISOString(),
      notification.id,
      notification.claim_token,
    )
    .run();
}

function telegramRichMessage(subject: string, body: string) {
  const { description, sections, footer } = parseNotificationBody(body);
  const blocks: TelegramRichBlock[] = [
    { type: "heading", text: subject, size: 2 },
    ...(description ? [{ type: "paragraph" as const, text: description }] : []),
    { type: "divider" },
  ];

  let storeUrl: string | null = null;
  for (const section of sections) {
    const store = section.title === SECTION_STORE;
    const named = store && section.lines.some(({ label }) => label === STORE_NAME_LABEL);
    const visible = named
      ? section.lines.filter(({ label }) => label !== STORE_URL_LABEL)
      : section.lines;
    blocks.push(
      telegramTable(
        section.title,
        visible.map(({ label, value }) => (label ? [label, value] : value)),
      ),
    );

    if (store) {
      storeUrl = safeNotificationStoreUrl(
        section.lines.find(({ label }) => label === STORE_URL_LABEL)?.value,
      );
    }
  }

  if (storeUrl) {
    blocks.push({
      type: "buttons",
      buttons: [
        { text: "Apri store", style: "primary", url: storeUrl },
        { text: "Copia URL", copy_text: { text: storeUrl } },
      ],
      align: "center",
    });
  }
  if (footer) blocks.push({ type: "footer", text: footer });

  return {
    blocks,
    // Il dominio resta testo semplice e non genera anteprime; i due pulsanti sono espliciti.
    skip_entity_detection: true,
  };
}

function safeNotificationStoreUrl(value: string | undefined) {
  if (!value || !/^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) return null;
  return value;
}
