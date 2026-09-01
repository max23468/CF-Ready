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

export function selectCriticalMutationDomains(domainName, domains = CRITICAL_MUTATION_DOMAINS) {
  if (!domainName) return domains;
  if (!domains.includes(domainName)) {
    throw new Error(`Dominio mutation non configurato: ${domainName}`);
  }
  return [domainName];
}

export async function runCriticalMutationIfDirect(
  moduleUrl,
  executablePath,
  runner = runCriticalMutation,
  domainName = process.env.CRITICAL_MUTATION_DOMAIN,
) {
  if (executablePath && moduleUrl === pathToFileURL(executablePath).href) {
    await runner(undefined, undefined, selectCriticalMutationDomains(domainName));
  }
}

await runCriticalMutationIfDirect(import.meta.url, process.argv[1]);
