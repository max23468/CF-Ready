export type PricingGeneration = "launch" | "balanced" | "value";
export type TrialStatus = "not_started" | "active" | "expired" | "converted";

export type Trial = {
  status: TrialStatus;
  started_at: string | null;
  ends_at: string | null;
  pricing_generation: PricingGeneration;
};

export type EntitlementStatus = "trial" | "active" | "ending" | "expired" | "refunded" | "none";

export type BillingAccount = {
  entitlement_status: EntitlementStatus;
  plan_kind: "monthly" | "annual" | "one_time" | "none";
  pricing_generation: PricingGeneration;
  shopify_charge_gid: string | null;
  current_period_end: string | null;
};

export type ShopifyBilling = {
  subscription: {
    id: string;
    name: string;
    currentPeriodEnd: string | null;
    interval: "EVERY_30_DAYS" | "ANNUAL" | null;
    amount: string | null;
    currency: string | null;
  } | null;
  oneTime: { id: string; createdAt: string; amount: string | null; currency: string | null } | null;
  pendingOneTime: boolean;
};
