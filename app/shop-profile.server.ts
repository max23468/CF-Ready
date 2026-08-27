const MAX_STORE_DISPLAY_NAME_LENGTH = 120;

export function safeStoreDisplayName(value: string | null | undefined) {
  if (!value) return null;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, MAX_STORE_DISPLAY_NAME_LENGTH) : null;
}

export async function persistShopDisplayName(
  db: D1Database,
  shopDomain: string,
  value: string | null | undefined,
) {
  const displayName = safeStoreDisplayName(value);
  if (!displayName) return null;
  await db
    .prepare("UPDATE shops SET display_name = ?, updated_at = ? WHERE shop_domain = ?")
    .bind(displayName, new Date().toISOString(), shopDomain)
    .run();
  return displayName;
}
