import assert from "node:assert/strict";
import test from "node:test";
import {
  changedFiles,
  classifyCiLane,
  packageManifestDistributed,
  parseChangedFiles,
  releaseSurface,
  selectMutationDomains,
} from "./ci-lane.mjs";

test("la documentazione di contenuto usa la corsia docs", () => {
  assert.equal(classifyCiLane(["docs/listing/listing-it.md"]).lane, "docs");
  assert.equal(classifyCiLane(["README.md", "docs/listing/listing-en.md"]).e2e, false);
});

test("il sito distribuibile non viene trattato come sola documentazione", () => {
  const result = classifyCiLane(["site/index.html"]);
  assert.equal(result.lane, "standard");
  assert.equal(result.e2e, true);
});

test("governance, workflow e dipendenze restano full", () => {
  assert.equal(classifyCiLane(["AGENTS.md"]).lane, "full");
  assert.equal(classifyCiLane([".github/workflows/ci.yml"]).lane, "full");
  assert.equal(classifyCiLane(["docs/runbooks/secret-inventory.md"]).lane, "full");
  assert.equal(classifyCiLane(["docs/runbooks/future-operation.md"]).lane, "full");
  const dependency = classifyCiLane(["package-lock.json"]);
  assert.equal(dependency.lane, "full");
  assert.equal(dependency.dependencyReview, true);
  assert.equal(classifyCiLane(["scripts/reconcile-develop.mjs"]).lane, "full");
  assert.equal(classifyCiLane(["config/coverage-policy.json"]).lane, "full");
});

test("il diff include anche i file eliminati", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  let args;
  const files = changedFiles(base, head, {
    execute: (_command, receivedArgs) => {
      args = receivedArgs;
      return "D\0.github/workflows/obsolete.yml\0M\0README.md\0";
    },
  });
  assert.deepEqual(files, [".github/workflows/obsolete.yml", "README.md"]);
  assert.ok(args.includes("--name-status"));
  assert.ok(args.includes("-z"));
  assert.ok(args.includes("--diff-filter=ACMRD"));
});

test("il diff conserva entrambi i percorsi di rinomine e copie", () => {
  const files = parseChangedFiles(
    "R100\0.github/workflows/obsolete.yml\0docs/obsolete.md\0" +
      "C087\0scripts/source.mjs\0docs/source.md\0",
  );
  assert.deepEqual(files, [
    ".github/workflows/obsolete.yml",
    "docs/obsolete.md",
    "scripts/source.mjs",
    "docs/source.md",
  ]);
  assert.equal(classifyCiLane(files).lane, "full");
});

test("il runtime ordinario usa standard con E2E", () => {
  const result = classifyCiLane(["app/routes/app._index.tsx"]);
  assert.equal(result.lane, "standard");
  assert.equal(result.e2e, true);
  assert.equal(result.reactDoctor, true);
});

test("la promozione riusa le prove senza browser o React Doctor", () => {
  const result = classifyCiLane(["app/routes/app._index.tsx"], {
    base: "main",
    head: "develop",
  });
  assert.equal(result.lane, "promotion");
  assert.equal(result.e2e, false);
  assert.equal(result.reactDoctor, false);
});

test("il merge push su main usa la corsia di promozione", () => {
  const result = classifyCiLane(["app/routes/app._index.tsx"], {
    eventName: "push",
    refName: "main",
  });
  assert.equal(result.lane, "promotion");
  assert.deepEqual(result.mutationDomains, []);
});

test("seleziona soltanto i domini mutation toccati", () => {
  assert.deepEqual(selectMutationDomains(["app/billing/domain.ts"]), ["billing"]);
  assert.deepEqual(
    selectMutationDomains(["app/validation/domain.ts", "tests/webhooks/x.test.ts"]),
    ["validation", "webhooks"],
  );
  assert.deepEqual(selectMutationDomains(["app/root.tsx"]), []);
});

test("i file condivisi del mutation harness attivano tutti i domini", () => {
  assert.deepEqual(selectMutationDomains(["scripts/patch-stryker-vitest.mjs"]), [
    "billing",
    "validation",
    "webhooks",
  ]);
  assert.deepEqual(selectMutationDomains(["stryker.critical.config.mjs"]), [
    "billing",
    "validation",
    "webhooks",
  ]);
});

test("un diff vuoto fallisce verso la corsia completa", () => {
  assert.equal(classifyCiLane([]).lane, "full");
  assert.equal(classifyCiLane(["unknown/entry.custom"]).lane, "full");
  assert.equal(classifyCiLane(["unknown/entry.custom"]).coverageMode, "full");
  assert.equal(classifyCiLane(["shopify.app.toml"]).lane, "full");
});

test("le superfici separano metadati, operazioni e runtime senza distribuire test o tooling", () => {
  for (const file of [".gitignore", ".gitattributes"]) {
    const result = classifyCiLane([file]);
    assert.equal(result.coverageMode, "none");
    assert.equal(result.e2e, false);
    assert.equal(result.deployDevelopment, false);
  }
  for (const file of [
    "scripts/publish.mjs",
    ".github/workflows/deploy-production.yml",
    "knip.jsonc",
    "AGENTS.md",
    ".claude/hooks/session-start.sh",
  ]) {
    const result = classifyCiLane([file]);
    assert.equal(result.coverageMode, "operations");
    assert.equal(result.e2e, false);
    assert.equal(result.deployDevelopment, false);
  }
  for (const file of [
    "app/root.tsx",
    "package-lock.json",
    "cloudflare.config.ts",
    "shopify.app.toml",
  ]) {
    const result = classifyCiLane([file]);
    assert.equal(result.coverageMode, "full");
    assert.equal(result.e2e, true);
    assert.equal(result.deployDevelopment, true);
  }
  assert.equal(classifyCiLane(["tests/browser/home.test.ts"]).deployDevelopment, false);
  assert.equal(classifyCiLane(["site/style.css"]).deployDevelopment, false);
  assert.equal(classifyCiLane(["scripts/publish.mjs", "app/root.tsx"]).coverageMode, "full");
});

test("la superficie di rilascio separa deploy, sito e tooling del manifest", () => {
  const manifest = { version: "1.0.0", scripts: { build: "vite build", test: "vitest" } };
  const tooling = {
    before: manifest,
    after: { ...manifest, version: "1.0.1", scripts: { ...manifest.scripts, test: "vitest run" } },
  };
  assert.equal(packageManifestDistributed(manifest, tooling.after), false);
  for (const after of [
    { ...manifest, scripts: { ...manifest.scripts, build: "vite build --mode prod" } },
    { ...manifest, scripts: { ...manifest.scripts, postinstall: "node patch.mjs" } },
    { ...manifest, dependencies: { react: "19.0.0" } },
  ])
    assert.equal(packageManifestDistributed(manifest, after), true);
  assert.deepEqual(releaseSurface([]), { deploy: true, release: true });
  assert.deepEqual(releaseSurface(["package.json"], tooling), { deploy: false, release: false });
  assert.deepEqual(releaseSurface(["package.json"]), { deploy: true, release: true });
  assert.deepEqual(releaseSurface(["package.json"], { before: manifest }), {
    deploy: true,
    release: true,
  });
  assert.deepEqual(releaseSurface(["site/style.css", "scripts/publish.mjs"]), {
    deploy: false,
    release: true,
  });
  assert.deepEqual(releaseSurface(["tests/home.test.ts", ".github/workflows/ci.yml"]), {
    deploy: false,
    release: false,
  });
  assert.deepEqual(releaseSurface(["app/root.tsx"]), { deploy: true, release: true });
});
