// Node importa questo file da cloudflare.config.ts senza bundler: deve restare privo di import.
export const CRON_INTERVAL_MINUTES = 5;
export const WEBHOOK_FAILURE_QUEUE_SUFFIX = "-failures";
export const WEBHOOK_RETRY_DELAY_SECONDS = 10;
export const WEBHOOK_FAILURE_RETRY_DELAY_SECONDS = 60;
