import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findExpiringSoon, readExpiryRegistry, WARNING_DAYS } from "./credential-expiry.mjs";

const inventory = readFileSync(
  new URL("../docs/runbooks/secret-inventory.md", import.meta.url),
  "utf8",
);

test("legge le scadenze registrate nell'inventario del repository", () => {
  const { expiries, missing } = readExpiryRegistry(inventory);
  assert.ok(expiries.length > 0, "l'inventario deve registrare almeno una scadenza");
  const shopify = expiries.find(({ name }) => name === "SHOPIFY_APP_AUTOMATION_TOKEN");
  assert.ok(shopify, "la scadenza del token Shopify Production deve essere registrata");
  assert.equal(shopify.date, Date.UTC(2027, 1, 4));
  assert.equal(
    expiries.find(({ environment }) => environment === "Development")?.date,
    Date.UTC(2027, 0, 28),
  );
  assert.deepEqual(missing, []);
});

test("segnala le righe senza una scadenza valida", () => {
  const table = [
    "| Credenziale | Ambiente | Scade | Cosa fare |",
    "| --- | --- | --- | --- |",
    "| `SENZA_DATA` | CI | da verificare | leggerla dal dashboard |",
    "| `MESE_IGNOTO` | CI | **4 brumaio 2027** | niente |",
    "| `BUONA` | CI Production | **4 febbraio 2027** | rigenerare |",
  ].join("\n");
  const { expiries, missing } = readExpiryRegistry(table);
  assert.deepEqual(
    expiries.map(({ name }) => name),
    ["BUONA"],
  );
  assert.deepEqual(
    missing.map(({ name }) => name),
    ["SENZA_DATA", "MESE_IGNOTO"],
  );
});

test("avvisa solo entro la soglia, e con i giorni che mancano davvero", () => {
  const { expiries } = readExpiryRegistry(
    "| `TOKEN` | CI Production | **4 febbraio 2027** | rigenerare |",
  );

  assert.deepEqual(findExpiringSoon(expiries, "2026-08-04"), []);

  const [warned] = findExpiringSoon(expiries, "2027-01-05");
  assert.equal(warned.days, 30);
  assert.equal(warned.environment, "CI Production");

  // Una credenziale già scaduta resta segnalata, con i giorni negativi.
  const [expired] = findExpiringSoon(expiries, "2027-03-01");
  assert.equal(expired.days, -25);
});

test("la soglia copre almeno un giro della manutenzione mensile", () => {
  assert.ok(WARNING_DAYS >= 31);
});
