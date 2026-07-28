import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";

type Property = [string, string | number | boolean];

type StoredSession = {
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  session_payload_ciphertext: string;
};

export class D1SessionStorage implements SessionStorage {
  private key?: Promise<CryptoKey>;

  constructor(
    private readonly db: D1Database,
    private readonly encryptionKey: string,
  ) {}

  async storeSession(session: Session): Promise<boolean> {
    const properties = session.toPropertyArray(true);
    const accessToken = take(properties, "accessToken");
    const refreshToken = take(properties, "refreshToken");
    const now = new Date().toISOString();

    const [payload, accessTokenCiphertext, refreshTokenCiphertext] = await Promise.all([
      this.encrypt(JSON.stringify(properties)),
      accessToken === undefined ? null : this.encrypt(String(accessToken)),
      refreshToken === undefined ? null : this.encrypt(String(refreshToken)),
    ]);

    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO shops (
             shop_domain, installation_status, installed_at, created_at, updated_at
           ) VALUES (?, 'active', ?, ?, ?)
           ON CONFLICT(shop_domain) DO UPDATE SET
             installation_status = 'active',
             uninstalled_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .bind(session.shop, now, now, now),
      this.db
        .prepare(
          `INSERT INTO shopify_sessions (
             id, shop_id, is_online, scope, access_token_ciphertext,
             refresh_token_ciphertext, access_token_expires_at,
             refresh_token_expires_at, online_user_id,
             session_payload_ciphertext, created_at, updated_at
           ) VALUES (
             ?, (SELECT id FROM shops WHERE shop_domain = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           )
           ON CONFLICT(id) DO UPDATE SET
             shop_id = excluded.shop_id,
             is_online = excluded.is_online,
             scope = excluded.scope,
             access_token_ciphertext = excluded.access_token_ciphertext,
             refresh_token_ciphertext = excluded.refresh_token_ciphertext,
             access_token_expires_at = excluded.access_token_expires_at,
             refresh_token_expires_at = excluded.refresh_token_expires_at,
             online_user_id = excluded.online_user_id,
             session_payload_ciphertext = excluded.session_payload_ciphertext,
             updated_at = excluded.updated_at`,
        )
        .bind(
          session.id,
          session.shop,
          Number(session.isOnline),
          session.scope ?? null,
          accessTokenCiphertext,
          refreshTokenCiphertext,
          session.expires?.toISOString() ?? null,
          session.refreshTokenExpires?.toISOString() ?? null,
          session.onlineAccessInfo?.associated_user.id?.toString() ?? null,
          payload,
          now,
          now,
        ),
    ]);

    return results.every((result) => result.success);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await this.db
      .prepare(
        `SELECT access_token_ciphertext, refresh_token_ciphertext,
                session_payload_ciphertext
         FROM shopify_sessions
         WHERE id = ?`,
      )
      .bind(id)
      .first<StoredSession>();

    return row ? this.deserialize(row) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM shopify_sessions WHERE id = ?")
      .bind(id)
      .run();
    return result.success;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;

    const results = await this.db.batch(
      ids.map((id) => this.db.prepare("DELETE FROM shopify_sessions WHERE id = ?").bind(id)),
    );
    return results.every((result) => result.success);
  }

  async deleteSessionsByShop(shop: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM shopify_sessions
         WHERE shop_id = (SELECT id FROM shops WHERE shop_domain = ?)`,
      )
      .bind(shop)
      .run();
    return result.success;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { results } = await this.db
      .prepare(
        `SELECT s.access_token_ciphertext, s.refresh_token_ciphertext,
                s.session_payload_ciphertext
         FROM shopify_sessions s
         JOIN shops ON shops.id = s.shop_id
         WHERE shops.shop_domain = ?
         ORDER BY s.updated_at DESC
         LIMIT 25`,
      )
      .bind(shop)
      .all<StoredSession>();

    return Promise.all(results.map((row) => this.deserialize(row)));
  }

  private async deserialize(row: StoredSession): Promise<Session> {
    const properties = parseProperties(await this.decrypt(row.session_payload_ciphertext));

    if (row.access_token_ciphertext) {
      properties.push(["accessToken", await this.decrypt(row.access_token_ciphertext)]);
    }
    if (row.refresh_token_ciphertext) {
      properties.push(["refreshToken", await this.decrypt(row.refresh_token_ciphertext)]);
    }

    return Session.fromPropertyArray(properties, true);
  }

  private async encrypt(value: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await this.cryptoKey(),
      new TextEncoder().encode(value),
    );
    return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
  }

  private async decrypt(value: string): Promise<string> {
    const [version, encodedIv, encodedCiphertext] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedCiphertext) {
      throw new Error("Formato della sessione cifrata non valido");
    }

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encodedIv) },
      await this.cryptoKey(),
      fromBase64(encodedCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  }

  private cryptoKey(): Promise<CryptoKey> {
    if (!this.key) {
      const raw = fromBase64(this.encryptionKey);
      if (raw.byteLength !== 32) {
        throw new Error("SESSION_ENCRYPTION_KEY deve contenere 32 byte codificati in base64");
      }
      this.key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    return this.key;
  }
}

function take(properties: Property[], name: string) {
  const index = properties.findIndex(([key]) => key === name);
  return index === -1 ? undefined : properties.splice(index, 1)[0][1];
}

function parseProperties(value: string): Property[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        ["string", "number", "boolean"].includes(typeof entry[1]),
    )
  ) {
    throw new Error("Payload della sessione non valido");
  }
  return parsed as Property[];
}

function toBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
