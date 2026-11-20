// Le query usano `b` come alias di billing_accounts.
export const SALE_MATCHED_SQL = `(b.sale_observed_at IS NOT NULL
  AND b.sale_charge_gid IS b.shopify_charge_gid
  AND (b.plan_kind = 'one_time' OR b.sale_cycle_start IS b.current_period_start))`;

export const SALE_REFERENCE_SQL = `CASE
  WHEN b.plan_kind = 'one_time'
    THEN COALESCE(b.charge_accepted_at, b.charge_activated_at, b.one_time_purchased_at, b.created_at)
  WHEN date(b.current_period_start) > date(COALESCE(b.charge_accepted_at, b.charge_activated_at,
                                                   b.current_period_start))
    THEN b.current_period_start
  ELSE COALESCE(b.charge_accepted_at, b.charge_activated_at, b.current_period_start, b.created_at)
END`;
