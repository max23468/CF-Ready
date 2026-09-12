import { recordEvent } from "../events.server";
import { createTelegramClient, type TelegramClientConfig } from "../telegram/client.server";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;

type NotificationRow = {
  id: number;
  notification_kind: "lifecycle" | "billing" | "trial" | "operational";
  subject: string;
  body_text: string;
  claim_token: string;
  attempts: number;
};

type TelegramRichText = string | { type: "bold"; text: string };

type TelegramRichTableCell = {
  text: TelegramRichText;
  is_header?: true;
  colspan?: number;
};

type TelegramRichBlock =
  | { type: "heading"; text: string; size: number }
  | { type: "paragraph"; text: string }
  | { type: "divider" }
  | {
      type: "table";
      cells: TelegramRichTableCell[][];
      is_bordered: true;
      is_striped: true;
      is_compact: true;
      caption: string;
    }
  | {
      type: "buttons";
      buttons: Array<
        | { text: string; style: "primary"; url: string }
        | { text: string; copy_text: { text: string } }
      >;
      align: "center";
    }
  | { type: "footer"; text: string };

export async function deliverOwnerNotifications(
  db: D1Database,
  config: TelegramClientConfig,
  options: { now?: Date; max?: number; fetcher?: typeof fetch } = {},
) {
  const client = createTelegramClient(config, options.fetcher);
  const now = options.now ?? new Date();
  const max = options.max ?? MAX_DELIVERIES_PER_RUN;
  let sent = 0;
  let failed = 0;

  // Claim e invio sono intenzionalmente seriali: impediscono burst e rendono ogni retry
  // indipendente. La chiave univoca D1 evita doppie notifiche da poll e webhook ripetuti.
  for (let index = 0; index < max; index += 1) {
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
          error_code: stableErrorCode(error),
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
    const cells = section.lines.map(({ label, value }) =>
      label
        ? [
            { text: { type: "bold" as const, text: label }, is_header: true as const },
            { text: value },
          ]
        : [{ text: value, colspan: 2 }],
    );
    blocks.push({
      type: "table",
      cells,
      is_bordered: true,
      is_striped: true,
      is_compact: true,
      caption: section.title,
    });

    if (section.title === "🏪 Store") {
      storeUrl = safeNotificationStoreUrl(
        section.lines.find(({ label }) => label === "URL")?.value,
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

function parseNotificationBody(body: string) {
  const description: string[] = [];
  const sections: Array<{
    title: string;
    lines: Array<{ label: string; value: string }>;
  }> = [];
  let footer = "";

  // Stryker disable next-line StringLiteral: split("") fa cadere il pool Worker prima delle asserzioni che verificano il protocollo a righe.
  for (const line of body.split("\n")) {
    if (!line) continue;
    if (line.startsWith("🕒 ")) {
      footer = line;
      continue;
    }
    if (/^(🏪|⚙️|💳|🧪) /.test(line)) {
      sections.push({ title: line, lines: [] });
      continue;
    }

    const section = sections.at(-1);
    if (!section) {
      description.push(line);
      continue;
    }
    const separator = line.indexOf(":");
    section.lines.push(
      separator > 0
        ? { label: line.slice(0, separator), value: line.slice(separator + 1).trimStart() }
        : { label: "", value: line },
    );
  }

  return { description: description.join("\n"), sections, footer };
}

function safeNotificationStoreUrl(value: string | undefined) {
  if (!value || !/^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) return null;
  return value;
}

function stableErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "owner_notification_send_failed";
}
