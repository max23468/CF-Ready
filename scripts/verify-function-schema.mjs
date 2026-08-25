import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Kind, parse, print, visit } from "graphql";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionRoot = join(root, "extensions", "cf-ready-validation");
const schemaPath = join(functionRoot, "schema.graphql");
const manifestPath = join(functionRoot, "shopify.extension.toml");

function canonicalSchema(schema, label) {
  try {
    const ast = visit(parse(schema), {
      leave(node) {
        const byName = (values) =>
          values
            ? [...values].sort((left, right) => left.name.value.localeCompare(right.name.value))
            : values;
        const byValue = (values) =>
          values
            ? [...values].sort((left, right) => left.value.localeCompare(right.value))
            : values;

        switch (node.kind) {
          case Kind.DOCUMENT:
            return {
              ...node,
              definitions: [...node.definitions].sort((left, right) =>
                print(left).localeCompare(print(right)),
              ),
            };
          case Kind.SCHEMA_DEFINITION:
          case Kind.SCHEMA_EXTENSION:
            return {
              ...node,
              operationTypes: [...node.operationTypes].sort((left, right) =>
                left.operation.localeCompare(right.operation),
              ),
            };
          case Kind.OBJECT_TYPE_DEFINITION:
          case Kind.OBJECT_TYPE_EXTENSION:
          case Kind.INTERFACE_TYPE_DEFINITION:
          case Kind.INTERFACE_TYPE_EXTENSION:
            return {
              ...node,
              interfaces: byName(node.interfaces),
              fields: byName(node.fields),
            };
          case Kind.UNION_TYPE_DEFINITION:
          case Kind.UNION_TYPE_EXTENSION:
            return { ...node, types: byName(node.types) };
          case Kind.ENUM_TYPE_DEFINITION:
          case Kind.ENUM_TYPE_EXTENSION:
            return { ...node, values: byName(node.values) };
          case Kind.INPUT_OBJECT_TYPE_DEFINITION:
          case Kind.INPUT_OBJECT_TYPE_EXTENSION:
            return { ...node, fields: byName(node.fields) };
          case Kind.FIELD_DEFINITION:
            return { ...node, arguments: byName(node.arguments) };
          case Kind.DIRECTIVE:
            return { ...node, arguments: byName(node.arguments) };
          case Kind.OBJECT:
            return { ...node, fields: byName(node.fields) };
          case Kind.DIRECTIVE_DEFINITION:
            return {
              ...node,
              arguments: byName(node.arguments),
              locations: byValue(node.locations),
            };
          default:
            return undefined;
        }
      },
    });
    return print(ast);
  } catch {
    throw new Error(`Lo schema ${label} non è GraphQL valido.`);
  }
}

export function verifyFunctionSchema(expected, actual) {
  const committed = canonicalSchema(expected, "committato");
  const fetched = canonicalSchema(actual, "restituito da Shopify");

  if (committed !== fetched) {
    throw new Error(
      "Lo schema Function restituito da Shopify differisce semanticamente da schema.graphql.",
    );
  }
}

export function verifyFunctionApiVersion(manifest) {
  if (!/^api_version\s*=\s*"2026-07"\s*$/m.test(manifest)) {
    throw new Error('La Validation Function non dichiara api_version = "2026-07".');
  }
}

export function fetchFunctionSchema({ spawn = spawnSync, cwd = functionRoot } = {}) {
  const result = spawn(
    "shopify",
    ["app", "function", "schema", "--config", "dev", "--stdout", "--no-color"],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  if (result.status !== 0 || !result.stdout) {
    throw new Error("Shopify CLI non ha restituito lo schema Function API 2026-07.");
  }
  return result.stdout;
}

function main() {
  verifyFunctionApiVersion(readFileSync(manifestPath, "utf8"));
  const committed = readFileSync(schemaPath, "utf8");
  const fetched = fetchFunctionSchema();
  verifyFunctionSchema(committed, fetched);
  process.stdout.write(
    "Schema Function API 2026-07 verificato: nessuna differenza semantica rispetto a schema.graphql.\n",
  );
}

if (import.meta.main) main();
