import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadWorkerConfig(mode, root = process.cwd()) {
  const module = await import(pathToFileURL(path.join(root, "cloudflare.config.ts")).href);
  const config =
    typeof module.default === "function" ? await module.default({ mode }) : module.default;
  return config.worker;
}

// La configurazione sorgente e la Build Output di `cf` hanno la stessa forma camelCase con
// binding tipizzati.
export function workerTargets(worker = {}) {
  const env = worker.env ?? {};
  const triggers = worker.triggers ?? [];
  return {
    name: worker.name,
    vars: Object.fromEntries(
      Object.entries(env)
        .filter(([, binding]) => binding?.type === "text")
        .map(([name, binding]) => [name, binding.value]),
    ),
    database: env.DB?.type === "d1" ? env.DB : undefined,
    queue: env.WEBHOOK_QUEUE?.type === "queue" ? env.WEBHOOK_QUEUE.name : undefined,
    versionMetadata: env.CF_VERSION_METADATA?.type === "version-metadata",
    sendsEmail: Object.values(env).some((binding) => /email/i.test(binding?.type ?? "")),
    consumers: Object.fromEntries(
      triggers.filter(({ type }) => type === "queue").map((trigger) => [trigger.name, trigger]),
    ),
    crons: triggers.filter(({ type }) => type === "scheduled").map(({ schedule }) => schedule),
    workersDev: worker.workersDev,
    domains: worker.domains ?? [],
  };
}
