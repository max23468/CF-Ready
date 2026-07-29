import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const expected = {
  clientId: "adff48d4fe4ceb0dadb4734520701dd7",
  appUrl: "https://cf-ready-dev.tmsf.workers.dev",
  databaseId: "9490eaea-3a12-465d-bb48-e2622b31fc4d",
  databaseName: "cf-ready-db-dev",
  workerName: "cf-ready-dev",
};

const shopifyConfig = await readFile("shopify.app.dev.toml", "utf8");
const wranglerConfig = await readFile("wrangler.jsonc", "utf8");
for (const value of Object.values(expected)) {
  if (!shopifyConfig.includes(value) && !wranglerConfig.includes(value)) {
    throw new Error("Il target Development non coincide con la configurazione attesa.");
  }
}

run("node", ["scripts/shopify-info-safe.mjs", "shopify.app.dev.toml"]);
const d1 = JSON.parse(
  run("npm", ["exec", "--", "wrangler", "d1", "info", expected.databaseName, "--json"], false),
);
if (d1.uuid !== expected.databaseId || d1.name !== expected.databaseName) {
  throw new Error("Il database D1 Development non coincide con il target atteso.");
}

console.log("Preflight Development superato: Shopify dev store e D1 verificati.");

function run(command, args, inherit = true) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`Preflight fallito: ${command} ${args.slice(0, 2).join(" ")}`);
  }
  return result.stdout;
}
