const UPDATE_CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

export async function claimOwnerControlUpdate(
  db: D1Database,
  updateId: number,
  kind: "message" | "callback_query",
  now = new Date(),
  token: string = crypto.randomUUID(),
) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - UPDATE_CLAIM_TIMEOUT_MS).toISOString();
  const claim = await db
    .prepare(
      `INSERT INTO owner_control_updates (
         update_id, update_kind, status, attempts, claim_token, received_at, updated_at
       ) VALUES (?, ?, 'processing', 1, ?, ?, ?)
       ON CONFLICT(update_id) DO UPDATE SET
         status = 'processing', attempts = owner_control_updates.attempts + 1,
         claim_token = excluded.claim_token, processed_at = NULL,
         last_error_code = NULL, updated_at = excluded.updated_at
       WHERE owner_control_updates.status = 'failed'
          OR (owner_control_updates.status = 'processing'
              AND owner_control_updates.updated_at <= ?)
       RETURNING claim_token`,
    )
    .bind(updateId, kind, token, nowIso, nowIso, staleBefore)
    .first<{ claim_token: string }>();
  if (claim) return { acquired: true as const, token: claim.claim_token };

  const existing = await db
    .prepare("SELECT status FROM owner_control_updates WHERE update_id = ?")
    .bind(updateId)
    .first<{ status: "processing" | "processed" | "failed" }>();
  return { acquired: false as const, retry: existing?.status !== "processed" };
}

export async function finishOwnerControlUpdate(
  db: D1Database,
  updateId: number,
  token: string,
  status: "processed" | "failed",
  errorCode: string | null = null,
) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE owner_control_updates
       SET status = ?, processed_at = ?, claim_token = NULL,
           last_error_code = ?, updated_at = ?
       WHERE update_id = ? AND status = 'processing' AND claim_token = ?
       RETURNING update_id`,
    )
    .bind(status, now, errorCode, now, updateId, token)
    .first<{ update_id: number }>();
  return result !== null;
}

export async function renewOwnerControlClaim(
  db: D1Database,
  updateId: number,
  token: string,
  now = new Date().toISOString(),
) {
  const renewed = await db
    .prepare(
      `UPDATE owner_control_updates SET updated_at = ?
       WHERE update_id = ? AND status = 'processing' AND claim_token = ?
       RETURNING update_id`,
    )
    .bind(now, updateId, token)
    .first<{ update_id: number }>();
  return renewed !== null;
}

export async function readOwnerControlState<T>(db: D1Database, key: string) {
  const row = await db
    .prepare("SELECT state_value, updated_at FROM owner_control_state WHERE state_key = ?")
    .bind(key)
    .first<{ state_value: string; updated_at: string }>();
  if (!row) return null;
  try {
    return { value: JSON.parse(row.state_value) as T, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export function writeOwnerControlState(
  db: D1Database,
  key: string,
  value: unknown,
  now = new Date(),
) {
  return db
    .prepare(
      `INSERT INTO owner_control_state (state_key, state_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         state_value = excluded.state_value, updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(value), now.toISOString())
    .run();
}

export function ownerControlErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message) ? message : "owner_control_failed";
}
