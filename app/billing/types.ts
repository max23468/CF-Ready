export type PricingGeneration = "launch" | "balanced";
export type TrialStatus = "not_started" | "active" | "expired" | "converted";

export type Trial = {
  status: TrialStatus;
  started_at: string | null;
  ends_at: string | null;
  pricing_generation: PricingGeneration;
};

export type EntitlementStatus = "trial" | "active" | "ending" | "expired" | "refunded" | "none";
export type ShopifySubscriptionStatus =
  | "ACTIVE"
  | "CANCELLED"
  | "DECLINED"
  | "EXPIRED"
  | "FROZEN"
  | "PENDING";

export type BillingAccount = {
  entitlement_status: EntitlementStatus;
  plan_kind: "monthly" | "annual" | "one_time" | "none";
  pricing_generation: PricingGeneration;
  shopify_charge_gid: string | null;
  shopify_status: ShopifySubscriptionStatus | "UNKNOWN";
  is_test: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  reconciliation_attempted_at?: string | null;
  reconciliation_error_code?: string | null;
};

export type ComplimentaryEntitlement = {
  status: "active" | "revoked";
  granted_at: string;
  revoked_at: string | null;
};

export type ShopifySubscription = {
  id: string;
  name: string;
  status: ShopifySubscriptionStatus;
  createdAt: string;
  trialDays: number;
  test: boolean;
  currentPeriodEnd: string | null;
  interval: "EVERY_30_DAYS" | "ANNUAL" | null;
  amount: string | null;
  currency: string | null;
};

export type ShopifyBilling = {
  subscription: ShopifySubscription | null;
  latestSubscription: ShopifySubscription | null;
  oneTime: {
    id: string;
    createdAt: string;
    test: boolean;
    amount: string | null;
    currency: string | null;
  } | null;
  pendingOneTime: boolean;
};
