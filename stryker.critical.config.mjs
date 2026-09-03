import { readFileSync } from "node:fs";

const policy = JSON.parse(
  readFileSync(new URL("./config/coverage-policy.json", import.meta.url), "utf8"),
);

const testFiles = {
  webhooks: ["tests/webhook-jobs.test.ts", "tests/webhooks/**/*.test.ts"],
  billing: [
    "tests/billing/**/*.test.ts",
    "tests/home-billing-actions.test.ts",
    "tests/validation.test.ts",
    "tests/validation/**/*.test.ts",
  ],
  validation: ["tests/validation.test.ts", "tests/validation/**/*.test.ts"],
  ownerNotifications: [
    "tests/owner-notifications.test.ts",
    "tests/owner-notification-contracts.test.ts",
  ],
};

export const CRITICAL_MUTATION_DOMAINS = Object.keys(testFiles);

export function criticalMutationConfig(domainName) {
  const target = policy.targets.criticalDomains.domains[domainName];
  if (!target?.mutationActive || !testFiles[domainName]) {
    throw new Error(`Dominio mutation non configurato: ${domainName}`);
  }
  const threshold = target.mutationScore ?? policy.targets.criticalDomains.mutationScore;
  return {
    $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
    testRunner: "vitest",
    vitest: { configFile: "vitest.config.ts" },
    mutate: target.mutationFiles ?? target.files,
    testFiles: testFiles[domainName],
    coverageAnalysis: "perTest",
    tsconfigFile: "tsconfig.stryker-not-required.json",
    concurrency: 4,
    incremental: false,
    reporters: ["clear-text", "progress", "json"],
    jsonReporter: { fileName: `.coverage/mutation/${domainName}.json` },
    thresholds: { high: 95, low: threshold, break: threshold },
    tempDirName: `.stryker-tmp/${domainName}`,
  };
}
