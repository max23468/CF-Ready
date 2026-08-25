import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, print } from "graphql";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionRoot = join(root, "extensions", "cf-ready-validation");
const schemaPath = join(functionRoot, "schema.graphql");
const manifestPath = join(functionRoot, "shopify.extension.toml");

function canonicalSchema(schema, label) {
  try {
    return print(parse(schema));
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
    "npm",
    [
      "exec",
      "--",
      "shopify",
      "app",
      "function",
      "schema",
      "--config",
      "dev",
      "--stdout",
      "--no-color",
    ],
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
