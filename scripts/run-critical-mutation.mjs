import { Stryker } from "@stryker-mutator/core";
import { strykerPlugins } from "@stryker-mutator/vitest-runner";
import { pathToFileURL } from "node:url";
import { CRITICAL_MUTATION_DOMAINS, criticalMutationConfig } from "../stryker.critical.config.mjs";

export async function runCriticalMutation(
  StrykerClass = Stryker,
  plugins = strykerPlugins,
  domains = CRITICAL_MUTATION_DOMAINS,
) {
  if (plugins.length === 0) throw new Error("Plugin Vitest Stryker non disponibile");
  const results = [];
  for (const domain of domains) {
    const result = await new StrykerClass({
      ...criticalMutationConfig(domain),
      plugins: ["@stryker-mutator/vitest-runner"],
    }).runMutationTest();
    results.push({ domain, result });
  }
  return results;
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await runCriticalMutation();
