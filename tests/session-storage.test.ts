import { env } from "cloudflare:test";
import { Session } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import { expect, test, vi } from "vitest";
import {
  OFFLINE_TOKEN_REFRESH_BATCH,
  refreshExpiringOfflineSessions,
} from "../app/offline-token-refresh.server";
import { D1SessionStorage, readSessionTimings } from "../app/session-storage.server";
import { markUninstalled } from "../app/shop.server";
import { refreshOfflineSession } from "../app/shopify.server";
import { claimWebhook } from "../app/webhook-ingress.server";

test("salva la sessione cifrata e la ricarica da D1", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const storage = new D1SessionStorage(env.DB, key);
  const session = new Session({
    id: "offline_example.myshopify.com",
    shop: "example.myshopify.com",
    state: "state",
    isOnline: false,
    scope: "write_validations",
    accessToken: "secret-token",
    expires: new Date("2026-07-28T23:30:00.000Z"),
    refreshToken: "secret-refresh-token",
    refreshTokenExpires: new Date("2026-08-28T23:30:00.000Z"),
  });

  expect(await storage.storeSession(session)).toBe(true);
  expect(readSessionTimings(session)).toMatchObject({
    auth_session_encrypt: expect.any(Number),
    auth_session_store: expect.any(Number),
  });

  const row = await env.DB.prepare(
    `SELECT access_token_ciphertext, refresh_token_ciphertext,
            session_payload_ciphertext
     FROM shopify_sessions
     WHERE id = ?`,
  )
    .bind(session.id)
    .first<{
      access_token_ciphertext: string;
      refresh_token_ciphertext: string;
      session_payload_ciphertext: string;
    }>();
  expect(JSON.stringify(row)).not.toMatch(/secret-(?:token|refresh-token)/);
  expect(row?.session_payload_ciphertext).toMatch(/^v2\./);
  const loaded = await storage.loadSession(session.id);
  expect(loaded?.toPropertyArray(true)).toEqual(session.toPropertyArray(false));
  expect(readSessionTimings(loaded!)).toMatchObject({
    auth_session_lookup: expect.any(Number),
    auth_session_decrypt: expect.any(Number),
  });
});

test("non conserva i dati anagrafici dell'utente online", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
  const storage = new D1SessionStorage(env.DB, key);
  const session = new Session({
    id: "online_privacy.example.myshopify.com_123",
    shop: "privacy.example.myshopify.com",
    state: "state",
    isOnline: true,
    accessToken: "token",
    onlineAccessInfo: {
      expires_in: 3600,
      associated_user_scope: "write_validations",
      associated_user: {
        id: 123,
        first_name: "Mario",
        last_name: "Rossi",
        email: "mario@example.com",
        locale: "it",
        email_verified: true,
        account_owner: true,
        collaborator: false,
      },
    },
  });

  await storage.storeSession(session);

  const loaded = await storage.loadSession(session.id);
  expect(loaded?.onlineAccessInfo?.associated_user).toEqual({ id: 123 });
  expect(JSON.stringify(loaded)).not.toMatch(/Mario|Rossi|mario@example\.com/);
});

test("restituisce tutte le sessioni dello store", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)));
  const storage = new D1SessionStorage(env.DB, key);
  const shop = "staff.example.myshopify.com";

  for (let index = 0; index < 26; index += 1) {
    await storage.storeSession(
      new Session({
        id: `online_${shop}_${index}`,
        shop,
        state: "state",
        isOnline: true,
        accessToken: `token-${index}`,
      }),
    );
  }

  expect(await storage.findSessionsByShop(shop)).toHaveLength(26);
});

test("la reinstallazione riattiva lo store ma non annulla il blocco geografico", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
  const storage = new D1SessionStorage(env.DB, key);
  const session = (shop: string, accessToken: string) =>
    new Session({ id: `offline_${shop}`, shop, state: "state", isOnline: false, accessToken });

  const reinstalled = "reinstall.example.myshopify.com";
  await storage.storeSession(session(reinstalled, "token-1"));
  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'uninstalled', installed_at = ?, uninstalled_at = ?
     WHERE shop_domain = ?`,
  )
    .bind("2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z", reinstalled)
    .run();
  await storage.storeSession(session(reinstalled, "token-2"));

  expect(
    await env.DB.prepare(
      "SELECT installation_status, installed_at, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(reinstalled)
      .first(),
  ).toMatchObject({ installation_status: "active", uninstalled_at: null });
  expect(
    (
      await env.DB.prepare("SELECT installed_at FROM shops WHERE shop_domain = ?")
        .bind(reinstalled)
        .first<{ installed_at: string }>()
    )?.installed_at,
  ).not.toBe("2026-07-30T00:00:00.000Z");

  const blocked = "blocked.example.myshopify.com";
  await storage.storeSession(session(blocked, "token-1"));
  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'blocked_country' WHERE shop_domain = ?`,
  )
    .bind(blocked)
    .run();
  await storage.storeSession(session(blocked, "token-2"));

  expect(
    await env.DB.prepare("SELECT installation_status FROM shops WHERE shop_domain = ?")
      .bind(blocked)
      .first(),
  ).toMatchObject({ installation_status: "blocked_country" });
});

test("un rinnovo di sessione non simula una reinstallazione prima della disinstallazione", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(6)));
  const storage = new D1SessionStorage(env.DB, key);
  const shop = "claim-reinstall.example.myshopify.com";
  const session = (token: string) =>
    new Session({
      id: `offline_${shop}`,
      shop,
      state: "state",
      isOnline: false,
      accessToken: token,
    });

  await storage.storeSession(session("token-uno"));
  await env.DB.prepare("UPDATE shops SET installed_at = ? WHERE shop_domain = ?")
    .bind("2026-08-01T10:00:00.000Z", shop)
    .run();
  const claim = await claimWebhook(
    env.DB,
    "wh-claim-reinstall",
    "APP_UNINSTALLED",
    shop,
    "2026-08-01T10:01:00.000Z",
    undefined,
    "2026-08-01T10:01:00.000Z",
  );
  if (!claim.acquired || !claim.installationStartedAt) throw new Error("claim non acquisito");

  await storage.storeSession(session("token-due"));

  expect(
    await markUninstalled(env.DB, shop, claim.installationStartedAt, "wh-session-reinstall"),
  ).toBe(true);
  expect(
    await env.DB.prepare(
      "SELECT installation_status, installed_at FROM shops WHERE shop_domain = ?",
    )
      .bind(shop)
      .first(),
  ).toMatchObject({
    installation_status: "uninstalled",
    installed_at: claim.installationStartedAt,
  });
  expect(
    await env.DB.prepare(
      `SELECT session.id FROM shopify_sessions session
       JOIN shops shop ON shop.id = session.shop_id
       WHERE shop.shop_domain = ?`,
    )
      .bind(shop)
      .first(),
  ).toBeNull();
});

test("rifiuta ciphertext trapiantati tra sessioni", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)));
  const storage = new D1SessionStorage(env.DB, key);
  const makeSession = (shop: string) =>
    new Session({
      id: `offline_${shop}`,
      shop,
      state: "state",
      isOnline: false,
      accessToken: `token-${shop}`,
    });
  const source = makeSession("source.myshopify.com");
  const target = makeSession("target.myshopify.com");
  await storage.storeSession(source);
  await storage.storeSession(target);

  await env.DB.prepare(
    `UPDATE shopify_sessions
     SET access_token_ciphertext = (
       SELECT access_token_ciphertext FROM shopify_sessions WHERE id = ?
     )
     WHERE id = ?`,
  )
    .bind(source.id, target.id)
    .run();

  // Il ciphertext trapiantato non viene mai accettato; la sessione risulta assente e si rifà OAuth.
  await expect(storage.loadSession(target.id)).resolves.toBeUndefined();
  await expect(storage.findSessionsByShop(target.shop)).resolves.toEqual([]);
});

test("una chiave ruotata invalida le sessioni invece di rompere l'app", async () => {
  const session = new Session({
    id: "offline_rotazione.example.myshopify.com",
    shop: "rotazione.example.myshopify.com",
    state: "state",
    isOnline: false,
    accessToken: "token",
  });
  const before = new D1SessionStorage(
    env.DB,
    btoa(String.fromCharCode(...new Uint8Array(32).fill(1))),
  );
  await before.storeSession(session);

  const after = new D1SessionStorage(
    env.DB,
    btoa(String.fromCharCode(...new Uint8Array(32).fill(2))),
  );

  await expect(after.loadSession(session.id)).resolves.toBeUndefined();
  expect(await after.storeSession(session)).toBe(true);
  expect((await after.loadSession(session.id))?.accessToken).toBe("token");
});

test("un ciphertext con formato non valido richiede una nuova sessione", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));
  const storage = new D1SessionStorage(env.DB, key);
  const session = new Session({
    id: "offline_formato-sessione.example.myshopify.com",
    shop: "formato-sessione.example.myshopify.com",
    state: "state",
    isOnline: false,
  });
  await storage.storeSession(session);
  await env.DB.prepare("UPDATE shopify_sessions SET session_payload_ciphertext = ? WHERE id = ?")
    .bind("formato-non-valido", session.id)
    .run();

  await expect(storage.loadSession(session.id)).resolves.toBeUndefined();
});

test("gestisce sessioni assenti, senza token e tutte le operazioni di eliminazione", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(4)));
  const storage = new D1SessionStorage(env.DB, key);
  const shop = "delete-sessions.example.myshopify.com";
  const first = new Session({
    id: `offline_${shop}`,
    shop,
    state: "state",
    isOnline: false,
  });
  const second = new Session({
    id: `online_${shop}_1`,
    shop,
    state: "state",
    isOnline: true,
  });

  await expect(storage.loadSession("sessione-assente")).resolves.toBeUndefined();
  expect(await storage.storeSession(first)).toBe(true);
  expect(await storage.storeSession(second)).toBe(true);
  expect((await storage.loadSession(first.id))?.accessToken).toBeUndefined();
  expect(await storage.deleteSessions([])).toBe(true);
  expect(await storage.deleteSession(first.id)).toBe(true);
  expect(await storage.loadSession(first.id)).toBeUndefined();
  expect(await storage.deleteSessions([second.id])).toBe(true);
  expect(await storage.findSessionsByShop(shop)).toEqual([]);

  await storage.storeSession(first);
  expect(await storage.deleteSessionsByShop(shop)).toBe(true);
  expect(await storage.findSessionsByShop(shop)).toEqual([]);
});

test("rifiuta una chiave che non contiene esattamente 32 byte", async () => {
  const storage = new D1SessionStorage(env.DB, btoa("troppo-corta"));
  const session = new Session({
    id: "offline_invalid-key.myshopify.com",
    shop: "invalid-key.myshopify.com",
    state: "state",
    isOnline: false,
  });

  await expect(storage.storeSession(session)).rejects.toThrow(
    /SESSION_ENCRYPTION_KEY deve contenere 32 byte/,
  );
});

function offlineSession(
  shop: string,
  expires: string,
  refreshTokenExpires = "2026-12-01T00:00:00.000Z",
) {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: "",
    isOnline: false,
    scope: "write_validations",
    accessToken: `token-${shop}`,
    expires: new Date(expires),
    refreshToken: `refresh-${shop}`,
    refreshTokenExpires: new Date(refreshTokenExpires),
  });
}

test("rinnova in anticipo solo i token offline in scadenza degli store attivi", async () => {
  const storage = new D1SessionStorage(
    env.DB,
    btoa(String.fromCharCode(...new Uint8Array(32).fill(5))),
  );
  const now = new Date("2026-09-24T10:00:00.000Z");
  const scadenza = "refresh-scadenza.example.myshopify.com";
  const scaduto = "refresh-scaduto.example.myshopify.com";
  const lontano = "refresh-lontano.example.myshopify.com";
  const disinstallato = "refresh-disinstallato.example.myshopify.com";
  const refreshScaduto = "refresh-refresh-scaduto.example.myshopify.com";
  const abbandonato = "refresh-abbandonato.example.myshopify.com";
  await Promise.all([
    storage.storeSession(offlineSession(scadenza, "2026-09-24T10:15:00.000Z")),
    storage.storeSession(offlineSession(scaduto, "2026-09-24T08:00:00.000Z")),
    storage.storeSession(offlineSession(lontano, "2026-09-24T10:45:00.000Z")),
    storage.storeSession(offlineSession(abbandonato, "2026-09-23T09:00:00.000Z")),
    storage.storeSession(offlineSession(disinstallato, "2026-09-24T10:05:00.000Z")),
    storage.storeSession(
      offlineSession(refreshScaduto, "2026-09-24T10:05:00.000Z", "2026-09-24T09:00:00.000Z"),
    ),
  ]);
  await env.DB.prepare("UPDATE shops SET installation_status = 'uninstalled' WHERE shop_domain = ?")
    .bind(disinstallato)
    .run();
  const refreshed: string[] = [];

  await expect(
    refreshExpiringOfflineSessions(env.DB, {
      now,
      loadSession: (id) => storage.loadSession(id),
      storeSession: (session) => storage.storeSession(session),
      refresh: async (shop, refreshToken) => {
        refreshed.push(`${shop}:${refreshToken}`);
        return offlineSession(shop, "2026-09-24T11:00:00.000Z");
      },
    }),
  ).resolves.toEqual({ refreshed: 2 });

  expect(refreshed.sort()).toEqual([
    `${scadenza}:refresh-${scadenza}`,
    `${scaduto}:refresh-${scaduto}`,
  ]);
  const { results } = await env.DB.prepare(
    `SELECT shops.shop_domain, s.access_token_expires_at
       FROM shopify_sessions s JOIN shops ON shops.id = s.shop_id
      WHERE shops.shop_domain LIKE 'refresh-%' ORDER BY shops.shop_domain`,
  ).all<{ shop_domain: string; access_token_expires_at: string }>();
  expect(
    Object.fromEntries(results.map((row) => [row.shop_domain, row.access_token_expires_at])),
  ).toEqual({
    [abbandonato]: "2026-09-23T09:00:00.000Z",
    [disinstallato]: "2026-09-24T10:05:00.000Z",
    [lontano]: "2026-09-24T10:45:00.000Z",
    [refreshScaduto]: "2026-09-24T10:05:00.000Z",
    [scadenza]: "2026-09-24T11:00:00.000Z",
    [scaduto]: "2026-09-24T11:00:00.000Z",
  });
});

test("un rinnovo fallito non blocca gli altri e cede il posto alle scadenze più recenti", async () => {
  const storage = new D1SessionStorage(
    env.DB,
    btoa(String.fromCharCode(...new Uint8Array(32).fill(6))),
  );
  const now = new Date("2026-09-24T10:00:00.000Z");
  const shops = Array.from(
    { length: OFFLINE_TOKEN_REFRESH_BATCH + 1 },
    (_, index) => `rinnovo-${index}.example.myshopify.com`,
  );
  // Il primo store ha la scadenza più vecchia: resta fuori dal lotto finché ce ne sono di più urgenti.
  await Promise.all(
    shops.map((shop, index) =>
      storage.storeSession(offlineSession(shop, `2026-09-24T10:0${index}:00.000Z`)),
    ),
  );
  const attempted: string[] = [];

  await expect(
    refreshExpiringOfflineSessions(env.DB, {
      now,
      loadSession: (id) => storage.loadSession(id),
      storeSession: (session) => storage.storeSession(session),
      refresh: async (shop) => {
        attempted.push(shop);
        if (shop === shops[OFFLINE_TOKEN_REFRESH_BATCH]) throw new Error(`Shopify: ${shop}`);
        return offlineSession(shop, "2026-09-24T11:00:00.000Z");
      },
    }),
  ).rejects.toThrow(/^offline_token_refresh_failed$/);

  expect(attempted.sort()).toEqual(shops.slice(1).sort());
  expect(
    await env.DB.prepare(
      `SELECT COUNT(*) AS rinnovati FROM shopify_sessions
        WHERE id LIKE 'offline_rinnovo-%' AND access_token_expires_at = '2026-09-24T11:00:00.000Z'`,
    ).first("rinnovati"),
  ).toBe(OFFLINE_TOKEN_REFRESH_BATCH - 1);
});

test("il rinnovo usa il grant ufficiale e restituisce la sessione offline dello store", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      access_token: "token-rinnovato",
      scope: "write_validations",
      expires_in: 3600,
      refresh_token: "refresh-rinnovato",
      refresh_token_expires_in: 7_776_000,
    }),
  );
  setAbstractFetchFunc(fetcher as unknown as typeof fetch);
  try {
    const session = await refreshOfflineSession("grant-example.myshopify.com", "refresh-attuale");

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://grant-example.myshopify.com/admin/oauth/access_token");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: "synthetic-test-secret",
      refresh_token: "refresh-attuale",
      grant_type: "refresh_token",
    });
    expect(session).toMatchObject({
      id: "offline_grant-example.myshopify.com",
      shop: "grant-example.myshopify.com",
      isOnline: false,
      accessToken: "token-rinnovato",
      refreshToken: "refresh-rinnovato",
    });
    expect(session.expires?.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  } finally {
    setAbstractFetchFunc(fetch);
  }
});
