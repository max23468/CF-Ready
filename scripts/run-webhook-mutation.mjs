import { Stryker } from "@stryker-mutator/core";
import { strykerPlugins } from "@stryker-mutator/vitest-runner";
import { pathToFileURL } from "node:url";
import config from "../stryker.webhooks.config.mjs";

export async function runWebhookMutation(StrykerClass = Stryker, plugins = strykerPlugins) {
  if (plugins.length === 0) throw new Error("Plugin Vitest Stryker non disponibile");
  return new StrykerClass({
    ...config,
    plugins: ["@stryker-mutator/vitest-runner"],
  }).runMutationTest();
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) await runWebhookMutation();
