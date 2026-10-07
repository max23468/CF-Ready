import { beforeEach, expect, test, vi } from "vitest";
import { reconcileBillingAccount } from "../../app/billing/periodic-reconciliation.server";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  readCheckoutLabelState: vi.fn(),
  loadCheckoutLabels: vi.fn(),
}));

vi.mock("../../app/validation.server", () => ({ reconcile: mocks.reconcile }));
vi.mock("../../app/checkout-labels/repository.server", () => ({
  readCheckoutLabelState: mocks.readCheckoutLabelState,
}));
vi.mock("../../app/checkout-labels/service.server", () => ({
  loadCheckoutLabels: mocks.loadCheckoutLabels,
}));

const admin = { graphql: vi.fn() } as never;
const db = {} as D1Database;
const shop = "etichette-periodiche.example.myshopify.com";
const rules = { taxCode: "required_validated", pec: "unmanaged" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reconcile.mockResolvedValue({
    errorCode: null,
    retryable: false,
    validation: { metafield: { jsonValue: { schemaVersion: 3, rules } } },
  });
});

test("la riconciliazione periodica ricalcola le etichette gestite con le regole salvate", async () => {
  mocks.readCheckoutLabelState.mockResolvedValue({ mode: "partial" });

  await expect(reconcileBillingAccount(admin, db, shop)).resolves.toEqual({
    retryable: false,
    errorCode: null,
  });

  expect(mocks.loadCheckoutLabels).toHaveBeenCalledWith(
    admin,
    db,
    shop,
    expect.objectContaining(rules),
  );
});

test("senza etichette gestite la riconciliazione periodica non legge le traduzioni", async () => {
  mocks.readCheckoutLabelState.mockResolvedValue({ mode: "off" });

  await reconcileBillingAccount(admin, db, shop);

  expect(mocks.loadCheckoutLabels).not.toHaveBeenCalled();
});

test("un errore delle etichette non cambia l'esito del billing", async () => {
  mocks.readCheckoutLabelState.mockResolvedValue({ mode: "guided" });
  mocks.loadCheckoutLabels.mockRejectedValue(new Error("checkout_labels_readback_failed"));

  await expect(reconcileBillingAccount(admin, db, shop)).resolves.toEqual({
    retryable: false,
    errorCode: null,
  });
});
