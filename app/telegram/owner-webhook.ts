export const OWNER_CONTROL_PATH = "/internal/telegram/webhook";
export const OWNER_CONTROL_ALLOWED_UPDATES = ["message", "callback_query"] as const;

export const TELEGRAM_BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{20,}$/;
export const TELEGRAM_PRIVATE_ID_PATTERN = /^\d+$/;
export const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
