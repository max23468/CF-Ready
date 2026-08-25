import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchFunctionSchema,
  verifyFunctionApiVersion,
  verifyFunctionSchema,
} from "./verify-function-schema.mjs";

const schema = `
  schema { query: Query }
  directive @only(values: [String!]!) on FIELD_DEFINITION
  type Query { value: String @only(values: ["a", "b"]) }
`;

test("ignora soltanto le differenze di formattazione dello schema", () => {
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

test("blocca una differenza semantica o uno schema non valido", () => {
  assert.throws(
    () => verifyFunctionSchema(schema, schema.replace("value: String", "changed: String")),
    /differisce semanticamente/,
  );
  assert.throws(() => verifyFunctionSchema(schema, "type Query {"), /non è GraphQL valido/);
});

test("richiede la versione Function API 2026-07 nel manifest", () => {
  assert.doesNotThrow(() => verifyFunctionApiVersion('api_version = "2026-07"\n'));
  assert.throws(() => verifyFunctionApiVersion('api_version = "2026-10"\n'), /2026-07/);
  assert.throws(() => verifyFunctionApiVersion(""), /2026-07/);
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
