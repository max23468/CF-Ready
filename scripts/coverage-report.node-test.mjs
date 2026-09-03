import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import coverageLibrary from "istanbul-lib-coverage";
import {
  baselineFailures,
  bundledFunctionSources,
  changedExecutableLineCoverage,
  coverageState,
  indexCoverageMap,
  mergeCoverageFiles,
  parseChangedLines,
  runCoverageReport,
  selectCoverageMap,
  targetFailures,
} from "./coverage-report.mjs";
import {
  classifyCoverageSources,
  coverageGroup,
  isCoverageSource,
  normalizeCoveragePath,
  trackedCoverageSources,
} from "./coverage-scope.mjs";
import {
  runCriticalMutation,
  runCriticalMutationIfDirect,
  selectCriticalMutationDomains,
} from "./run-critical-mutation.mjs";

const { createCoverageMap, createFileCoverage } = coverageLibrary;

const policy = {
  schemaVersion: 1,
  metrics: ["statements", "branches", "functions", "lines"],
  targets: {
    global: { minimum: 95, active: false },
    groups: {
      "server-worker": { minimum: 90, active: false },
      "ui-routes": { minimum: 90, active: false },
      function: { minimum: 100, perFile: true, active: false },
      operations: { minimum: 90, active: false },
      "public-site": { minimum: 90, active: false },
    },
    criticalDomains: {
      minimum: 95,
      mutationScore: 80,
      active: false,
      domains: {
        webhooks: {
          coverageActive: true,
          mutationActive: true,
          files: ["app/root.tsx"],
        },
      },
    },
  },
  ratchet: { active: true, changedExecutableLines: 95 },
  nonExecutableSources: {
    "app/app-bridge.d.ts": "Dichiarazioni",
    "app/billing/types.ts": "Sole dichiarazioni",
  },
  functionBundle: [
    "extensions/cf-ready-validation/src/index.ts",
    "app/checkout-field-validation.ts",
  ],
};

function coverage(file, hits = 1) {
  return createFileCoverage({
    path: file,
    statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
    fnMap: {
      0: {
        name: "run",
        decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
        line: 1,
      },
    },
    branchMap: {
      0: {
        type: "if",
        line: 1,
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
        locations: [{ start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }],
      },
    },
    s: { 0: hits },
    f: { 0: hits },
    b: { 0: [hits] },
  });
}

function mapFor(repositoryRoot, files, hits = 1) {
  const map = createCoverageMap({});
  for (const file of files) map.addFileCoverage(coverage(resolve(repositoryRoot, file), hits));
  return map;
}

test("il target canonico della Validation Function resta attivo al 100% per file", () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(repositoryPolicy.targets.groups.function, {
    minimum: 100,
    perFile: true,
    active: true,
  });
  assert.deepEqual(repositoryPolicy.functionBundle, [
    "extensions/cf-ready-validation/src/cart_validations_generate_run.ts",
    "app/checkout-field-validation.ts",
  ]);
});

test("il target globale resta attivo al 95% su tutte le metriche", () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(repositoryPolicy.targets.global, {
    minimum: 95,
    active: true,
  });
  assert.deepEqual(repositoryPolicy.metrics, ["statements", "branches", "functions", "lines"]);
});

test("la campagna mutation completa è schedulata e avviabile sul candidato develop", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/mutation-campaign.yml", import.meta.url),
    "utf8",
  );
  const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /push:\n\s+branches: \[develop\]/);
  assert.match(workflow, /paths: \[\.github\/workflows\/mutation-campaign\.yml\]/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/develop'/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(ciWorkflow, /^  critical-mutation:\n[\s\S]*?^    timeout-minutes: 20$/m);
  for (const domain of ["webhooks", "billing", "validation", "ownerNotifications"]) {
    assert.match(workflow, new RegExp(`domain: \\[.*\\b${domain}\\b`));
  }
  assert.match(workflow, /mutation-campaign-\$\{\{ matrix\.domain \}\}-\$\{\{ github\.sha \}\}/);
});

test("il gruppo operativo mantiene il gate canonico al 90%", () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(repositoryPolicy.targets.groups.operations, {
    minimum: 90,
    active: true,
  });
});

test("il gruppo UI e route mantiene il gate canonico al 90%", () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  const browserConfig = readFileSync(
    new URL("../vitest.browser.config.ts", import.meta.url),
    "utf8",
  );
  assert.deepEqual(repositoryPolicy.targets.groups["ui-routes"], {
    minimum: 90,
    active: true,
  });
  assert.match(browserConfig, /"app\/\*\*\/\*\.server\.\{ts,tsx\}"/);
});

test("Worker e sito pubblico mantengono gate canonici separati al 90%", () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  for (const group of ["server-worker", "public-site"]) {
    assert.deepEqual(repositoryPolicy.targets.groups[group], {
      minimum: 90,
      active: true,
    });
  }
});

test("il dominio webhook mantiene coverage e mutation gate canonici", async () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  const domain = repositoryPolicy.targets.criticalDomains.domains.webhooks;
  const { criticalMutationConfig } = await import("../stryker.critical.config.mjs");
  const mutationConfig = criticalMutationConfig("webhooks");

  assert.equal(repositoryPolicy.targets.criticalDomains.active, true);
  assert.equal(domain.coverageActive, true);
  assert.equal(domain.mutationActive, true);
  assert.equal(repositoryPolicy.targets.criticalDomains.minimum, 95);
  assert.equal(repositoryPolicy.targets.criticalDomains.mutationScore, 80);
  assert.deepEqual(mutationConfig.mutate, domain.files);
  assert.equal(mutationConfig.incremental, false);
  assert.equal(mutationConfig.thresholds.break, 80);
});

test("il launcher mutation condiviso carica esplicitamente core e runner Vitest", async () => {
  let received;
  class FakeStryker {
    constructor(options) {
      received = options;
    }

    async runMutationTest() {
      return ["mutant-killed"];
    }
  }

  assert.deepEqual(await runCriticalMutation(FakeStryker, ["plugin"], ["webhooks"]), [
    { domain: "webhooks", result: ["mutant-killed"] },
  ]);
  assert.deepEqual(received.plugins, ["@stryker-mutator/vitest-runner"]);
  await assert.rejects(
    runCriticalMutation(FakeStryker, [], ["webhooks"]),
    /Plugin Vitest Stryker non disponibile/,
  );
});

test("il launcher mutation esegue soltanto il proprio entrypoint", async () => {
  const calls = [];
  const runner = async (_StrykerClass, _plugins, domains) => calls.push(domains);
  await runCriticalMutationIfDirect(
    "file:///workspace/scripts/run-critical-mutation.mjs",
    "/workspace/scripts/altro.mjs",
    runner,
  );
  await runCriticalMutationIfDirect(
    "file:///workspace/scripts/run-critical-mutation.mjs",
    "/workspace/scripts/run-critical-mutation.mjs",
    runner,
    "validation",
  );
  await runCriticalMutationIfDirect(
    "file:///workspace/scripts/run-critical-mutation.mjs",
    undefined,
    runner,
  );
  assert.deepEqual(calls, [["validation"]]);
  assert.deepEqual(selectCriticalMutationDomains(undefined), [
    "webhooks",
    "billing",
    "validation",
    "ownerNotifications",
  ]);
  assert.deepEqual(selectCriticalMutationDomains("billing"), ["billing"]);
  assert.throws(
    () => selectCriticalMutationDomains("inesistente"),
    /Dominio mutation non configurato/,
  );
});

test("i domini critici mantengono gate coverage e mutation separati", async () => {
  const repositoryPolicy = JSON.parse(
    readFileSync(new URL("../config/coverage-policy.json", import.meta.url), "utf8"),
  );
  const { CRITICAL_MUTATION_DOMAINS, criticalMutationConfig } =
    await import("../stryker.critical.config.mjs");
  assert.deepEqual(CRITICAL_MUTATION_DOMAINS, [
    "webhooks",
    "billing",
    "validation",
    "ownerNotifications",
  ]);
  for (const domainName of CRITICAL_MUTATION_DOMAINS) {
    const domain = repositoryPolicy.targets.criticalDomains.domains[domainName];
    const mutationConfig = criticalMutationConfig(domainName);
    assert.equal(domain.coverageActive, true);
    assert.equal(domain.mutationActive, true);
    assert.deepEqual(mutationConfig.mutate, domain.mutationFiles ?? domain.files);
    assert.equal(mutationConfig.incremental, false);
    assert.equal(mutationConfig.thresholds.break, 80);
  }
  assert.deepEqual(
    Object.keys(repositoryPolicy.targets.criticalDomains.domains.validation.mutationExclusions),
    ["app/checkout-field-validation.ts", "app/validation/types.ts"],
  );

  const received = [];
  class FakeStryker {
    constructor(options) {
      received.push(options);
    }
    async runMutationTest() {
      return "verde";
    }
  }
  assert.deepEqual(
    await runCriticalMutation(FakeStryker, ["plugin"], ["billing", "ownerNotifications"]),
    [
      { domain: "billing", result: "verde" },
      { domain: "ownerNotifications", result: "verde" },
    ],
  );
  assert.equal(received.length, 2);
  assert.deepEqual(received[0].plugins, ["@stryker-mutator/vitest-runner"]);
  await assert.rejects(runCriticalMutation(FakeStryker, []), /Plugin Vitest/);
  assert.throws(() => criticalMutationConfig("inesistente"), /non configurato/);
});

test("classifica ogni sorgente first-party in un solo gruppo canonico", () => {
  const files = [
    "app/shop.server.ts",
    "app/root.tsx",
    "app/features/home/home.server.ts",
    "app/features/home/HomePage.tsx",
    "app/routes/webhooks.app.uninstalled.tsx",
    "workers/app.ts",
    "extensions/cf-ready-validation/src/index.ts",
    "scripts/preflight-prod.mjs",
    "site/menu.js",
  ];
  assert.deepEqual(classifyCoverageSources(files, policy), {
    "server-worker": [
      "app/features/home/home.server.ts",
      "app/routes/webhooks.app.uninstalled.tsx",
      "app/shop.server.ts",
      "workers/app.ts",
    ],
    "ui-routes": ["app/features/home/HomePage.tsx", "app/root.tsx"],
    function: ["extensions/cf-ready-validation/src/index.ts"],
    operations: ["scripts/preflight-prod.mjs"],
    "public-site": ["site/menu.js"],
  });
  assert.equal(coverageGroup("app/routes/auth.$.tsx", policy), "server-worker");
  assert.equal(coverageGroup("app/i18n/it.ts", policy), "ui-routes");
  assert.equal(coverageGroup("app/save-bar.ts", policy), "ui-routes");
});

test("esclude test, dichiarazioni, file generati e asset non eseguibili", () => {
  for (const file of [
    "app/app-bridge.d.ts",
    "app/billing/types.ts",
    "scripts/preflight-prod.node-test.mjs",
    "site/index.html",
    "extensions/cf-ready-validation/src/query.graphql",
    "extensions/cf-ready-validation/generated/api.ts",
  ]) {
    assert.equal(isCoverageSource(file, policy), false, file);
    assert.equal(coverageGroup(file, policy), null, file);
  }
  assert.equal(normalizeCoveragePath(".\\app\\root.tsx"), "app/root.tsx");
});

test("legge l'inventario Git includendo file nuovi ma non ignorati", () => {
  const execute = (_command, args) => {
    assert.deepEqual(args.slice(0, 4), ["ls-files", "--cached", "--others", "--exclude-standard"]);
    return "app/root.tsx\0scripts/task.node-test.mjs\0site/menu.js\0";
  };
  assert.deepEqual(trackedCoverageSources("/repo", policy, execute), [
    "app/root.tsx",
    "site/menu.js",
  ]);
});

test("costruisce aggregato, gruppi e overlay Function senza duplicare il globale", () => {
  const repositoryRoot = "/repo";
  const sources = [
    "app/checkout-field-validation.ts",
    "app/root.tsx",
    "extensions/cf-ready-validation/src/index.ts",
    "scripts/task.mjs",
    "site/menu.js",
  ];
  const globalMap = mapFor(repositoryRoot, sources);
  const functionMap = mapFor(repositoryRoot, policy.functionBundle);
  const state = coverageState({ globalMap, functionMap, sources, policy, repositoryRoot });
  assert.equal(state.sourceCount, 5);
  assert.equal(state.global.lines.total, 5);
  assert.equal(state.groups.function.lines.total, 2);
  assert.equal(state.groups["server-worker"].lines.total, 1);
  assert.equal(state.domains.webhooks.lines.total, 1);
  assert.equal(Object.keys(state.functionFiles).length, 2);

  const policyWithoutDomains = structuredClone(policy);
  delete policyWithoutDomains.targets.criticalDomains.domains;
  assert.deepEqual(
    coverageState({
      globalMap,
      functionMap,
      sources,
      policy: policyWithoutDomains,
      repositoryRoot,
    }).domains,
    {},
  );

  assert.throws(
    () =>
      coverageState({
        globalMap: mapFor(repositoryRoot, sources.slice(1)),
        functionMap,
        sources,
        policy,
        repositoryRoot,
      }),
    /manca app\/checkout-field-validation\.ts/,
  );
  assert.throws(
    () => selectCoverageMap(globalMap, ["app/assente.ts"], repositoryRoot),
    /Sorgente senza coverage/,
  );
  assert.throws(
    () => indexCoverageMap(mapFor("/fuori", ["file.ts"]), repositoryRoot),
    /Coverage fuori repository/,
  );
});

test("rifiuta mappe Istanbul incompatibili per la stessa sorgente", () => {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), "cf-ready-coverage-maps-"));
  const first = mapFor(repositoryRoot, ["app/root.tsx"]);
  const second = mapFor(repositoryRoot, ["app/root.tsx"]);
  second.fileCoverageFor(resolve(repositoryRoot, "app/root.tsx")).data.statementMap[0].start.line =
    2;
  const firstFile = resolve(repositoryRoot, "first.json");
  const secondFile = resolve(repositoryRoot, "second.json");
  writeFileSync(firstFile, JSON.stringify(first.toJSON()));
  writeFileSync(secondFile, JSON.stringify(second.toJSON()));
  assert.throws(
    () => mergeCoverageFiles([firstFile, secondFile]),
    /Mappe coverage incompatibili.*app\/root\.tsx/,
  );
});

test("ricava dal bundle le dipendenze first-party effettive della Function", () => {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), "cf-ready-function-bundle-"));
  mkdirSync(resolve(repositoryRoot, "extensions/function/src"), { recursive: true });
  mkdirSync(resolve(repositoryRoot, "app"), { recursive: true });
  writeFileSync(
    resolve(repositoryRoot, "extensions/function/src/run.ts"),
    'import { validate } from "../../../app/validate"; export const run = validate;\n',
  );
  writeFileSync(
    resolve(repositoryRoot, "app/validate.ts"),
    'import { normalize } from "./normalize"; export const validate = normalize;\n',
  );
  writeFileSync(resolve(repositoryRoot, "app/normalize.ts"), "export const normalize = true;\n");
  assert.deepEqual(
    bundledFunctionSources({
      repositoryRoot,
      entryPoints: ["extensions/function/src/run.ts"],
      sources: [
        "app/normalize.ts",
        "app/validate.ts",
        "extensions/function/src/run.ts",
        "app/unrelated.ts",
      ],
    }),
    ["app/normalize.ts", "app/validate.ts", "extensions/function/src/run.ts"],
  );
});

test("rifiuta sorgenti Function e domini critici omessi dalla policy", () => {
  const repositoryRoot = "/repo";
  const sources = [
    "app/checkout-field-validation.ts",
    "app/root.tsx",
    "extensions/cf-ready-validation/src/helper.ts",
    "extensions/cf-ready-validation/src/index.ts",
    "scripts/task.mjs",
    "site/menu.js",
  ];
  assert.throws(
    () =>
      coverageState({
        globalMap: mapFor(repositoryRoot, sources),
        functionMap: mapFor(repositoryRoot, policy.functionBundle),
        sources,
        policy,
        repositoryRoot,
      }),
    /Bundle Function incompleto: manca extensions\/cf-ready-validation\/src\/helper\.ts/,
  );

  const canonicalSources = sources.filter((file) => !file.endsWith("helper.ts"));
  const globalMap = mapFor(repositoryRoot, canonicalSources);
  const functionMap = mapFor(repositoryRoot, policy.functionBundle);
  for (const [mutate, expected] of [
    [
      (candidate) => candidate.functionBundle.push(candidate.functionBundle[0]),
      /Bundle Function incompleto: duplicato/,
    ],
    [
      (candidate) => candidate.functionBundle.push("extensions/cf-ready-validation/src/ghost.ts"),
      /Bundle Function incompleto: fuori sorgenti Function.*ghost\.ts/,
    ],
    [
      (candidate) => candidate.functionBundle.push("app/unknown.ts"),
      /Bundle Function incompleto: sorgente sconosciuta app\/unknown\.ts/,
    ],
  ]) {
    const candidate = structuredClone(policy);
    mutate(candidate);
    assert.throws(
      () =>
        coverageState({
          globalMap,
          functionMap,
          sources: canonicalSources,
          policy: candidate,
          repositoryRoot,
        }),
      expected,
    );
  }
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap,
        functionDependencies: [...policy.functionBundle, "app/root.tsx"],
        sources: canonicalSources,
        policy,
        repositoryRoot,
      }),
    /Bundle Function incompleto: dipendenza non dichiarata app\/root\.tsx/,
  );
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap,
        functionDependencies: [policy.functionBundle[0]],
        sources: canonicalSources,
        policy,
        repositoryRoot,
      }),
    /Bundle Function incompleto: fuori bundle reale app\/checkout-field-validation\.ts/,
  );
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap: mapFor(repositoryRoot, [policy.functionBundle[0]]),
        sources: canonicalSources,
        policy,
        repositoryRoot,
      }),
    /Inventario coverage Function non canonico: manca app\/checkout-field-validation\.ts/,
  );
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap: mapFor(repositoryRoot, [...policy.functionBundle, "app/root.tsx"]),
        sources: canonicalSources,
        policy,
        repositoryRoot,
      }),
    /Inventario coverage Function non canonico: fuori bundle app\/root\.tsx/,
  );

  const domainPolicy = structuredClone(policy);
  domainPolicy.targets.criticalDomains.domains.webhooks.sourcePrefixes = ["app/validation/"];
  const domainSources = [...canonicalSources, "app/validation/types.ts"];
  assert.throws(
    () =>
      coverageState({
        globalMap: mapFor(repositoryRoot, domainSources),
        functionMap: mapFor(repositoryRoot, policy.functionBundle),
        sources: domainSources,
        policy: domainPolicy,
        repositoryRoot,
      }),
    /Inventario dominio webhooks non canonico: omette app\/validation\/types\.ts/,
  );
  domainPolicy.targets.criticalDomains.domains.webhooks.files.push("app/unknown.ts");
  assert.throws(
    () =>
      coverageState({
        globalMap: mapFor(repositoryRoot, domainSources),
        functionMap,
        sources: domainSources,
        policy: domainPolicy,
        repositoryRoot,
      }),
    /Inventario dominio webhooks non canonico: sorgente sconosciuta app\/unknown\.ts/,
  );

  const mutationPolicy = structuredClone(policy);
  mutationPolicy.targets.criticalDomains.domains.webhooks.mutationFiles = [];
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap,
        sources: canonicalSources,
        policy: mutationPolicy,
        repositoryRoot,
      }),
    /esclusione mutation non motivata app\/root\.tsx/,
  );
  mutationPolicy.targets.criticalDomains.domains.webhooks.mutationExclusions = {
    "app/root.tsx": "Runner distinto",
  };
  assert.doesNotThrow(() =>
    coverageState({
      globalMap,
      functionMap,
      sources: canonicalSources,
      policy: mutationPolicy,
      repositoryRoot,
    }),
  );
  mutationPolicy.targets.criticalDomains.domains.webhooks.mutationFiles = [
    "app/root.tsx",
    "app/unknown.ts",
  ];
  assert.throws(
    () =>
      coverageState({
        globalMap,
        functionMap,
        sources: canonicalSources,
        policy: mutationPolicy,
        repositoryRoot,
      }),
    /mutation fuori dominio app\/unknown\.ts.*motivazione mutation obsoleta app\/root\.tsx/,
  );
});

test("applica target disattivati, soglie attive e ratchet senza arrotondare regressioni", () => {
  const repositoryRoot = "/repo";
  const sources = [
    "app/checkout-field-validation.ts",
    "app/root.tsx",
    "extensions/cf-ready-validation/src/index.ts",
    "scripts/task.mjs",
    "site/menu.js",
  ];
  const full = coverageState({
    globalMap: mapFor(repositoryRoot, sources),
    functionMap: mapFor(repositoryRoot, policy.functionBundle),
    sources,
    policy,
    repositoryRoot,
  });
  assert.deepEqual(targetFailures(full, policy), []);
  assert.deepEqual(baselineFailures(full, full, full), []);

  const active = structuredClone(policy);
  active.targets.global.active = true;
  active.targets.groups.function.active = true;
  active.targets.criticalDomains.active = true;
  const uncovered = coverageState({
    globalMap: mapFor(repositoryRoot, sources, 0),
    functionMap: mapFor(repositoryRoot, policy.functionBundle, 0),
    sources,
    policy,
    repositoryRoot,
  });
  assert.ok(
    targetFailures(uncovered, active).some((failure) => failure.startsWith("global.lines")),
  );
  assert.ok(
    targetFailures(uncovered, active).some((failure) =>
      failure.startsWith("domain.webhooks.lines"),
    ),
  );
  const inactiveDomain = structuredClone(active);
  inactiveDomain.targets.criticalDomains.domains.webhooks.coverageActive = false;
  assert.equal(
    targetFailures(uncovered, inactiveDomain).some((failure) =>
      failure.startsWith("domain.webhooks"),
    ),
    false,
  );
  const stricterDomain = structuredClone(active);
  stricterDomain.targets.criticalDomains.domains.webhooks.minimum = 101;
  assert.ok(
    targetFailures(full, stricterDomain).some((failure) =>
      failure.startsWith("domain.webhooks.lines"),
    ),
  );
  assert.ok(
    baselineFailures(uncovered, uncovered, full).some((failure) =>
      failure.includes("global.lines regredisce"),
    ),
  );
  assert.ok(
    baselineFailures(uncovered, uncovered, full).some((failure) =>
      failure.includes("domain.webhooks.lines regredisce"),
    ),
  );
  const subtlyLower = structuredClone(full);
  const subtlyHigher = structuredClone(full);
  subtlyLower.global.lines = { total: 100_000, covered: 95_001, pct: 95 };
  subtlyHigher.global.lines = { total: 100_000, covered: 95_009, pct: 95 };
  assert.ok(
    baselineFailures(subtlyLower, subtlyLower, subtlyHigher).some((failure) =>
      failure.includes("global.lines regredisce: 95% -> 95%"),
    ),
  );
  assert.deepEqual(baselineFailures(full, structuredClone(uncovered), null), [
    "La baseline committata non corrisponde alla misura corrente",
  ]);
  const withoutDomains = structuredClone(full);
  delete withoutDomains.domains;
  assert.deepEqual(baselineFailures(withoutDomains, withoutDomains, withoutDomains), []);
});

test("misura soltanto le linee eseguibili aggiunte dal diff", () => {
  const repositoryRoot = "/repo";
  const map = mapFor(repositoryRoot, ["app/root.tsx"]);
  const changed = parseChangedLines(
    [
      "diff --git a/app/root.tsx b/app/root.tsx",
      "+++ b/app/root.tsx",
      "@@ -0,0 +1,2 @@",
      "+eseguibile",
      "+commento",
      "diff --git a/docs/note.md b/docs/note.md",
      "+++ b/docs/note.md",
      "@@ -0,0 +1 @@",
      "+documentazione",
    ].join("\n"),
  );
  assert.deepEqual(changedExecutableLineCoverage(map, changed, ["app/root.tsx"], repositoryRoot), {
    total: 1,
    covered: 1,
    pct: 100,
  });
  const uncovered = mapFor(repositoryRoot, ["app/root.tsx"], 0);
  assert.deepEqual(
    changedExecutableLineCoverage(uncovered, changed, ["app/root.tsx"], repositoryRoot),
    { total: 1, covered: 0, pct: 0 },
  );
  assert.throws(
    () =>
      changedExecutableLineCoverage(
        createCoverageMap({}),
        changed,
        ["app/root.tsx"],
        repositoryRoot,
      ),
    /File modificato senza coverage/,
  );
  assert.deepEqual(
    changedExecutableLineCoverage(map, new Map(), ["app/root.tsx"], repositoryRoot),
    { total: 0, covered: 0, pct: 100 },
  );
});

test("genera e verifica una baseline deterministica con report aggregati", () => {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), "cf-ready-coverage-"));
  const sources = [
    "app/checkout-field-validation.ts",
    "app/root.tsx",
    "extensions/cf-ready-validation/src/index.ts",
    "scripts/task.mjs",
    "site/menu.js",
  ];
  for (const file of [...sources, "config/coverage-policy.json"]) {
    mkdirSync(dirname(resolve(repositoryRoot, file)), { recursive: true });
    const content = file.endsWith("coverage-policy.json")
      ? `${JSON.stringify(policy)}\n`
      : file === "extensions/cf-ready-validation/src/index.ts"
        ? 'export * from "../../../app/checkout-field-validation";\n'
        : "export {};\n";
    writeFileSync(resolve(repositoryRoot, file), content);
  }
  const operations = mapFor(repositoryRoot, ["scripts/task.mjs"]);
  operations.addFileCoverage(coverage(resolve(repositoryRoot, "site/menu.js"), 0));
  const reportsByName = {
    app: mapFor(repositoryRoot, sources.slice(0, 2)),
    ui: mapFor(repositoryRoot, ["app/root.tsx"]),
    function: mapFor(repositoryRoot, policy.functionBundle),
    operations,
  };
  for (const [name, map] of Object.entries(reportsByName)) {
    const file = resolve(repositoryRoot, `.coverage/${name}/coverage-final.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(map.toJSON()));
  }
  let baseline;
  const execute = (command, args) => {
    assert.equal(command, "git");
    if (args[0] === "ls-files") return `${sources.join("\0")}\0`;
    if (args[0] === "show") return baseline;
    if (args[0] === "diff") {
      return [
        "diff --git a/app/root.tsx b/app/root.tsx",
        "+++ b/app/root.tsx",
        "@@ -0,0 +1 @@",
        "+export {};",
      ].join("\n");
    }
    throw new Error(`Comando Git inatteso: ${args.join(" ")}`);
  };

  const updated = runCoverageReport({ repositoryRoot, args: ["--update-baseline"], execute });
  baseline = readFileSync(resolve(repositoryRoot, "config/coverage-baseline.json"), "utf8");
  const checked = runCoverageReport({ repositoryRoot, args: [], execute });
  const sha = "a".repeat(40);
  assert.doesNotThrow(() =>
    runCoverageReport({
      repositoryRoot,
      args: ["--base-sha", sha, "--head-sha", sha],
      execute,
    }),
  );
  assert.doesNotThrow(() =>
    runCoverageReport({
      repositoryRoot,
      args: ["--base-sha", sha, "--head-sha", "non-valido"],
      execute: (command, args) => {
        if (args[0] === "show") throw new Error("baseline assente");
        return execute(command, args);
      },
    }),
  );
  assert.throws(
    () =>
      runCoverageReport({
        repositoryRoot,
        args: ["--base-sha", sha, "--head-sha", sha],
        execute: (command, args) => {
          if (args[0] !== "diff") return execute(command, args);
          return [
            "diff --git a/site/menu.js b/site/menu.js",
            "+++ b/site/menu.js",
            "@@ -0,0 +1 @@",
            "+void 0;",
          ].join("\n");
        },
      }),
    /Diff coverage linee eseguibili: 0% < 95%/,
  );
  assert.deepEqual(checked.state, updated.state);
  assert.equal(
    readFileSync(resolve(repositoryRoot, "config/coverage-baseline.json"), "utf8").endsWith("\n"),
    true,
  );
  assert.equal(
    readFileSync(resolve(repositoryRoot, ".coverage/global/lcov.info"), "utf8").length > 0,
    true,
  );
});
