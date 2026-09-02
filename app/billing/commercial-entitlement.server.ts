import type { Entitlement } from "../config";
import { currentPricingGeneration, entitlementFor } from "./domain";
import {
  markTrialConverted,
  readBillingAccount,
  readComplimentaryEntitlement,
  syncBillingAccount,
  syncTrial,
} from "./repository.server";
import type { ShopifyBilling } from "./types";

export async function readCommercialInputs(db: D1Database, shopDomain: string, today: string) {
  const [trial, account, complimentary] = await Promise.all([
    syncTrial(db, shopDomain, { today }),
    readBillingAccount(db, shopDomain),
    readComplimentaryEntitlement(db, shopDomain),
  ]);
  return { trial, account, complimentary };
}

export async function syncCommercialEntitlement(
  db: D1Database,
  shopDomain: string,
  options: {
    billing: ShopifyBilling;
    inputs: Awaited<ReturnType<typeof readCommercialInputs>>;
    timeZone: string;
    today: string;
  },
) {
  const { billing, inputs, timeZone, today } = options;
  const account = await syncBillingAccount(db, shopDomain, billing, {
    today,
    timeZone,
    pricingGeneration: currentPricingGeneration(inputs.trial, inputs.account, today),
    storedAccount: inputs.account,
  });
  const complimentaryOperational =
    inputs.complimentary?.status === "active" && billing.subscription === null;

  if (account.entitlement_status === "active" || complimentaryOperational) {
    await markTrialConverted(db, shopDomain);
  }

  const entitlement: Entitlement = entitlementFor(
    inputs.trial,
    today,
    account,
    complimentaryOperational ? inputs.complimentary : null,
  );
  return { account, complimentaryOperational, entitlement };
}
