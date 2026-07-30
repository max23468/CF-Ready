import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import {
  acquireValidationLock,
  configHash,
  DEFAULT_CONFIG,
  findValidation,
  mutationError,
  queryContext,
  releaseValidationLockBestEffort,
  renewValidationLock,
  startValidationLockHeartbeat,
} from "../app/validation.server";

test("la configurazione scritta è accettata dalla Function", () => {
  expect(DEFAULT_CONFIG).toMatchObject({
    schemaVersion: 2,
    enabled: true,
    errorDisplay: "inline",
    entitlement: { kind: "one_time", validThrough: null },
    rules: {
      taxCode: "required_validated",
      pec: "optional_validated",
    },
  });
});

test("l'hash di configurazione ignora l'ordine dei campi ma non i valori", async () => {
  const hash = await configHash({ schemaVersion: 2, rules: { pec: "optional_validated" } });

  expect(await configHash({ rules: { pec: "optional_validated" }, schemaVersion: 2 })).toBe(hash);
  expect(await configHash({ schemaVersion: 2, rules: { pec: "unmanaged" } })).not.toBe(hash);
});

const validation = {
  id: "gid://shopify/Validation/1",
  title: "titolo modificato",
  enabled: false,
  blockOnFailure: false,
  shopifyFunction: { handle: "cf-ready-validation" },
  metafield: { jsonValue: { pocVersion: 999 } },
};

test("pagina tutte le Validation e usa il Function handle come identità", async () => {
  const cursors: unknown[] = [];
  const pages = [
    {
      data: {
        shop: { name: "CF Ready Dev", shopAddress: { countryCodeV2: "IT" } },
        validations: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "page-2" },
        },
      },
    },
    {
      data: {
        shop: { name: "CF Ready Dev", shopAddress: { countryCodeV2: "IT" } },
        validations: {
          nodes: [validation],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const data = await queryContext({
    graphql: async (_query, options) => {
      cursors.push(options?.variables?.after);
      return Response.json(pages.shift());
    },
  });

  expect(cursors).toEqual([null, "page-2"]);
  expect(findValidation(data.validations.nodes)?.id).toBe(validation.id);
});

test("interrompe la paginazione Shopify se il cursore non avanza", async () => {
  let calls = 0;
  const page = {
    data: {
      shop: { name: "CF Ready Dev", shopAddress: { countryCodeV2: "IT" } },
      validations: {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: "stalled" },
      },
    },
  };

  await expect(
    queryContext({
      graphql: async () => {
        calls += 1;
        return Response.json(page);
      },
    }),
  ).rejects.toMatchObject({ status: 502 });
  expect(calls).toBe(2);
});

test("trasforma una risposta GraphQL senza data in errore operativo", () => {
  expect(mutationError({ errors: [{ message: "errore temporaneo" }] }, "validationCreate")).toBe(
    "Operazione Shopify non riuscita.",
  );
});

test("mantiene un solo lock Validation mentre il proprietario lo rinnova", async () => {
  const now = 1_000;
  const shop = "concurrent.example.myshopify.com";
  const timestamp = "2026-07-28T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO shops (
       shop_domain, installation_status, installed_at, created_at, updated_at
     ) VALUES (?, 'active', ?, ?, ?)`,
  )
    .bind(shop, timestamp, timestamp, timestamp)
    .run();

  const locks = await Promise.all([
    acquireValidationLock(env.DB, shop, now, "request-a"),
    acquireValidationLock(env.DB, shop, now, "request-b"),
  ]);
  expect(locks.filter(Boolean)).toHaveLength(1);

  const owner = locks.find((lock): lock is string => Boolean(lock))!;
  expect(await renewValidationLock(env.DB, shop, owner, now + 40_000)).toBe(true);
  expect(await acquireValidationLock(env.DB, shop, now + 61_000, "request-c")).toBeNull();

  await releaseValidationLockBestEffort(env.DB, shop, owner);
  expect(await acquireValidationLock(env.DB, shop, now + 61_000, "request-c")).toBe("request-c");
});

test("il cleanup del lock non sovrascrive l'esito dell'operazione", async () => {
  const unavailableDb = {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          throw new Error("D1 temporaneamente non disponibile");
        },
      }),
    }),
  } as unknown as D1Database;

  await expect(
    releaseValidationLockBestEffort(unavailableDb, "cleanup.example.myshopify.com", "owner"),
  ).resolves.toBeUndefined();
});

test("il heartbeat ritenta dopo un errore D1 transitorio", async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const recoveringDb = {
    prepare: () => ({
      bind: () => ({
        first: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("D1 temporaneamente non disponibile");
          return { owner_token: "owner" };
        },
      }),
    }),
  } as unknown as D1Database;
  const heartbeat = startValidationLockHeartbeat(
    recoveringDb,
    "heartbeat.example.myshopify.com",
    "owner",
  );

  try {
    await vi.advanceTimersByTimeAsync(40_000);
    expect(attempts).toBe(2);
    expect(await heartbeat.isHeld()).toBe(true);
  } finally {
    await heartbeat.stop();
    vi.useRealTimers();
  }
});
