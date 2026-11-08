import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOfflineSession: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("../app/shopify.server", () => ({
  findOfflineSession: mocks.findOfflineSession,
  unauthenticated: { admin: mocks.admin },
}));

import type { Rules } from "../app/config";
import { d1WithFault } from "./support/d1-fault";
import { insertShop } from "./support/lifecycle";
import { eventsOfWebhook } from "./support/merchant";
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

  test("non scrive ordini con Validation duplicate", async () => {
    const nodes = validation(managed).nodes;
    const { admin, calls } = fakeAdmin([
      { data: { order: order("o"), validations: { nodes: [...nodes, ...nodes] } } },
    ]);

    await expect(normalizeOrder(admin, "o")).rejects.toThrow("duplicate_validations");
    expect(calls).toHaveLength(1);
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
  const db = env.DB;
  const queue = { send: vi.fn() };
  let claim: { webhookId: string; shop: string };

  // Un evento vale una sola volta per webhook: ogni scenario ha la propria consegna.
  const delivery = () => ({ webhookId: `wh-${crypto.randomUUID()}`, shop: claim.shop });
  const skipped = (error_code: string) => [
    { name: "order_fields_skipped", class: "lifecycle", metadata: { error_code } },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.findOfflineSession.mockResolvedValue({ isOnline: false });
    claim = {
      webhookId: `wh-${crypto.randomUUID()}`,
      shop: await insertShop(`ordini-${crypto.randomUUID()}.myshopify.com`),
    };
  });

  test("un nuovo ordine corretto registra solo il conteggio", async () => {
    const { admin } = fakeAdmin([
      { data: { order: order("o"), validations: validation(managed) } },
      updated,
    ]);
    mocks.admin.mockResolvedValue({ admin });

    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" });

    expect(await eventsOfWebhook(claim.webhookId)).toEqual([
      { name: "order_fields_normalized", class: "lifecycle", metadata: { updated_count: 1 } },
    ]);
  });

  test("senza ID, senza sessione offline o senza scope non ritenta", async () => {
    await processOrderCreatedJob(db, claim, { ...claim, claimToken: "t" });
    expect(mocks.findOfflineSession).not.toHaveBeenCalled();
    expect(await eventsOfWebhook(claim.webhookId)).toEqual([]);

    const withoutSession = delivery();
    mocks.findOfflineSession.mockResolvedValue(undefined);
    await processOrderCreatedJob(db, withoutSession, {
      ...withoutSession,
      claimToken: "t",
      orderId: "o",
    });
    expect(await eventsOfWebhook(withoutSession.webhookId)).toEqual(
      skipped("missing_admin_context"),
    );

    const withoutScope = delivery();
    mocks.findOfflineSession.mockResolvedValue({ isOnline: false });
    mocks.admin.mockResolvedValue({
      admin: fakeAdmin([{ errors: [{ extensions: { code: "ACCESS_DENIED" } }] }]).admin,
    });
    await processOrderCreatedJob(db, withoutScope, {
      ...withoutScope,
      claimToken: "t",
      orderId: "o",
    });
    expect(await eventsOfWebhook(withoutScope.webhookId)).toEqual(skipped("order_scope_missing"));

    const withDuplicates = delivery();
    const nodes = validation(managed).nodes;
    mocks.admin.mockResolvedValue({
      admin: fakeAdmin([
        { data: { order: order("o"), validations: { nodes: [...nodes, ...nodes] } } },
      ]).admin,
    });
    await processOrderCreatedJob(db, withDuplicates, {
      ...withDuplicates,
      claimToken: "t",
      orderId: "o",
    });
    expect(await eventsOfWebhook(withDuplicates.webhookId)).toEqual(
      skipped("duplicate_validations"),
    );
  });

  test("un errore transitorio torna alla coda per il retry", async () => {
    mocks.admin.mockResolvedValue({ admin: fakeAdmin([new Error("rete")]).admin });
    await expect(
      processOrderCreatedJob(db, claim, { ...claim, claimToken: "t", orderId: "o" }),
    ).rejects.toThrow("order_query_failed");
    expect(await eventsOfWebhook(claim.webhookId)).toEqual([]);
  });

  async function storedClaim(webhookId: string) {
    return env.DB.prepare(
      "SELECT topic, shop_domain, status, claim_token FROM webhook_events WHERE webhook_id = ?",
    )
      .bind(webhookId)
      .first();
  }

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

    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: expect.stringMatching(/^order-fields-backfill:/),
        shop: claim.shop,
        backfill: { since: "s", cursor: "c2" },
      }),
    );
    const [job] = queue.send.mock.calls[0];
    expect(await storedClaim(job.webhookId)).toEqual({
      topic: ORDER_BACKFILL_TOPIC,
      shop_domain: claim.shop,
      status: "processing",
      claim_token: job.claimToken,
    });
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
    const { db: unclaimable } = d1WithFault(db, {
      sql: "INSERT INTO webhook_events",
      first: () => null,
    });
    await expect(
      enqueueOrderBackfill(unclaimable, queue as unknown as Queue, claim.shop),
    ).rejects.toThrow("order_backfill_enqueue_failed");
    expect(queue.send).not.toHaveBeenCalled();

    await enqueueOrderBackfill(db, queue as unknown as Queue, claim.shop);
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        backfill: expect.objectContaining({ cursor: null }),
      }),
    );
    const [job] = queue.send.mock.calls[0];
    expect(await storedClaim(job.webhookId)).toMatchObject({ claim_token: job.claimToken });
  });

  test("un invio fallito chiude la riga come fallita e lascia traccia", async () => {
    queue.send.mockRejectedValueOnce(new Error("coda"));

    await expect(enqueueOrderBackfill(db, queue as unknown as Queue, claim.shop)).rejects.toThrow(
      "order_backfill_enqueue_failed",
    );

    const [job] = queue.send.mock.calls.at(-1)!;
    expect(await storedClaim(job.webhookId)).toMatchObject({ status: "failed" });
    expect(await eventsOfWebhook(job.webhookId)).toEqual([
      expect.objectContaining({ name: "webhook_failed" }),
    ]);
  });
});

describe("sottoscrizione orders/create", async () => {
  const { ensureOrderWebhook, orderWebhookUri, removeOrderWebhooks } =
    await import("../app/order-normalization/subscription.server");
  const origin = "https://app.example.test";
  const listed = (ids: string[]) => ({
    data: { webhookSubscriptions: { nodes: ids.map((id) => ({ id })) } },
  });

  test("crea la sottoscrizione solo se manca, con il solo ID dell'ordine", async () => {
    expect(orderWebhookUri(origin)).toBe("https://app.example.test/webhooks/orders/create");
    const existing = fakeAdmin([listed(["w1"])]);
    await ensureOrderWebhook(existing.admin, origin);
    expect(existing.calls).toHaveLength(1);

    const created = fakeAdmin([
      listed([]),
      {
        data: { webhookSubscriptionCreate: { webhookSubscription: { id: "w2" }, userErrors: [] } },
      },
    ]);
    await ensureOrderWebhook(created.admin, origin);
    expect(created.calls[1].query).toContain('includeFields: ["admin_graphql_api_id"]');
    expect(created.calls[1].variables).toEqual({ uri: orderWebhookUri(origin) });
  });

  test("errori Shopify e userErrors diventano order_webhook_failed", async () => {
    for (const responses of [
      [new Error("rete")],
      [{ errors: [{}] }],
      [
        listed([]),
        {
          data: {
            webhookSubscriptionCreate: {
              webhookSubscription: null,
              userErrors: [{ message: "x" }],
            },
          },
        },
      ],
    ]) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await expect(ensureOrderWebhook(fakeAdmin(responses).admin, origin)).rejects.toThrow(
        "order_webhook_failed",
      );
    }
  });

  test("allo spegnimento rimuove ogni sottoscrizione dell'app", async () => {
    const { admin, calls } = fakeAdmin([
      listed(["w1", "w2"]),
      { data: { webhookSubscriptionDelete: { userErrors: [] } } },
      { data: { webhookSubscriptionDelete: { userErrors: [] } } },
    ]);
    await removeOrderWebhooks(admin, origin);
    expect(calls.slice(1).map(({ variables }) => variables)).toEqual([{ id: "w1" }, { id: "w2" }]);
  });
});
