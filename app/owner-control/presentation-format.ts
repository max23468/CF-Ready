import type {
  TelegramInlineKeyboard,
  TelegramRichMessage,
  TelegramRichText,
} from "../telegram/client.server";
import { callbackData, copyTarget, SHOPS_PAGE_SIZE, type OwnerControlAction } from "./model";
export type Row = [string, string];
type Section = { title: string; rows: Row[] };
export type OwnerControlMessage = {
  richMessage: TelegramRichMessage;
  replyMarkup?: TelegramInlineKeyboard;
  // Vista da rigenerare per "Copia" quando l'azione ricevuta non è ripetibile da un pulsante.
  copyAction?: OwnerControlAction;
};

const DATE = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});
const TELEGRAM_TEXT_LIMIT = 4096;
const TRUNCATED_SUFFIX = "\n… testo troncato";

// Ricava dal pannello lo stesso contenuto in testo semplice: le tabelle Rich Message non
// entrano nella copia del client Telegram, un blocco di testo sì.
export function ownerControlPlainText(message: OwnerControlMessage) {
  const lines: string[] = [];
  for (const block of message.richMessage.blocks) {
    if (block.type === "heading" || block.type === "footer") {
      if (block.type === "footer" || lines.length) lines.push("");
      lines.push(String(block.text));
    } else if (block.type === "table") {
      lines.push("", String(block.caption));
      for (const row of block.cells as Array<Array<{ text: TelegramRichText }>>) {
        lines.push(row.map((cell) => plainText(cell.text)).join(": "));
      }
    }
  }
  const text = lines.join("\n");
  if (text.length <= TELEGRAM_TEXT_LIMIT) return text;
  // Il limite Telegram è in unità UTF-16: il taglio non deve dividere un emoji.
  let end = TELEGRAM_TEXT_LIMIT - TRUNCATED_SUFFIX.length;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return `${text.slice(0, end)}${TRUNCATED_SUFFIX}`;
}

function plainText(text: TelegramRichText) {
  return typeof text === "string" ? text : text.text;
}

// Ogni vista riceve per ultimo il pulsante di copia, se l'azione è ripetibile.
export function withCopyButton(
  message: OwnerControlMessage,
  action: OwnerControlAction,
): OwnerControlMessage {
  const source = message.copyAction ?? action;
  // Un argomento libero non entra in un pulsante.
  if (source.argument !== undefined) return message;
  const target = copyTarget(source);
  return {
    ...message,
    replyMarkup: keyboard([
      ...(message.replyMarkup?.inline_keyboard ?? []),
      [button("📋 Copia", { ...target, copy: true })],
    ]),
  };
}

export function noticeMessage(title: string, text: string): OwnerControlMessage {
  return panel(title, [section("Informazione", [["Stato", text]])], back());
}

export function panel(
  title: string,
  sections: Section[],
  replyMarkup?: TelegramInlineKeyboard,
  footer?: string,
): OwnerControlMessage {
  return {
    richMessage: {
      blocks: [
        { type: "heading", text: title, size: 2 },
        { type: "divider" },
        ...sections.map((item) => ({
          type: "table",
          caption: item.title,
          is_bordered: true,
          is_striped: true,
          is_compact: true,
          cells: item.rows.map(([name, current]) => [
            { text: { type: "bold", text: name }, is_header: true },
            { text: current },
          ]),
        })),
        ...(footer ? [{ type: "footer", text: footer }] : []),
        { type: "footer", text: `Aggiornato: ${formatDate(new Date().toISOString())}` },
      ],
      skip_entity_detection: true,
    },
    replyMarkup,
  };
}

export function section(title: string, rows: Row[]): Section {
  return { title, rows };
}
export function button(text: string, action: OwnerControlAction) {
  return { text, callback_data: callbackData(action) };
}
export function keyboard(
  rows: Array<Array<{ text: string; callback_data: string }>>,
): TelegramInlineKeyboard {
  return { inline_keyboard: rows };
}
export function back() {
  return keyboard([[button("‹ Dashboard", { view: "dashboard" })]]);
}
export function navigation(refresh = false) {
  return keyboard([
    [button("Store", { view: "shops", filter: "all" }), button("Growth", { view: "growth" })],
    [button("Billing", { view: "billing" }), button("Funnel", { view: "funnel" })],
    [button("Problemi", { view: "issues" }), button("Health", { view: "health" })],
    [button("Performance", { view: "performance" }), button("Attività", { view: "activity" })],
    ...(refresh ? [[button("Aggiorna", { view: "dashboard", refresh: true })]] : []),
  ]);
}
export function pagination(
  view: "shops" | "trials",
  page: number,
  count: number,
  extra: Pick<OwnerControlAction, "filter"> = {},
  itemRows: Array<Array<{ text: string; callback_data: string }>> = [],
) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [...itemRows];
  const controls = [];
  if (page > 0) controls.push(button("‹", { view, page: page - 1, ...extra }));
  if ((page + 1) * SHOPS_PAGE_SIZE < count)
    controls.push(button("›", { view, page: page + 1, ...extra }));
  if (controls.length) rows.push(controls);
  rows.push([button("‹ Dashboard", { view: "dashboard" })]);
  return keyboard(rows);
}
export function value(input: unknown) {
  return input === null || input === undefined ? "—" : String(input);
}

const PERCENT = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 });
export function percent(input: number) {
  return PERCENT.format(input);
}
export function formatDate(input: unknown) {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) return "—";
  return DATE.format(new Date(input));
}
export function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
