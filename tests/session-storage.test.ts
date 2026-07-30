import { env } from "cloudflare:test";
import { Session } from "@shopify/shopify-api";
import { expect, test } from "vitest";
import { D1SessionStorage } from "../app/session-storage.server";

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
  expect((await storage.loadSession(session.id))?.toPropertyArray(true)).toEqual(
    session.toPropertyArray(true),
  );
});

test("la reinstallazione riattiva lo store ma non annulla il blocco geografico", async () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
  const storage = new D1SessionStorage(env.DB, key);
  const session = (shop: string, accessToken: string) =>
    new Session({ id: `offline_${shop}`, shop, state: "state", isOnline: false, accessToken });

  const reinstalled = "reinstall.example.myshopify.com";
  await storage.storeSession(session(reinstalled, "token-1"));
  await env.DB.prepare(
    `UPDATE shops SET installation_status = 'uninstalled', uninstalled_at = ? WHERE shop_domain = ?`,
  )
    .bind("2026-07-30T00:00:00.000Z", reinstalled)
    .run();
  await storage.storeSession(session(reinstalled, "token-2"));

  expect(
    await env.DB.prepare(
      "SELECT installation_status, uninstalled_at FROM shops WHERE shop_domain = ?",
    )
      .bind(reinstalled)
      .first(),
  ).toMatchObject({ installation_status: "active", uninstalled_at: null });

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
