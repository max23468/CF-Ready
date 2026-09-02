import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  topic: "SHOP_UPDATE",
  installationStartedAt: null as string | null,
  runClaimedWebhook: vi.fn(),
  recordEvent: vi.fn(),
  markUninstalled: vi.fn(),
  redactShop: vi.fn(),
  findSessionsByShop: vi.fn(),
  storeSession: vi.fn(),
  admin: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../../app/webhooks.server", () => ({
  runClaimedWebhook: mocks.runClaimedWebhook,
}));
vi.mock("../../app/events.server", () => ({ recordEvent: mocks.recordEvent }));
vi.mock("../../app/shop.server", () => ({
  markUninstalled: mocks.markUninstalled,
  redactShop: mocks.redactShop,
}));
vi.mock("../../app/shopify.server", () => ({
  sessionStorage: {
    findSessionsByShop: mocks.findSessionsByShop,
    storeSession: mocks.storeSession,
  },
  unauthenticated: { admin: mocks.admin },
}));
vi.mock("../../app/validation.server", () => ({ reconcile: mocks.reconcile }));

import { processWebhookJob } from "../../app/webhook-jobs.server";

const db = {} as D1Database;
const job = {
  webhookId: "wh-outcome",
  claimToken: "claim-outcome",
  shop: "outcome.myshopify.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.topic = "SHOP_UPDATE";
  mocks.installationStartedAt = null;
  mocks.runClaimedWebhook.mockImplementation(
    async (_db, queuedJob, handler: (claim: unknown) => Promise<void>) =>
      handler({
        webhookId: queuedJob.webhookId,
        topic: mocks.topic,
        shop: queuedJob.shop,
        installationStartedAt: mocks.installationStartedAt,
      }),
  );
  mocks.findSessionsByShop.mockResolvedValue([{ id: "offline", isOnline: false, scope: "old" }]);
  mocks.admin.mockResolvedValue({ admin: "admin-client" });
  mocks.reconcile.mockResolvedValue({
    retryable: false,
    countryCode: "IT",
    validationEnabled: true,
    account: { entitlement_status: "active" },
  });
  mocks.redactShop.mockResolvedValue(true);
});

test("marca la stessa installazione come disinstallata", async () => {
  mocks.topic = "APP_UNINSTALLED";
  mocks.installationStartedAt = "2026-08-01T10:00:00.000Z";

  await processWebhookJob(db, job);

  expect(mocks.markUninstalled).toHaveBeenCalledWith(
    db,
    job.shop,
    mocks.installationStartedAt,
    job.webhookId,
  );
});

test("una disinstallazione senza installazione associata resta fail-open", async () => {
  mocks.topic = "APP_UNINSTALLED";

  await expect(processWebhookJob(db, job)).resolves.toBeUndefined();
  expect(mocks.markUninstalled).not.toHaveBeenCalled();
});

test("aggiorna soltanto la sessione offline quando Shopify invia gli scope", async () => {
  mocks.topic = "APP_SCOPES_UPDATE";
  const online = { id: "online", isOnline: true, scope: "online" };
  const offline = { id: "offline", isOnline: false, scope: "old" };
  mocks.findSessionsByShop.mockResolvedValue([online, offline]);

  await processWebhookJob(db, { ...job, currentScopes: ["read_products", "write_products"] });

  expect(offline.scope).toBe("read_products,write_products");
  expect(mocks.storeSession).toHaveBeenCalledWith(offline);
  expect(online.scope).toBe("online");
});

test.each([
  [[], ["read_products"]],
  [[{ id: "offline", isOnline: false }], undefined],
] as const)("ignora un aggiornamento scope incompleto", async (sessions, currentScopes) => {
  mocks.topic = "APP_SCOPES_UPDATE";
  mocks.findSessionsByShop.mockResolvedValue(sessions);

  await processWebhookJob(db, {
    ...job,
    currentScopes: currentScopes ? [...currentScopes] : undefined,
  });

  expect(mocks.storeSession).not.toHaveBeenCalled();
});

test("rimuove i dati dello shop quando la redazione è applicabile", async () => {
  mocks.topic = "SHOP_REDACT";

  await processWebhookJob(db, job);

  expect(mocks.redactShop).toHaveBeenCalledWith(db, job.shop, job.webhookId);
  expect(mocks.recordEvent).not.toHaveBeenCalled();
});

test("registra il motivo quando una redazione non può toccare un'installazione attiva", async () => {
  mocks.topic = "SHOP_REDACT";
  mocks.redactShop.mockResolvedValue(false);

  await processWebhookJob(db, job);

  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({
      name: "shop_redact_skipped",
      metadata: { topic: "SHOP_REDACT", reason: "installation_active" },
    }),
  );
});

test.each(["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT"])(
  "riconosce %s senza leggere dati cliente",
  async (topic) => {
    mocks.topic = topic;

    await processWebhookJob(db, job);

    expect(mocks.recordEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        name: "compliance_acknowledged",
        metadata: { topic },
      }),
    );
  },
);

describe.each([
  ["SHOP_UPDATE", "shop", "shop_updated", "lifecycle"],
  ["APP_SUBSCRIPTIONS_UPDATE", "billing", "billing_updated", "billing"],
  ["APP_PURCHASES_ONE_TIME_UPDATE", "billing", "billing_updated", "billing"],
] as const)("riconcilia %s", (topic, _kind, eventName, eventClass) => {
  test("aggiorna lo stato tramite un contesto admin offline", async () => {
    mocks.topic = topic;

    await processWebhookJob(db, job);

    expect(mocks.admin).toHaveBeenCalledWith(job.shop);
    expect(mocks.reconcile).toHaveBeenCalledWith("admin-client", db, job.shop);
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ name: eventName, class: eventClass }),
    );
  });
});

test.each([
  ["SHOP_UPDATE", "shop_update_skipped", "lifecycle"],
  ["APP_SUBSCRIPTIONS_UPDATE", "billing_update_skipped", "billing"],
] as const)("%s resta fail-open senza sessione offline", async (topic, name, eventClass) => {
  mocks.topic = topic;
  mocks.findSessionsByShop.mockResolvedValue([{ id: "online", isOnline: true }]);

  await processWebhookJob(db, job);

  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({
      name,
      class: eventClass,
      metadata: { error_code: "missing_admin_context" },
    }),
  );
});

test("mantiene ritentabile una riconciliazione transitoria", async () => {
  mocks.topic = "SHOP_UPDATE";
  mocks.reconcile.mockResolvedValue({ retryable: true, errorCode: "validation_locked" });

  await expect(processWebhookJob(db, job)).rejects.toThrow("validation_locked");
  expect(mocks.recordEvent).not.toHaveBeenCalled();
});

test("usa un codice stabile quando il retry non ne espone uno", async () => {
  mocks.topic = "APP_SUBSCRIPTIONS_UPDATE";
  mocks.reconcile.mockResolvedValue({ retryable: true });

  await expect(processWebhookJob(db, job)).rejects.toThrow("reconciliation_retryable");
});

test.each([
  [
    "SHOP_UPDATE",
    { countryCode: "FR", validationEnabled: false, errorCode: "country_unsupported" },
  ],
  [
    "APP_SUBSCRIPTIONS_UPDATE",
    { account: null, errorCode: "billing_read_failed", validationEnabled: false },
  ],
] as const)("registra i dettagli operativi di %s", async (topic, state) => {
  mocks.topic = topic;
  mocks.reconcile.mockResolvedValue({ ...state, retryable: false });

  await processWebhookJob(db, job);

  expect(mocks.recordEvent).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ metadata: expect.objectContaining({ error_code: state.errorCode }) }),
  );
});

test("rifiuta un topic non instradato mantenendo il claim ritentabile", async () => {
  mocks.topic = "UNKNOWN_TOPIC";

  await expect(processWebhookJob(db, job)).rejects.toThrow("unsupported_webhook_topic");
});
