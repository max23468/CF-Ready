const VALIDATION_LOCK_TTL_MS = 60_000;
const VALIDATION_LOCK_RENEWAL_MS = 20_000;

export async function withValidationLock<T>(
  db: D1Database,
  shopDomain: string,
  operation: (heartbeat: ReturnType<typeof startValidationLockHeartbeat>) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const lockToken = await acquireValidationLock(db, shopDomain);
  if (!lockToken) return { acquired: false };
  const heartbeat = startValidationLockHeartbeat(db, shopDomain, lockToken);

  try {
    if (!(await heartbeat.isHeld())) return { acquired: false };
    return { acquired: true, result: await operation(heartbeat) };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, shopDomain, lockToken);
  }
}

export async function acquireValidationLock(
  db: D1Database,
  shopDomain: string,
  now = Date.now(),
  ownerToken: string = crypto.randomUUID(),
) {
  const lock = await db
    .prepare(
      `INSERT INTO validation_operation_locks (shop_domain, owner_token, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT (shop_domain) DO UPDATE SET
         owner_token = excluded.owner_token,
         expires_at = excluded.expires_at
       WHERE validation_operation_locks.expires_at <= ?
       RETURNING owner_token`,
    )
    .bind(shopDomain, ownerToken, now + VALIDATION_LOCK_TTL_MS, now)
    .first<{ owner_token: string }>();
  return lock?.owner_token === ownerToken ? ownerToken : null;
}

export async function renewValidationLock(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
  now = Date.now(),
) {
  const lock = await db
    .prepare(
      `UPDATE validation_operation_locks
       SET expires_at = ?
       WHERE shop_domain = ? AND owner_token = ? AND expires_at > ?
       RETURNING owner_token`,
    )
    .bind(now + VALIDATION_LOCK_TTL_MS, shopDomain, ownerToken, now)
    .first<{ owner_token: string }>();
  return lock?.owner_token === ownerToken;
}

export function startValidationLockHeartbeat(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
) {
  let stopped = false;
  let renewal = Promise.resolve(true);
  const timer = setInterval(() => {
    renewal = renewal
      .catch(() => false)
      .then(() => (stopped ? true : renewValidationLock(db, shopDomain, ownerToken)));
    void renewal.catch(() => undefined);
  }, VALIDATION_LOCK_RENEWAL_MS);

  return {
    async isHeld() {
      return renewal.catch(() => false);
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await renewal.catch(() => undefined);
    },
  };
}

export async function releaseValidationLockBestEffort(
  db: D1Database,
  shopDomain: string,
  ownerToken: string,
) {
  try {
    await db
      .prepare(
        `DELETE FROM validation_operation_locks
         WHERE shop_domain = ? AND owner_token = ?`,
      )
      .bind(shopDomain, ownerToken)
      .run();
  } catch {
    // La lease scade comunque; Shopify resta autorevole sull'esito.
  }
}
