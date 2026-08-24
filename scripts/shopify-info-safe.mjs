import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const allowedConfigs = new Set(["shopify.app.toml", "shopify.app.dev.toml"]);
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const cleanInfoLines = (output) =>
  output
    .replaceAll(ansiPattern, "")
    .split("\n")
    .map((line) => line.replaceAll("│", " ").trim().replaceAll(/\s+/g, " "))
    .filter(Boolean);

export function verifyShopifyInfoResult({ config, configName, output, status }) {
  if (status === 0) return false;
  if (!Number.isInteger(status)) {
    throw new Error("Shopify CLI non ha completato la lettura dell'identità dell'app.");
  }

  const clientId = config.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
  const appName = config.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const scopes = config.match(/^\[access_scopes\]\s*$[\s\S]*?^scopes\s*=\s*"([^"]*)"/m)?.[1];
  const lines = cleanInfoLines(output);
  const expected = [
    "CURRENT APP CONFIGURATION",
    `Configuration file ${configName}`,
    `App name ${appName}`,
    `Client ID ${clientId}`,
    `Access scopes ${scopes}`,
  ];

  if (
    !clientId ||
    !appName ||
    scopes === undefined ||
    expected.some((line) => !lines.includes(line))
  ) {
    throw new Error("Shopify CLI non ha confermato l'identità configurata dell'app.");
  }
  return true;
}

export function verifyAuthenticatedVersionsResult({ output, status }) {
  if (status !== 0) {
    throw new Error("Shopify CLI non ha confermato l'accesso remoto all'app.");
  }
  let versions;
  try {
    versions = JSON.parse(output);
  } catch {
    throw new Error("Shopify CLI ha restituito un readback remoto non valido.");
  }
  if (!Array.isArray(versions)) {
    throw new Error("Shopify CLI ha restituito un readback remoto non valido.");
  }
}

export function readAuthenticatedVersions({ configName, projectRoot, spawn = spawnSync }) {
  const result = spawn(
    "shopify",
    ["app", "versions", "list", "--config", configName, "--no-color", "--json"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  verifyAuthenticatedVersionsResult({ output: result.stdout ?? "", status: result.status });
}

async function main() {
  const configName = process.argv[2] ?? "shopify.app.dev.toml";
  if (basename(configName) !== configName || !allowedConfigs.has(configName)) {
    throw new Error(`Configurazione Shopify non ammessa: ${configName}`);
  }

  const config = await readFile(join(root, configName), "utf8");
  const auditRoot = await mkdtemp(join(tmpdir(), "cf-ready-shopify-info-"));

  try {
    for (const file of [
      "package.json",
      "shopify.app.toml",
      "shopify.app.dev.toml",
      "shopify.web.toml",
    ]) {
      await cp(join(root, file), join(auditRoot, file));
    }

    const result = spawnSync("shopify", ["app", "info", "--config", configName], {
      cwd: auditRoot,
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    process.stdout.write(output);
    const requiresRemoteReadback = verifyShopifyInfoResult({
      config,
      configName,
      output,
      status: result.status,
    });

    if (requiresRemoteReadback) {
      readAuthenticatedVersions({ configName, projectRoot: root });
      process.stdout.write(
        `Shopify CLI ha restituito ${result.status}; identità e accesso remoto verificati.\n`,
      );
    }
    if (configName === "shopify.app.dev.toml") {
      const clientId = config.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
      const projectFile =
        process.env.SHOPIFY_PROJECT_FILE ?? join(root, ".shopify", "project.json");
      const project = JSON.parse(await readFile(projectFile, "utf8"));
      const devStore = clientId && project[clientId]?.dev_store_url;

      if (devStore !== "cf-ready-dev.myshopify.com") {
        throw new Error("Shopify CLI non è collegata al dev store CF Ready.");
      }
      process.stdout.write(`Dev store verificato: ${devStore}\n`);
    }
  } finally {
    await rm(auditRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
