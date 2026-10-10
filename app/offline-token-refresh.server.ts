import type { Session } from "@shopify/shopify-api";
import { refreshOfflineSession, sessionStorage } from "./shopify.server";

// Il token offline scade dopo un'ora: alla prima apertura successiva `authenticate.admin` rifaceva
// il token exchange prima dell'HTML, circa 500 ms di LCP a freddo misurati da Shopify per BFS. Il
// cron lo rinnova in anticipo, oltre i cinque minuti di margine della libreria. Un rinnovo fallito
// resta fail-open: l'apertura successiva torna al token exchange.
export const OFFLINE_TOKEN_REFRESH_AHEAD_MINUTES = 20;
// Il lotto cresce entro un limite esplicito, con tre rinnovi simultanei. L'ordine per scadenza
// decrescente fa scivolare in fondo una sessione che continua a fallire, senza bloccare le altre.
export const OFFLINE_TOKEN_REFRESH_BATCH = 3;
export const OFFLINE_TOKEN_REFRESH_MAX_BATCH = 15;
// Un refresh token revocato fallirebbe a ogni esecuzione: dopo un giorno smette di riprovare, e
// la prossima apertura o la riconciliazione billing giornaliera rimettono la sessione in finestra.
export const OFFLINE_TOKEN_REFRESH_GIVE_UP_HOURS = 24;

type Options = {
  now?: Date;
  loadSession?: (id: string) => Promise<Session | undefined>;
  storeSession?: (session: Session) => Promise<boolean>;
  refresh?: (shop: string, refreshToken: string) => Promise<Session>;
};

const eligibleSessions = `FROM shopify_sessions s JOIN shops ON shops.id = s.shop_id
  WHERE s.is_online = 0 AND shops.installation_status = 'active'
    AND s.refresh_token_ciphertext IS NOT NULL AND s.access_token_expires_at IS NOT NULL
    AND datetime(s.access_token_expires_at) <= datetime(?, '+${OFFLINE_TOKEN_REFRESH_AHEAD_MINUTES} minutes')
    AND datetime(s.access_token_expires_at) > datetime(?, '-${OFFLINE_TOKEN_REFRESH_GIVE_UP_HOURS} hours')
    AND (s.refresh_token_expires_at IS NULL OR datetime(s.refresh_token_expires_at) > datetime(?))`;

export async function readOfflineTokenRefreshStatus(db: D1Database, now = new Date()) {
  const nowIso = now.toISOString();
  const row = await db
    .prepare(`SELECT COUNT(*) AS pending,
      COUNT(*) FILTER (WHERE datetime(s.access_token_expires_at) <= datetime(?)) AS expired,
      MIN(s.access_token_expires_at) AS oldest_expires_at ${eligibleSessions}`)
    .bind(nowIso, nowIso, nowIso, nowIso)
    .first<{ pending: number; expired: number; oldest_expires_at: string | null }>();
  const pending = row?.pending ?? 0;
  const cyclesRemaining = Math.max(
    1,
    Math.floor(
      ((row?.oldest_expires_at ? Date.parse(row.oldest_expires_at) : now.getTime()) -
        now.getTime()) /
        (5 * 60_000),
    ),
  );
  return {
    pending,
    expired: row?.expired ?? 0,
    oldestExpiresAt: row?.oldest_expires_at ?? null,
    // Divide l'arretrato tra i cicli prima della scadenza, senza aumentare la concorrenza.
    batchSize: Math.min(
      OFFLINE_TOKEN_REFRESH_MAX_BATCH,
      Math.max(OFFLINE_TOKEN_REFRESH_BATCH, Math.ceil(pending / cyclesRemaining)),
    ),
  };
}

export async function refreshExpiringOfflineSessions(db: D1Database, options: Options = {}) {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const status = await readOfflineTokenRefreshStatus(db, now);
  const loadSession = options.loadSession ?? ((id) => sessionStorage.loadSession(id));
  const storeSession = options.storeSession ?? ((session) => sessionStorage.storeSession(session));
  const refresh = options.refresh ?? refreshOfflineSession;

  const { results } = await db
    .prepare(
      `SELECT s.id ${eligibleSessions}
        ORDER BY s.access_token_expires_at DESC
        LIMIT ?`,
    )
    .bind(nowIso, nowIso, nowIso, status.batchSize)
    .all<{ id: string }>();

  const outcomes: PromiseSettledResult<boolean>[] = [];
  for (let offset = 0; offset < results.length; offset += OFFLINE_TOKEN_REFRESH_BATCH) {
    outcomes.push(
      ...(await Promise.allSettled(
        results.slice(offset, offset + OFFLINE_TOKEN_REFRESH_BATCH).map(async ({ id }) => {
          const session = await loadSession(id);
          if (!session?.refreshToken) return false;
          if (!(await storeSession(await refresh(session.shop, session.refreshToken)))) {
            throw new Error("offline_token_store_failed");
          }
          return true;
        }),
      )),
    );
  }
  const refreshed = outcomes.filter(
    (outcome) => outcome.status === "fulfilled" && outcome.value,
  ).length;
  if (outcomes.some((outcome) => outcome.status === "rejected")) {
    // Né il messaggio Shopify né il dominio dello store finiscono negli eventi.
    throw new Error("offline_token_refresh_failed");
  }
  return { refreshed };
}
