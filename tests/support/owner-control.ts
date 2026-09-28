import { vi } from "vitest";
import type { ShopRow } from "../../app/owner-control/queries.server";

export const NOW = new Date("2026-09-08T12:00:00.000Z");
export const BOT_TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_ABCD";
export const CHAT_ID = "10001";
export const OWNER_ID = "10001";
export const SECRET = "owner-control-secret-with-32-chars";
export const PARTNER = { organizationId: "org", appId: "app", accessToken: "partner-token" };

export function messageUpdate(
  text: string,
  options: { updateId?: number; chatId?: number; userId?: number; chatType?: string } = {},
) {
  return {
    update_id: options.updateId ?? 1,
    message: {
      message_id: 10,
      chat: { id: options.chatId ?? Number(CHAT_ID), type: options.chatType ?? "private" },
      from: { id: options.userId ?? Number(OWNER_ID) },
      text,
    },
  };
}

export function callbackUpdate(
  data: string,
  options: { updateId?: number; chatId?: number; userId?: number; chatType?: string } = {},
) {
  return {
    update_id: options.updateId ?? 2,
    callback_query: {
      id: `callback-${options.updateId ?? 2}`,
      from: { id: options.userId ?? Number(OWNER_ID) },
      data,
      message: {
        message_id: 77,
        chat: { id: options.chatId ?? Number(CHAT_ID), type: options.chatType ?? "private" },
        from: { id: 999_999 },
      },
    },
  };
}

export function request(
  payload: unknown,
  options: {
    method?: string;
    contentType?: string;
    secret?: string;
    body?: BodyInit | null;
  } = {},
) {
  const method = options.method ?? "POST";
  return new Request("https://cf-ready-prod.test/internal/telegram/webhook", {
    method,
    headers: {
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      "x-telegram-bot-api-secret-token": options.secret ?? SECRET,
    },
    ...(options.body === undefined
      ? method === "GET" || method === "HEAD"
        ? {}
        : { body: JSON.stringify(payload) }
      : { body: options.body }),
  });
}

export function telegramSuccess() {
  return vi.fn(async () =>
    Response.json({ ok: true, result: { message_id: 88 } }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

export function methods(fetcher: unknown) {
  const mock = fetcher as ReturnType<typeof vi.fn>;
  return mock.mock.calls.map(([input]) => String(input).split("/").at(-1));
}

export function bodyAt(fetcher: unknown, index: number) {
  const mock = fetcher as ReturnType<typeof vi.fn>;
  return JSON.parse(String((mock.mock.calls[index][1] as RequestInit).body));
}

export function shopFixture(overrides: Partial<ShopRow> = {}): ShopRow {
  return {
    id: 1,
    shop_domain: "atelier.myshopify.com",
    display_name: "Atelier",
    installation_status: "active",
    installed_at: NOW.toISOString(),
    country_code: "IT",
    onboarding_status: "completed",
    validation_enabled: 1,
    config_schema_version: 1,
    config_hash: "1234567890abcdef",
    validation_state_revision: 2,
    last_sync_at: NOW.toISOString(),
    last_error_code: null,
    trial_status: null,
    trial_ends_at: null,
    entitlement_status: null,
    plan_kind: null,
    pricing_generation: null,
    current_period_start: null,
    current_period_end: null,
    shopify_status: null,
    billing_is_test: null,
    last_reconciled_at: null,
    sale_observed_at: null,
    sale_checked_at: null,
    sale_charge_gid: null,
    sale_cycle_start: null,
    shopify_charge_gid: null,
    conversion_credit_status: null,
    conversion_credit_amount_minor: null,
    conversion_credit_currency: null,
    conversion_credit_transaction_type: null,
    conversion_credit_observed_at: null,
    conversion_requested_at: null,
    conversion_subscription_sale_observed_at: null,
    complimentary_status: null,
    ...overrides,
  };
}

export function growthEvent(type: string, occurredAt: string) {
  return { type, occurredAt };
}

export function growthResponse(
  edges: Array<{ cursor: string; node: { type: string; occurredAt: string } }>,
  hasNextPage: boolean,
) {
  return Response.json({ data: { app: { events: { edges, pageInfo: { hasNextPage } } } } });
}

export function revenueTransaction(
  typename: string,
  gross: string | null,
  net: string,
  currencyCode = "USD",
) {
  return {
    __typename: typename,
    grossAmount: gross === null ? null : { amount: gross, currencyCode },
    netAmount: { amount: net, currencyCode },
  };
}

export function revenueResponse(
  edges: Array<{ cursor: string; node: ReturnType<typeof revenueTransaction> }>,
  hasNextPage: boolean,
) {
  return Response.json({ data: { transactions: { edges, pageInfo: { hasNextPage } } } });
}
