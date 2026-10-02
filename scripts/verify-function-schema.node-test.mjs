import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  fetchFunctionSchema,
  functionSchemaConfigArgs,
  verifyFunctionApiVersion,
  verifyFunctionSchema,
} from "./verify-function-schema.mjs";

const schema = `
  schema { query: Query }
  directive @only(values: [String!]!) on FIELD_DEFINITION
  type Query { value: String @only(values: ["a", "b"]) }
`;

test("il comando verifica lo schema e segnala un cambiamento semantico", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-schema-cli-"));
  try {
    writeFileSync(
      join(directory, "shopify"),
      `#!${process.execPath}
import { readFileSync } from "node:fs";
const schema = readFileSync("schema.graphql", "utf8");
process.stdout.write(process.env.SCHEMA_TEST_CHANGED ? schema.replace("enum CurrencyCode {", "enum CurrencyCode { TEST_CHANGED") : schema);
`,
      { mode: 0o755 },
    );
    const command = new URL("./verify-function-schema.mjs", import.meta.url);
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}` };
    const verified = spawnSync(process.execPath, [command.pathname], { env, encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /Schema Function API 2026-10 verificato/);
    const changed = spawnSync(process.execPath, [command.pathname], {
      env: { ...env, SCHEMA_TEST_CHANGED: "1" },
      encoding: "utf8",
    });
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /differisce semanticamente/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ignora le differenze di formattazione dello schema", () => {
  const formatted = `schema { query: Query }
directive @only(values: [String!]!) on FIELD_DEFINITION
type Query {
  value: String
    @only(values: ["a", "b"])
}
`;

  assert.doesNotThrow(() => verifyFunctionSchema(schema, formatted));
});

test("ignora l'ordine degli elementi SDL semanticamente equivalenti", () => {
  const ordered = `
    schema { query: Query }
    directive @only(label: String, values: [String!]!) on FIELD_DEFINITION | ARGUMENT_DEFINITION
    input Filter { code: String, active: Boolean }
    enum Status { ACTIVE INACTIVE }
    union Result = Match | Miss
    type Match { value: String }
    type Miss { reason: String }
    type Query {
      search(filter: Filter, limit: Int): Result @only(label: "x", values: ["a", "b"])
      status: Status
    }
  `;
  const reordered = `
    type Query {
      status: Status
      search(limit: Int, filter: Filter): Result @only(values: ["a", "b"], label: "x")
    }
    union Result = Miss | Match
    type Miss { reason: String }
    enum Status { INACTIVE ACTIVE }
    input Filter { active: Boolean, code: String }
    directive @only(values: [String!]!, label: String) on ARGUMENT_DEFINITION | FIELD_DEFINITION
    type Match { value: String }
    schema { query: Query }
  `;

  assert.doesNotThrow(() => verifyFunctionSchema(ordered, reordered));
});

test("ignora descrizioni e annotazioni deprecated senza nascondere cambiamenti al contratto", () => {
  const original = `
    "Old query description"
    type Query { currency(code: CurrencyCode = ANG): CurrencyCode }
    enum CurrencyCode { ANG XCG }
  `;
  const updated = `
    "New query description"
    type Query {
      "New field description"
      currency("Currency argument" code: CurrencyCode = ANG @deprecated(reason: "Old argument")): CurrencyCode
        @deprecated(reason: "Old field")
    }
    enum CurrencyCode {
      "Netherlands Antillean Guilder."
      ANG @deprecated(reason: "Use XCG instead.")
      XCG
    }
  `;

  assert.doesNotThrow(() => verifyFunctionSchema(original, updated));
  assert.doesNotThrow(() => verifyFunctionSchema(updated, original));
  for (const changed of [
    updated.replace("ANG @deprecated", "REMOVED @deprecated"),
    updated.replace("= ANG", "= XCG"),
    updated.replace("): CurrencyCode", "): CurrencyCode!"),
    updated.replace("      XCG", "      XCG USD"),
  ]) {
    assert.throws(() => verifyFunctionSchema(original, changed), /differisce semanticamente/);
  }
  for (const values of ['["b", "a"]', '["a", "c"]']) {
    assert.throws(
      () => verifyFunctionSchema(schema, schema.replace('["a", "b"]', values)),
      /differisce semanticamente/,
    );
  }
});

test("blocca una differenza semantica o uno schema non valido", () => {
  assert.throws(
    () => verifyFunctionSchema(schema, schema.replace("value: String", "changed: String")),
    /differisce semanticamente/,
  );
  assert.throws(() => verifyFunctionSchema(schema, "type Query {"), /non è GraphQL valido/);
});

test("richiede la versione Function API 2026-10 nel manifest", () => {
  assert.doesNotThrow(() => verifyFunctionApiVersion('api_version = "2026-10"\n'));
  assert.throws(() => verifyFunctionApiVersion('api_version = "2026-07"\n'), /2026-10/);
  assert.throws(() => verifyFunctionApiVersion(""), /2026-10/);
});

test("interroga la CLI dalla directory della Function senza scrivere lo schema", () => {
  let invocation;
  const output = fetchFunctionSchema({
    cwd: "/repo/extensions/function",
    spawn: (command, args, options) => {
      invocation = { command, args, options };
      return { status: 0, stdout: schema };
    },
  });

  assert.equal(output, schema);
  assert.equal(invocation.command, "shopify");
  assert.deepEqual(invocation.args, [
    "app",
    "function",
    "schema",
    "--config",
    "dev",
    "--stdout",
    "--no-color",
  ]);
  assert.equal(invocation.options.cwd, "/repo/extensions/function");
});

test("usa la configurazione Shopify corretta per ambiente", () => {
  assert.deepEqual(functionSchemaConfigArgs("dev"), ["--config", "dev"]);
  assert.deepEqual(functionSchemaConfigArgs("production"), []);
  assert.throws(() => functionSchemaConfigArgs("staging"), /dev o production/);

  let args;
  fetchFunctionSchema({
    config: "production",
    spawn: (_command, invocationArgs) => {
      args = invocationArgs;
      return { status: 0, stdout: schema };
    },
  });
  assert.deepEqual(args, ["app", "function", "schema", "--stdout", "--no-color"]);
});

test("non accetta un fallimento o un'uscita vuota della CLI", () => {
  assert.throws(
    () => fetchFunctionSchema({ spawn: () => ({ status: 1, stdout: "" }) }),
    /non ha restituito/,
  );
  assert.throws(
    () => fetchFunctionSchema({ spawn: () => ({ status: 0, stdout: "" }) }),
    /non ha restituito/,
  );
});
