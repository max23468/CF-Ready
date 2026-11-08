import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import {
  enableCheckoutLabels,
  readCheckoutLabelState,
} from "../../app/checkout-labels/repository.server";
import { DEFAULT_CONFIG, type Rules } from "../../app/config";
import { reconcileBillingAccount } from "../../app/reconcile-account.server";
import { d1WithFault } from "../support/d1-fault";
import { merchant } from "../support/merchant";
import type { ShopifyAdminFake } from "../support/shopify-admin";

const LABEL_READS = ["DiscoverCheckoutLabelContext", "DiscoverCheckoutLabelResources"];
const UNMANAGED: Rules = { taxCode: "unmanaged", pec: "unmanaged" };
const MANAGED: Rules = { taxCode: "required_validated", pec: "unmanaged" };

let shop: string;
let shopify: ShopifyAdminFake;

beforeEach(async () => {
  ({ shop, shopify } = await merchant("etichette-periodiche"));
});

const reconcileAccount = (db: D1Database = env.DB) =>
  reconcileBillingAccount(shopify.admin as never, db, shop);

test.each([
  ["gestite", MANAGED, "checkout_labels_confirmation_required"],
  ["non gestite", UNMANAGED, null],
] as const)(
  "la riconciliazione periodica ricalcola le etichette con le regole salvate: %s",
  async (_name, rules, lastErrorCode) => {
    shopify.addValidation({ ...DEFAULT_CONFIG, rules }, true);
    await enableCheckoutLabels(env.DB, shop, "partial");

    await expect(reconcileAccount()).resolves.toEqual({ retryable: false, errorCode: null });

    expect(await readCheckoutLabelState(env.DB, shop)).toMatchObject({
      mode: "partial",
      lastErrorCode,
      lastReadAt: expect.any(String),
    });
  },
);

test("senza etichette gestite la riconciliazione periodica non legge le traduzioni", async () => {
  shopify.addValidation({ ...DEFAULT_CONFIG, rules: MANAGED }, true);

  await reconcileAccount();

  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});

test("una lettura etichette fallita in Shopify non cambia l'esito del billing", async () => {
  shopify.addValidation({ ...DEFAULT_CONFIG, rules: MANAGED }, true);
  await enableCheckoutLabels(env.DB, shop, "guided");
  shopify.failNext("DiscoverCheckoutLabelContext", new Error("checkout_labels_readback_failed"));

  await expect(reconcileAccount()).resolves.toEqual({ retryable: false, errorCode: null });

  expect(shopify.callsTo("DiscoverCheckoutLabelContext")).toHaveLength(1);
});

test("un guasto D1 sullo stato etichette non cambia l'esito del billing", async () => {
  shopify.addValidation({ ...DEFAULT_CONFIG, rules: MANAGED }, true);
  const { db } = d1WithFault(env.DB, {
    sql: "SELECT checkout_labels_mode",
    first: () => {
      throw new Error("D1 non disponibile");
    },
  });

  await expect(reconcileAccount(db)).resolves.toEqual({ retryable: false, errorCode: null });

  expect(shopify.callsTo(...LABEL_READS)).toEqual([]);
});
