import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { backupKey, decryptBackup, encryptBackup, verifySqlBackup } from "./backup-crypto.mjs";

const key = randomBytes(32).toString("base64");

test("cifra, verifica e decifra un export D1", () => {
  const sql = Buffer.from("CREATE TABLE prova (id INTEGER PRIMARY KEY);\n");
  const encrypted = encryptBackup(sql, key, Buffer.alloc(12, 7));

  assert.deepEqual(decryptBackup(encrypted, key), sql);

  const altered = Buffer.from(encrypted);
  altered[altered.length - 33] ^= 1;
  assert.throws(() => decryptBackup(altered, key), /Checksum backup non valido/);
  assert.throws(() => decryptBackup(encrypted, randomBytes(32).toString("base64")));
  assert.throws(() => encryptBackup(sql, "non-base64"), /32 byte codificati in base64/);
});

test("ruota esattamente otto slot settimanali e dodici mensili", () => {
  const weekly = new Set();
  const monthly = new Set();
  const start = Date.UTC(2026, 0, 5);

  for (let index = 0; index < 16; index += 1) {
    weekly.add(backupKey("weekly", new Date(start + index * 7 * 24 * 60 * 60 * 1000)));
  }
  for (let index = 0; index < 24; index += 1) {
    monthly.add(backupKey("monthly", new Date(Date.UTC(2026, index, 1))));
  }

  assert.equal(weekly.size, 8);
  assert.equal(monthly.size, 12);
  assert.throws(() => backupKey("daily"), /Cadenza backup non valida/);
});

test("verifica un export SQL ripristinabile", () => {
  assert.doesNotThrow(() =>
    verifySqlBackup(
      "CREATE TABLE prova (id INTEGER PRIMARY KEY); INSERT INTO prova VALUES (1);",
      ":memory:",
      ["prova"],
    ),
  );
  assert.throws(
    () => verifySqlBackup("PRAGMA defer_foreign_keys=TRUE;"),
    /Tabelle mancanti nel backup/,
  );
  assert.throws(() => verifySqlBackup("SQL non valido"));
});
