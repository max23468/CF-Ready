import { readFileSync } from "node:fs";

const policy = JSON.parse(
  readFileSync(new URL("./config/coverage-policy.json", import.meta.url), "utf8"),
);
const target = policy.targets.criticalDomains.domains.webhooks;

export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  mutate: target.files,
  testFiles: ["tests/webhook-jobs.test.ts", "tests/webhooks/**/*.test.ts"],
  coverageAnalysis: "perTest",
  // TypeScript 7 non espone più l'API usata dal preprocessor Stryker 10. Il file
  // intenzionalmente assente evita quella riscrittura: Vitest continua a usare
  // il tsconfig reale, copiato integralmente nella sandbox isolata.
  tsconfigFile: "tsconfig.stryker-not-required.json",
  concurrency: 4,
  incremental: false,
  reporters: ["clear-text", "progress", "json"],
  jsonReporter: { fileName: ".coverage/mutation/webhooks.json" },
  thresholds: {
    high: 95,
    low: target.mutationScore ?? policy.targets.criticalDomains.mutationScore,
    break: target.mutationScore ?? policy.targets.criticalDomains.mutationScore,
  },
  tempDirName: ".stryker-tmp/webhooks",
};
