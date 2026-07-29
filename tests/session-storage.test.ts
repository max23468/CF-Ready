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

  await expect(storage.loadSession(target.id)).rejects.toThrow();
});
