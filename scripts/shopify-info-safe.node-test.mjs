import assert from "node:assert/strict";
import { test } from "node:test";

import {
  verifyAuthenticatedVersionsResult,
  verifyShopifyInfoResult,
} from "./shopify-info-safe.mjs";

const config = `
client_id = "client-id-dev"
name = "CF Ready Development"
[access_scopes]
scopes = "write_validations"
`;

const completeOutput = `
│ CURRENT APP CONFIGURATION │
│ Configuration file  shopify.app.dev.toml │
│ App name            CF Ready Development │
│ Client ID           client-id-dev │
│ Access scopes       write_validations │
`;

test("accetta l'uscita non zero soltanto dopo un'identità Shopify completa", () => {
  assert.equal(
    verifyShopifyInfoResult({
      config,
      configName: "shopify.app.dev.toml",
      output: completeOutput,
      status: 1,
    }),
    true,
  );
  assert.throws(
    () =>
      verifyShopifyInfoResult({
        config,
        configName: "shopify.app.dev.toml",
        output: completeOutput.replace("client-id-dev", "client-id-errato"),
        status: 1,
      }),
    /identità configurata/,
  );
  assert.throws(
    () =>
      verifyShopifyInfoResult({
        config,
        configName: "shopify.app.dev.toml",
        output: "Shopify non disponibile",
        status: 1,
      }),
    /identità configurata/,
  );
  assert.throws(
    () =>
      verifyShopifyInfoResult({
        config,
        configName: "shopify.app.dev.toml",
        output: completeOutput,
        status: null,
      }),
    /non ha completato/,
  );
});

test("mantiene compatibile l'uscita zero della CLI", () => {
  assert.equal(
    verifyShopifyInfoResult({
      config,
      configName: "shopify.app.dev.toml",
      output: "",
      status: 0,
    }),
    false,
  );
});

test("il percorso degradato richiede un readback remoto autenticato", () => {
  assert.doesNotThrow(() => verifyAuthenticatedVersionsResult({ output: "[]", status: 0 }));
  assert.throws(
    () => verifyAuthenticatedVersionsResult({ output: "[]", status: 1 }),
    /accesso remoto/,
  );
  assert.throws(
    () => verifyAuthenticatedVersionsResult({ output: "errore", status: 0 }),
    /readback remoto non valido/,
  );
  assert.throws(
    () => verifyAuthenticatedVersionsResult({ output: "{}", status: 0 }),
    /readback remoto non valido/,
  );
});
