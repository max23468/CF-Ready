import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordEvent: vi.fn(),
  findSessionsByShop: vi.fn(),
  admin: vi.fn(),
  claimWebhook: vi.fn(),
}));

vi.mock("../app/events.server", () => ({ recordEvent: mocks.recordEvent }));
vi.mock("../app/shopify.server", () => ({
  sessionStorage: { findSessionsByShop: mocks.findSessionsByShop },
  unauthenticated: { admin: mocks.admin },
}));
vi.mock("../app/webhooks/webhook-ingress.server", () => ({ claimWebhook: mocks.claimWebhook }));

import type { Rules } from "../app/config";
import { normalizedOrderFields, normalizesOrderFields } from "../app/order-normalization/domain";
import {
  enqueueOrderBackfill,
  ORDER_BACKFILL_TOPIC,
  orderBackfillSince,
} from "../app/order-normalization/backfill-queue.server";
import {
  processOrderBackfillJob,
  processOrderCreatedJob,
} from "../app/order-normalization/jobs.server";
import { normalizeOrder, normalizeOrdersPage } from "../app/order-normalization/service.server";

const managed: Rules = {
  taxCode: "optional_validated",
  pec: "required_when_company",
  normalizeOrderFields: true,
};
const taxCode = { key: "TAX_CREDENTIAL_IT", value: " rssmra85t10a562s " };
const pec = { key: "TAX_EMAIL_IT", value: "Mario.Rossi@PEC.it" };

describe("dominio", () => {
  test("uniforma Codice Fiscale e PEC validi dei campi gestiti", () => {
    expect(normalizedOrderFields([taxCode, pec], managed)).toEqual([
      { key: "TAX_CREDENTIAL_IT", value: "RSSMRA85T10A562S" },
      { key: "TAX_EMAIL_IT", value: "mario.rossi@pec.it" },
    ]);
  });

  test("lascia invariati valori già canonici, non validi, non gestiti o di altre chiavi", () => {
    const fields = [
      { key: "TAX_CREDENTIAL_IT", value: "RSSMRA85T10A562S" },
      { key: "TAX_EMAIL_IT", value: "mario rossi@pec.it" },
      { key: "TAX_CREDENTIAL_BR", value: "abc" },
    ];
    expect(normalizedOrderFields(fields, managed)).toEqual([]);
    expect(normalizedOrderFields([taxCode, pec], { ...managed, pec: "unmanaged" })).toEqual([
      { key: "TAX_CREDENTIAL_IT", value: "RSSMRA85T10A562S" },
    ]);
    expect(normalizedOrderFields([{ ...taxCode, value: "rssmra85t10a562x" }], managed)).toEqual([]);
  });

  test("l'opzione vale solo se attiva e con almeno un campo gestito", () => {
    expect(normalizesOrderFields(managed)).toBe(true);
    expect(normalizesOrderFields({ ...managed, normalizeOrderFields: false })).toBe(false);
    expect(
      normalizesOrderFields({ taxCode: "unmanaged", pec: "unmanaged", normalizeOrderFields: true }),
    ).toBe(false);
    expect(normalizedOrderFields([taxCode], { ...managed, normalizeOrderFields: false })).toEqual(
      [],
    );
  });
});

type Call = { query: string; variables?: Record<string, unknown> };

function validation(rules: Rules, enabled = true) {
  return {
    nodes: [
      { enabled: true, shopifyFunction: { handle: "altra-app" }, metafield: null },
      {
        enabled,
        shopifyFunction: { handle: "cf-ready-validation" },
        metafield: { jsonValue: { schemaVersion: 3, rules } },
      },
    ],
  };
}

function fakeAdmin(responses: Array<unknown | Error>) {
  const calls: Call[] = [];
  const admin = {
    graphql: vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
      calls.push({ query, variables: options?.variables });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (next instanceof Response) return next;
      return Response.json(next);
    }),
  };
  return { admin, calls };
}

const order = (id: string, fields = [taxCode, pec]) => ({
  id,
  localizedFields: { nodes: fields },
});
const updated = { data: { orderUpdate: { userErrors: [] } } };

describe("servizio", () => {
  test("aggiorna solo le chiavi da correggere di un nuovo ordine", async () => {
    const { admin, calls } = fakeAdmin([
      {
        data: {
          order: order("gid://shopify/Order/1", [
            taxCode,
            { key: "TAX_EMAIL_IT", value: "mario@pec.it" },
          ]),
          validations: validation(managed),
        },
      },
      updated,
    ]);

    await expect(normalizeOrder(admin, "gid://shopify/Order/1")).resolves.toEqual({ updated: 1 });
    expect(calls[1].variables).toEqual({
      input: {
        id: "gid://shopify/Order/1",
        localizedFields: [{ key: "TAX_CREDENTIAL_IT", value: "RSSMRA85T10A562S" }],
      },
    });
  });

  test("non scrive con Validation spenta, opzione disattivata o ordine assente", async () => {
    for (const data of [
      { order: order("o"), validations: validation(managed, false) },
      { order: order("o"), validations: validation({ ...managed, normalizeOrderFields: false }) },
      { order: null, validations: validation(managed) },
      { order: order("o"), validations: { nodes: [] } },
    ]) {
      const { admin, calls } = fakeAdmin([{ data }]);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await expect(normalizeOrder(admin, "o")).resolves.toEqual({ updated: 0 });
      expect(calls).toHaveLength(1);
    }
  });

  test("distingue scope mancanti, errori GraphQL ed errori della mutation", async () => {
    const denied = Object.assign(new Error("GraphQL"), {
      body: { errors: [{ extensions: { code: "ACCESS_DENIED" } }] },
    });
    await expect(normalizeOrder(fakeAdmin([denied]).admin, "o")).rejects.toThrow(
      "order_scope_missing",
    );
    await expect(
      normalizeOrder(
        fakeAdmin([{ errors: [{ extensions: { code: "ACCESS_DENIED" } }] }]).admin,
        "o",
      ),
    ).rejects.toThrow("order_scope_missing");
    await expect(
      normalizeOrder(fakeAdmin([new Response(null, { status: 403 })]).admin, "o"),
    ).rejects.toThrow("order_scope_missing");
    await expect(normalizeOrder(fakeAdmin([new Error("rete")]).admin, "o")).rejects.toThrow(
      "order_query_failed",
    );
    await expect(normalizeOrder(fakeAdmin([{ errors: [{}] }]).admin, "o")).rejects.toThrow(
      "order_query_failed",
    );
    await expect(
      normalizeOrder(
        fakeAdmin([
          { data: { order: order("o"), validations: validation(managed) } },
          { data: { orderUpdate: { userErrors: [{ message: "no" }] } } },
        ]).admin,
        "o",
      ),
    ).rejects.toThrow("order_update_failed");
  });

  test("una pagina di ordini esistenti corregge solo quelli da uniformare", async () => {
    const { admin, calls } = fakeAdmin([
      {
        data: {
          orders: {
            nodes: [
              order("a"),
              order("b", [{ key: "TAX_CREDENTIAL_IT", value: "RSSMRA85T10A562S" }]),
            ],
            pageInfo: { hasNextPage: true, endCursor: "next" },
          },
          validations: validation(managed),
        },
      },
      updated,
    ]);

    await expect(normalizeOrdersPage(admin, "2026-09-06T00:00:00.000Z", "prev")).resolves.toEqual({
      scanned: 2,
      updated: 1,
      nextCursor: "next",
    });
    expect(calls[0].variables).toMatchObject({
      after: "prev",
      query: "created_at:>='2026-09-06T00:00:00.000Z'",
    });
  });

  test("l'ultima pagina o l'opzione spenta chiudono la correzione", async () => {
    const last = fakeAdmin([
      {
        data: {
          orders: { nodes: [], pageInfo: { hasNextPage: false, endCursor: "x" } },
          validations: validation(managed),
        },
      },
    ]);
    await expect(normalizeOrdersPage(last.admin, "s", null)).resolves.toMatchObject({
      nextCursor: null,
    });
    const off = fakeAdmin([
      {
        data: {
          orders: { nodes: [order("a")], pageInfo: { hasNextPage: true, endCursor: "x" } },
          validations: validation(managed, false),
        },
      },
    ]);
    await expect(normalizeOrdersPage(off.admin, "s", null)).resolves.toEqual({
      scanned: 0,
      updated: 0,
      nextCursor: null,
    });
  });

  test("la correzione parte da 60 giorni prima", () => {
    expect(orderBackfillSince(new Date("2026-11-05T12:00:00.000Z"))).toBe(
      "2026-09-06T12:00:00.000Z",
    );
  });
});

describe("job", () => {
  const db = {} as D1Database;
  const claim = { webhookId: "wh-1", shop: "shop.myshopify.com" };
  const queue = { send: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSessionsByShop.mockResolvedValue([{ isOnline: false }]);
    mocks.claimWebhook.mockResolvedValue({ acquired: true, token: "token" });
  });

  test("un nuovo ordine corretto registra solo il conteggio", async () => {
    const { admin } = fakeAdmin([
      { data: { order: order("o"), validations: validation(managed) } },
      updated,
    ]);
    mocks.admin.mockResolvedValue({ admin });

    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" });

    expect(mocks.recordEvent).toHaveBeenCalledWith(db, {
      shopDomain: claim.shop,
      webhookId: claim.webhookId,
      name: "order_fields_normalized",
      class: "lifecycle",
      metadata: { updated_count: 1 },
    });
  });

  test("senza ID, senza sessione offline o senza scope non ritenta", async () => {
    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t" });
    expect(mocks.findSessionsByShop).not.toHaveBeenCalled();

    mocks.findSessionsByShop.mockResolvedValue([{ isOnline: true }]);
    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" });
    expect(mocks.recordEvent).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ metadata: { error_code: "missing_admin_context" } }),
    );

    mocks.findSessionsByShop.mockResolvedValue([{ isOnline: false }]);
    mocks.admin.mockResolvedValue({
      admin: fakeAdmin([{ errors: [{ extensions: { code: "ACCESS_DENIED" } }] }]).admin,
    });
    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" });
    expect(mocks.recordEvent).toHaveBeenLastCalledWith(
      db,
      expect.objectContaining({ metadata: { error_code: "order_scope_missing" } }),
    );
  });

  test("un errore transitorio torna alla coda per il retry", async () => {
    mocks.admin.mockResolvedValue({ admin: fakeAdmin([new Error("rete")]).admin });
    await expect(
      processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" }),
    ).rejects.toThrow("order_query_failed");
  });

  test("ogni pagina accoda la successiva con lo stesso inizio", async () => {
    const { admin } = fakeAdmin([
      {
        data: {
          orders: { nodes: [order("a")], pageInfo: { hasNextPage: true, endCursor: "c2" } },
          validations: validation(managed),
        },
      },
      updated,
    ]);
    mocks.admin.mockResolvedValue({ admin });
    const backfill = { since: "s", cursor: null };

    await processOrderBackfillJob(
      db,
      claim,
      { ...claim, claimToken: "t", backfill },
      queue as unknown as Queue,
    );

    expect(mocks.claimWebhook).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^order-fields-backfill:/),
      ORDER_BACKFILL_TOPIC,
      claim.shop,
    );
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ shop: claim.shop, backfill: { since: "s", cursor: "c2" } }),
    );
  });

  test("la correzione senza dati di pagina o coda fallisce, senza scope si ferma", async () => {
    await expect(
      processOrderBackfillJob(db, claim, { ...claim, claimToken: "t" }, queue as unknown as Queue),
    ).rejects.toThrow("order_backfill_unavailable");
    mocks.admin.mockResolvedValue({
      admin: fakeAdmin([new Response(null, { status: 403 })]).admin,
    });
    await processOrderBackfillJob(
      db,
      claim,
      { ...claim, claimToken: "t", backfill: { since: "s", cursor: null } },
      queue as unknown as Queue,
    );
    expect(queue.send).not.toHaveBeenCalled();
  });

  test("l'accodamento fallisce se il claim non è acquisito", async () => {
    mocks.claimWebhook.mockResolvedValue({ acquired: false, retry: true });
    await expect(enqueueOrderBackfill(db, queue as unknown as Queue, claim.shop)).rejects.toThrow(
      "order_backfill_enqueue_failed",
    );
    mocks.claimWebhook.mockResolvedValue({ acquired: true, token: "tok" });
    await enqueueOrderBackfill(db, queue as unknown as Queue, claim.shop);
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "tok",
        backfill: expect.objectContaining({ cursor: null }),
      }),
    );
  });
});
