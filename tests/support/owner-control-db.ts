import { env } from "cloudflare:test";
import type { OwnerControlRuntimeConfig } from "../../app/owner-control/commands.server";
import type { OwnerControlBindings } from "../../app/owner-control/handler.server";
import { BOT_TOKEN, CHAT_ID, OWNER_ID, SECRET, PARTNER } from "./owner-control";

export const controlConfig = (): OwnerControlRuntimeConfig => ({
  botToken: BOT_TOKEN,
  chatId: CHAT_ID,
  organizationId: PARTNER.organizationId,
  partnerAppId: PARTNER.appId,
  partnerAccessToken: PARTNER.accessToken,
  environment: "production",
  webhookUrl: "https://cf-ready-prod.test/internal/telegram/webhook",
  versionMetadata: {
    id: "worker-v1",
    tag: "release",
    timestamp: "2026-09-08T10:00:00.000Z",
  },
});

export const controlEnv = (): OwnerControlBindings => ({
  DB: env.DB,
  OWNER_TELEGRAM_CONTROL_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  TELEGRAM_CHAT_ID: CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  TELEGRAM_OWNER_USER_ID: OWNER_ID,
  SHOPIFY_PARTNER_ORGANIZATION_ID: PARTNER.organizationId,
  SHOPIFY_PARTNER_APP_ID: PARTNER.appId,
  SHOPIFY_PARTNER_ACCESS_TOKEN: PARTNER.accessToken,
  SHOPIFY_APP_URL: "https://cf-ready-prod.test",
  APP_ENVIRONMENT: "production",
  CF_VERSION_METADATA: {
    id: "worker-v1",
    tag: "release",
    timestamp: "2026-09-08T10:00:00.000Z",
  },
});

export async function insertStore(
  id: number,
  domain: string,
  options: {
    onboarding?: string;
    validation?: number;
    error?: string;
    plan?: [string, string, string];
    trial?: boolean;
    complimentary?: boolean;
    country?: string;
  } = {},
) {
  const timestamp = "2026-09-01T10:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops
       (id, shop_domain, display_name, installation_status, installed_at, country_code,
        created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  )
    .bind(id, domain, `Store ${id}`, timestamp, options.country ?? null, timestamp, timestamp)
    .run();
  await env.DB.prepare(
    `INSERT INTO app_state
       (shop_id, validation_enabled, last_error_code, onboarding_status, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      options.validation ?? 0,
      options.error ?? null,
      options.onboarding ?? "not_started",
      timestamp,
    )
    .run();
  if (options.plan) {
    await env.DB.prepare(
      `INSERT INTO billing_accounts
         (shop_id, entitlement_status, plan_kind, pricing_generation, current_period_end,
          is_test, created_at, updated_at)
       VALUES (?, ?, ?, ?, '2027-01-01', 0, ?, ?)`,
    )
      .bind(id, ...options.plan, timestamp, timestamp)
      .run();
  }
  if (options.trial) {
    await env.DB.prepare(
      `INSERT INTO trials
         (shop_id, status, eligible_at, started_at, ends_at, pricing_generation, created_at, updated_at)
       VALUES (?, 'active', '2026-09-01', '2026-09-01', '2099-09-20', 'balanced', ?, ?)`,
    )
      .bind(id, timestamp, timestamp)
      .run();
  }
  if (options.complimentary) {
    await env.DB.prepare(
      `INSERT INTO complimentary_entitlements
         (shop_id, status, granted_at, created_at, updated_at)
       VALUES (?, 'active', ?, ?, ?)`,
    )
      .bind(id, timestamp, timestamp, timestamp)
      .run();
  }
}

export async function resetOwnerControl() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owner_control_updates"),
    env.DB.prepare("DELETE FROM owner_control_state"),
    env.DB.prepare("DELETE FROM owner_operational_incidents"),
    env.DB.prepare("DELETE FROM owner_notifications"),
    env.DB.prepare("DELETE FROM owner_notification_state"),
    env.DB.prepare("DELETE FROM app_events"),
    env.DB.prepare("DELETE FROM webhook_events"),
    env.DB.prepare("DELETE FROM shops"),
  ]);
}
