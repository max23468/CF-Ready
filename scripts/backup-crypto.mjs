import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const MAGIC = Buffer.from("CFRDYB01");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CHECKSUM_BYTES = 32;

export function backupKey(cadence, date = new Date()) {
  if (cadence === "weekly") {
    const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
    return `weekly/slot-${week % 8}.cfrb`;
  }
  if (cadence === "monthly") {
    const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
    return `monthly/slot-${month % 12}.cfrb`;
  }
  throw new Error("Cadenza backup non valida.");
}

export function encryptBackup(plaintext, encodedKey, iv = randomBytes(IV_BYTES)) {
  const key = decodeKey(encodedKey);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authenticated = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
  return Buffer.concat([authenticated, createHash("sha256").update(authenticated).digest()]);
}

export function decryptBackup(backup, encodedKey) {
  const minimum = MAGIC.length + IV_BYTES + TAG_BYTES + CHECKSUM_BYTES;
  if (backup.length < minimum || !backup.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Formato backup non valido.");
  }
  const authenticated = backup.subarray(0, -CHECKSUM_BYTES);
  const checksum = backup.subarray(-CHECKSUM_BYTES);
  if (!createHash("sha256").update(authenticated).digest().equals(checksum)) {
    throw new Error("Checksum backup non valido.");
  }
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    authenticated.subarray(ivStart, tagStart),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(authenticated.subarray(tagStart, ciphertextStart));
  return Buffer.concat([
    decipher.update(authenticated.subarray(ciphertextStart)),
    decipher.final(),
  ]);
}

export function verifySqlBackup(sql, databasePath = ":memory:") {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(sql.toString());
    const result = database.prepare("PRAGMA integrity_check").get();
    if (result?.integrity_check !== "ok") throw new Error("Integrity check del backup fallito.");
  } finally {
    database.close();
  }
}

function decodeKey(encodedKey) {
  const key = Buffer.from(encodedKey ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("D1_BACKUP_KEY deve contenere 32 byte codificati in base64.");
  }
  return key;
}

async function main([command, input, output]) {
  if (command === "check-key") {
    decodeKey(process.env.D1_BACKUP_KEY);
    return;
  }
  if (command === "key") {
    process.stdout.write(backupKey(input));
    return;
  }
  if (!input || !output) {
    throw new Error("Uso: backup-crypto.mjs check-key|key|encrypt|decrypt|verify [input] [output]");
  }
  const source = await readFile(input);
  if (command === "verify") {
    verifySqlBackup(source, output);
    return;
  }
  await writeFile(
    output,
    command === "encrypt"
      ? encryptBackup(source, process.env.D1_BACKUP_KEY)
      : command === "decrypt"
        ? decryptBackup(source, process.env.D1_BACKUP_KEY)
        : (() => {
            throw new Error("Comando backup non valido.");
          })(),
  );
}

if (import.meta.main) await main(process.argv.slice(2));
