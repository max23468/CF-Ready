import { safeStoreDisplayName } from "../shop-profile.server";

export const PARTNER_EVENT_TYPES = [
  "RELATIONSHIP_INSTALLED",
  "RELATIONSHIP_REACTIVATED",
  "RELATIONSHIP_DEACTIVATED",
  "RELATIONSHIP_UNINSTALLED",
  "SUBSCRIPTION_CHARGE_ACCEPTED",
  "SUBSCRIPTION_CHARGE_ACTIVATED",
  "SUBSCRIPTION_CHARGE_CANCELED",
  "SUBSCRIPTION_CHARGE_DECLINED",
  "SUBSCRIPTION_CHARGE_EXPIRED",
  "SUBSCRIPTION_CHARGE_FROZEN",
  "SUBSCRIPTION_CHARGE_UNFROZEN",
  "ONE_TIME_CHARGE_ACCEPTED",
  "ONE_TIME_CHARGE_ACTIVATED",
  "ONE_TIME_CHARGE_DECLINED",
  "ONE_TIME_CHARGE_EXPIRED",
] as const;

export type PartnerEventType = (typeof PARTNER_EVENT_TYPES)[number];

export type PartnerCharge = {
  id?: string;
  name?: string;
  amount?: { amount?: string; currencyCode?: string };
  billingOn?: string | null;
  test?: boolean;
};

export type PartnerEventNode = {
  type?: string;
  occurredAt?: string;
  shop?: { id?: string; myshopifyDomain?: string; name?: string };
  charge?: PartnerCharge;
};

export type OperationalSnapshot = {
  display_name: string | null;
  installation_status: string;
  country_code: string | null;
  shop_currency: string | null;
  billing_currency: string | null;
  installed_at: string;
  onboarding_status: string | null;
  onboarding_step: number | null;
  validation_enabled: number | null;
  trial_status: string | null;
  trial_ends_at: string | null;
  plan_kind: "monthly" | "annual" | "one_time" | "none" | null;
  entitlement_status: string | null;
};

export type LocalNotificationEvent = Omit<OperationalSnapshot, "trial_ends_at"> & {
  id: number;
  event_name:
    | "app_installed"
    | "app_uninstalled"
    | "trial_started"
    | "trial_expired"
    | "trial_converted"
    | "onboarding_completed"
    | "validation_enabled"
    | "validation_disabled";
  shop_domain: string;
  ends_at: string | null;
  occurred_at: string;
  reinstalled: number;
};

export type LocalBillingEvent = OperationalSnapshot & {
  id: number;
  shop_domain: string;
  shopify_resource_gid: string;
  event_type: "active" | "ending" | "expired" | "refunded";
  status: "monthly" | "annual" | "one_time" | "none";
  amount_minor: number | null;
  currency: string | null;
  period_end: string | null;
  occurred_at: string;
  previous_plan_kind: "monthly" | "annual" | "one_time" | "none" | null;
};

export function planKindFromCharge(type: PartnerEventType, name: string | undefined) {
  if (type.startsWith("ONE_TIME_")) return "one_time" as const;
  const normalized = name?.toLocaleLowerCase("it-IT") ?? "";
  if (normalized.includes("annuale")) return "annual" as const;
  if (normalized.includes("mensile")) return "monthly" as const;
  return null;
}

export function planLabel(kind: string | null | undefined) {
  return {
    monthly: "Mensile",
    annual: "Annuale",
    one_time: "Pagamento unico",
  }[kind ?? ""];
}

export function safePlanName(value: string | undefined) {
  if (!value) return null;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 120) : null;
}

export function normalizeShopDomain(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error("partner_api_invalid_shop_domain");
  }
  return normalized;
}

export function localBillingPlan(event: LocalBillingEvent) {
  if (event.status !== "none") return event.status;
  return event.previous_plan_kind && event.previous_plan_kind !== "none"
    ? event.previous_plan_kind
    : null;
}

export function validPartnerEvent(node: PartnerEventNode | undefined): node is PartnerEventNode {
  if (
    !node ||
    !PARTNER_EVENT_TYPES.includes(node.type as PartnerEventType) ||
    !node.shop?.id ||
    !node.shop.myshopifyDomain ||
    !safeStoreDisplayName(node.shop.name) ||
    !validIsoDate(node.occurredAt)
  ) {
    return false;
  }
  try {
    normalizeShopDomain(node.shop.myshopifyDomain);
  } catch {
    return false;
  }
  if ((node.type ?? "").startsWith("RELATIONSHIP_")) return true;
  return Boolean(
    node.charge?.id &&
    safePlanName(node.charge.name) &&
    validMoney(node.charge.amount) &&
    typeof node.charge.test === "boolean",
  );
}

export function localNotificationEvent(event: LocalNotificationEvent) {
  return [
    "app_installed",
    "app_uninstalled",
    "trial_started",
    "trial_expired",
    "trial_converted",
    "onboarding_completed",
    "validation_enabled",
    "validation_disabled",
  ].includes(event.event_name);
}

export function validLocalBillingEvent(event: LocalBillingEvent) {
  return Boolean(
    event.shopify_resource_gid &&
    ["active", "ending", "expired", "refunded"].includes(event.event_type) &&
    ["monthly", "annual", "one_time", "none"].includes(event.status) &&
    localBillingPlan(event) &&
    validIsoDate(event.occurred_at),
  );
}

export function validMinorMoney(amountMinor: number | null, currency: string | null) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor === null || amountMinor < 0) return false;
  return validMoney({ amount: String(amountMinor / 100), currencyCode: currency ?? undefined });
}

export function validMoney(
  value: PartnerCharge["amount"],
): value is NonNullable<PartnerCharge["amount"]> {
  if (!value?.amount || !/^[A-Z]{3}$/.test(value.currencyCode ?? "")) return false;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount < 0) return false;
  try {
    new Intl.NumberFormat("it-IT", { style: "currency", currency: value.currencyCode }).format(
      amount,
    );
    return true;
  } catch {
    return false;
  }
}

export function validIsoDate(value: string | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

export function validCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
