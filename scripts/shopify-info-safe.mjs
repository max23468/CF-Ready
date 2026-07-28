import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = process.argv[2] ?? "shopify.app.dev.toml";
const allowedConfigs = new Set(["shopify.app.toml", "shopify.app.dev.toml"]);

if (basename(config) !== config || !allowedConfigs.has(config)) {
  throw new Error(`Configurazione Shopify non ammessa: ${config}`);
}

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

  const result = spawnSync("shopify", ["app", "info", "--config", config], {
    cwd: auditRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else if (config === "shopify.app.dev.toml") {
    const toml = await readFile(join(root, config), "utf8");
    const clientId = toml.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
    const projectFile = process.env.SHOPIFY_PROJECT_FILE ?? join(root, ".shopify", "project.json");
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
