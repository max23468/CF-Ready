import { pathToFileURL } from "node:url";

const WEBHOOK_PATH = "/internal/telegram/webhook";

export const OWNER_CONTROL_MENU_COMMANDS = [
  { command: "dashboard", description: "Dashboard" },
  { command: "shops", description: "Store" },
  { command: "growth", description: "Growth" },
  { command: "billing", description: "Billing" },
  { command: "funnel", description: "Funnel" },
  { command: "issues", description: "Problemi" },
  { command: "health", description: "Health" },
  { command: "help", description: "Help" },
];

export function parseOptions(args) {
  const modes = args.filter((argument) => argument === "--check" || argument === "--apply");
  if (modes.length !== 1 || args.length !== 1) {
    throw new Error("Uso: telegram-owner-control.mjs --check|--apply");
  }
  return { mode: modes[0].slice(2) };
}

export function readConfig(environment) {
  const config = {
    botToken: environment.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    chatId: environment.TELEGRAM_CHAT_ID?.trim() ?? "",
    ownerId: environment.TELEGRAM_OWNER_USER_ID?.trim() ?? "",
    webhookSecret: environment.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
    webhookUrl: `${environment.SHOPIFY_APP_URL?.replace(/\/$/, "") ?? ""}${WEBHOOK_PATH}`,
  };
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.botToken)) {
    throw new Error("TELEGRAM_BOT_TOKEN mancante o non valido.");
  }
  if (!/^\d+$/.test(config.chatId) || !/^\d+$/.test(config.ownerId)) {
    throw new Error("TELEGRAM_CHAT_ID o TELEGRAM_OWNER_USER_ID mancante o non valido.");
  }
  if (config.chatId !== config.ownerId) {
    throw new Error("La chat privata owner deve corrispondere a TELEGRAM_OWNER_USER_ID.");
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(config.webhookSecret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET mancante o non valido.");
  }
  try {
    const url = new URL(config.webhookUrl);
    if (url.protocol !== "https:" || url.pathname !== WEBHOOK_PATH || url.search || url.hash) {
      throw new Error();
    }
  } catch {
    throw new Error(`L'URL webhook deve essere HTTPS e terminare con ${WEBHOOK_PATH}.`);
  }
  return config;
}

export async function runTelegramOwnerControl(mode, config, fetcher = fetch) {
  if (mode === "apply") {
    await telegramCall(
      config.botToken,
      "setWebhook",
      {
        url: config.webhookUrl,
        secret_token: config.webhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      },
      fetcher,
    );
    await telegramCall(
      config.botToken,
      "setMyCommands",
      {
        commands: OWNER_CONTROL_MENU_COMMANDS,
        scope: { type: "chat", chat_id: config.chatId },
      },
      fetcher,
    );
  }

  const [webhook, commands] = await Promise.all([
    telegramCall(config.botToken, "getWebhookInfo", {}, fetcher),
    telegramCall(
      config.botToken,
      "getMyCommands",
      { scope: { type: "chat", chat_id: config.chatId } },
      fetcher,
    ),
  ]);
  const actualCommands = Array.isArray(commands)
    ? commands.map(({ command, description }) => ({ command, description }))
    : [];
  const allowedUpdates = Array.isArray(webhook?.allowed_updates)
    ? [...webhook.allowed_updates].sort()
    : [];
  const expectedUpdates = ["callback_query", "message"];
  const state = {
    mode,
    webhook: {
      urlMatches: webhook?.url === config.webhookUrl,
      allowedUpdatesMatch: JSON.stringify(allowedUpdates) === JSON.stringify(expectedUpdates),
      pendingUpdateCount: Number.isSafeInteger(webhook?.pending_update_count)
        ? webhook.pending_update_count
        : null,
    },
    commandsMatch: JSON.stringify(actualCommands) === JSON.stringify(OWNER_CONTROL_MENU_COMMANDS),
  };
  if (!state.webhook.urlMatches || !state.webhook.allowedUpdatesMatch || !state.commandsMatch) {
    throw new Error("Il readback Telegram non corrisponde alla configurazione owner attesa.");
  }
  return state;
}

async function telegramCall(botToken, method, body, fetcher) {
  let response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Telegram ${method}: richiesta fallita.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Telegram ${method}: risposta non valida.`);
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Telegram ${method}: operazione rifiutata.`);
  }
  return payload.result;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const state = await runTelegramOwnerControl(options.mode, readConfig(process.env));
  console.log(JSON.stringify(state, null, 2));
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await main();
