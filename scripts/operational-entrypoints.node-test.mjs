import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (character) => character.repeat(40);
const secretNames = ["SHOPIFY_API_SECRET", "SESSION_ENCRYPTION_KEY", "TRIAL_LEDGER_HMAC_KEY"];

function inheritedEnvironment() {
  return Object.fromEntries(
    ["PATH", "TMPDIR", "NODE_V8_COVERAGE"].flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]],
    ),
  );
}

function runEntrypoint(script, args = [], { cwd = root, env = {}, success = true } = {}) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...inheritedEnvironment(), ...env },
  });
  assert.equal(
    result.status === 0,
    success,
    `${script}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

async function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "cf-ready-operations-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function executable(directory, name, source) {
  const target = path.join(directory, name);
  await writeFile(target, `#!/bin/sh\nset -eu\n${source}\n`);
  await chmod(target, 0o755);
  return target;
}

async function providerBin(t, sourceByName) {
  const directory = await temporaryDirectory(t);
  for (const [name, source] of Object.entries(sourceByName)) {
    await executable(directory, name, source);
  }
  return `${directory}${path.delimiter}${process.env.PATH}`;
}

async function fetchEnvironment(t, routes) {
  const directory = await temporaryDirectory(t);
  const routesPath = path.join(directory, "routes.json");
  const callsPath = path.join(directory, "calls.jsonl");
  const loaderPath = path.join(directory, "fetch-loader.mjs");
  await writeFile(routesPath, JSON.stringify(routes));
  await writeFile(
    loaderPath,
    `import { appendFileSync, readFileSync } from "node:fs";
const routes = JSON.parse(readFileSync(process.env.CF_READY_FETCH_ROUTES, "utf8"));
const offsets = new Map();
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const key = \`${'${init.method ?? "GET"}'} ${"${url.pathname}${url.search}"}\`;
  const configured = routes[key];
  if (configured === undefined) throw new Error(\`Provider sintetico senza fixture: ${"${key}"}\`);
  const responses = Array.isArray(configured) && configured[0]?.body !== undefined
    ? configured
    : [{ body: configured }];
  const offset = offsets.get(key) ?? 0;
  const response = responses[Math.min(offset, responses.length - 1)];
  offsets.set(key, offset + 1);
  appendFileSync(process.env.CF_READY_FETCH_CALLS, JSON.stringify({ key, body: init.body }) + "\\n");
  const body = response.status === 204 ? null : JSON.stringify(response.body ?? {});
  return new Response(body, { status: response.status ?? 200 });
};
`,
  );
  return {
    NODE_OPTIONS: `--import=${pathToFileURL(loaderPath).href}`,
    CF_READY_FETCH_ROUTES: routesPath,
    CF_READY_FETCH_CALLS: callsPath,
    calls: () =>
      readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
}

async function writePreflightProject(t, environment) {
  const directory = await temporaryDirectory(t);
  await mkdir(path.join(directory, "migrations"));
  await writeFile(
    path.join(directory, "migrations", "0015_safe.sql"),
    "CREATE TABLE safe(id INTEGER);",
  );
  await writeFile(path.join(directory, "package.json"), '{"version":"1.1.4"}\n');
  if (environment === "Development") {
    await cp(path.join(root, "shopify.app.dev.toml"), path.join(directory, "shopify.app.dev.toml"));
    await cp(path.join(root, "wrangler.json"), path.join(directory, "wrangler.json"));
  } else {
    await cp(path.join(root, "shopify.app.toml"), path.join(directory, "shopify.app.toml"));
    await mkdir(path.join(directory, "build", "server"), { recursive: true });
    await writeFile(
      path.join(directory, "build", "server", "wrangler.json"),
      JSON.stringify({
        name: "cf-ready-prod",
        vars: {
          SHOPIFY_API_KEY: "3640fb39bcf605de0537d6dfc0d01c8a",
          SHOPIFY_APP_URL: "https://cf-ready-prod.tmsf.workers.dev",
          SCOPES: "write_validations",
          BILLING_TEST: "false",
          OWNER_NOTIFICATIONS_ENABLED: "false",
        },
        triggers: { crons: ["0 * * * *", "*/5 * * * *"] },
        d1_databases: [
          {
            binding: "DB",
            database_name: "cf-ready-db-prod",
            database_id: "6434597c-d683-48d9-a51f-b0d15de6a684",
          },
        ],
        queues: {
          producers: [{ binding: "WEBHOOK_QUEUE", queue: "cf-ready-webhooks-prod" }],
          consumers: [
            {
              queue: "cf-ready-webhooks-prod",
              max_batch_size: 1,
              max_retries: 5,
              dead_letter_queue: "cf-ready-webhooks-prod-failures",
            },
            {
              queue: "cf-ready-webhooks-prod-failures",
              max_batch_size: 1,
              max_retries: 100,
              dead_letter_queue: "cf-ready-webhooks-prod",
            },
          ],
        },
      }),
    );
  }
  return directory;
}

test("gli entrypoint backup e ricevuta coprono successo e rifiuto senza provider", async (t) => {
  const directory = await temporaryDirectory(t);
  const key = Buffer.alloc(32, 7).toString("base64");
  const source = path.join(directory, "source.txt");
  const encrypted = path.join(directory, "backup.cfrb");
  const restored = path.join(directory, "restored.txt");
  await writeFile(source, "backup sintetico");

  assert.equal(
    runEntrypoint("backup-crypto.mjs", ["check-key"], { env: { D1_BACKUP_KEY: key } }).status,
    0,
  );
  assert.match(runEntrypoint("backup-crypto.mjs", ["key", "weekly"]).stdout, /^weekly\/slot-/);
  runEntrypoint("backup-crypto.mjs", ["encrypt", source, encrypted], {
    env: { D1_BACKUP_KEY: key },
  });
  runEntrypoint("backup-crypto.mjs", ["decrypt", encrypted, restored], {
    env: { D1_BACKUP_KEY: key },
  });
  assert.equal(readFileSync(restored, "utf8"), "backup sintetico");
  runEntrypoint("backup-crypto.mjs", ["unknown", source, restored], {
    env: { D1_BACKUP_KEY: key },
    success: false,
  });
  runEntrypoint("backup-crypto.mjs", ["check-key"], {
    env: { D1_BACKUP_KEY: "chiave-non-valida" },
    success: false,
  });
  runEntrypoint("backup-crypto.mjs", ["encrypt"], {
    env: { D1_BACKUP_KEY: key },
    success: false,
  });
  const corrupt = path.join(directory, "corrupt.cfrb");
  await writeFile(corrupt, "backup non valido");
  runEntrypoint("backup-crypto.mjs", ["decrypt", corrupt, restored], {
    env: { D1_BACKUP_KEY: key },
    success: false,
  });
  const incompleteSql = path.join(directory, "incomplete.sql");
  const restoredDatabase = path.join(directory, "restored.sqlite");
  await writeFile(incompleteSql, "CREATE TABLE synthetic(id INTEGER);");
  runEntrypoint("backup-crypto.mjs", ["verify", incompleteSql, restoredDatabase], {
    success: false,
  });

  const workerPath = path.join(directory, "worker.json");
  const shopifyPath = path.join(directory, "shopify.json");
  const receiptPath = path.join(directory, "receipt.json");
  await writeFile(
    workerPath,
    JSON.stringify({
      id: "deployment",
      annotations: { "workers/message": `Production ${sha("a")}` },
      versions: [{ version_id: "worker", percentage: 100 }],
    }),
  );
  await writeFile(
    shopifyPath,
    JSON.stringify([
      {
        status: "active",
        versionId: "shopify",
        versionTag: "1.1.4",
        message: `Production ${sha("a")}`,
      },
    ]),
  );
  const receiptEnv = {
    WORKER_RECEIPT_PATH: workerPath,
    SHOPIFY_RECEIPT_PATH: shopifyPath,
    DEPLOY_RECEIPT_PATH: receiptPath,
    DEPLOY_ENVIRONMENT: "Production",
    GITHUB_SHA: sha("a"),
    GIT_TREE: sha("b"),
    GITHUB_REPOSITORY: "owner/repository",
    GITHUB_SERVER_URL: "https://github.test",
    GITHUB_RUN_ID: "42",
    REPOSITORY_VERSION: "1.1.4",
    DEPLOY_VERSION: "1.1.4",
  };
  runEntrypoint("deploy-receipt.mjs", [], { env: receiptEnv });
  assert.equal(JSON.parse(readFileSync(receiptPath, "utf8")).commit, sha("a"));
  runEntrypoint("deploy-receipt.mjs", [], {
    env: { ...receiptEnv, GITHUB_SHA: "non-valido" },
    success: false,
  });
});

test("i preflight reali usano soltanto comandi provider sintetici", async (t) => {
  const commit = sha("a");
  const pathWithProviders = await providerBin(t, {
    node: "exit 0",
    shopify: `printf '%s\\n' '[{"status":"active","versionId":"shopify-version","versionTag":"1.1.4","message":"Development ${commit}"}]'`,
    npm: `
case "$*" in
  *"deployments status"*) printf '%s\\n' '{"id":"deployment","annotations":{"workers/message":"Development ${commit}"},"versions":[{"version_id":"worker-version","percentage":100}]}' ;;
  *"d1 info cf-ready-db-dev"*) printf '%s\\n' '{"uuid":"9490eaea-3a12-465d-bb48-e2622b31fc4d","name":"cf-ready-db-dev"}' ;;
  *"d1 info cf-ready-db-prod"*) printf '%s\\n' '{"uuid":"6434597c-d683-48d9-a51f-b0d15de6a684","name":"cf-ready-db-prod"}' ;;
  *"secret list"*) if [ "${"${CF_READY_FAIL_SECRET:-}"}" = "1" ]; then exit 2; fi; printf '%s\\n' '${JSON.stringify(secretNames.map((name) => ({ name })))}' ;;
  *) exit 3 ;;
esac`,
  });
  const development = await writePreflightProject(t, "Development");
  const developmentResult = runEntrypoint("preflight-dev.mjs", ["--readback-only"], {
    cwd: development,
    env: { PATH: pathWithProviders },
  });
  assert.match(developmentResult.stdout, /Readback Development superato/);

  const production = await writePreflightProject(t, "Production");
  const productionResult = runEntrypoint("preflight-prod.mjs", [], {
    cwd: production,
    env: { PATH: pathWithProviders },
  });
  assert.match(productionResult.stdout, /Preflight Production superato/);
  runEntrypoint("preflight-prod.mjs", [], {
    cwd: production,
    env: { PATH: pathWithProviders, CF_READY_FAIL_SECRET: "1" },
    success: false,
  });
});

test("la policy CI reale pubblica soltanto uno status sul provider sintetico", async (t) => {
  const head = sha("c");
  const provider = await fetchEnvironment(t, {
    "GET /repos/owner/repository": { owner: { id: 10 } },
    "GET /users/dependabot%5Bbot%5D": { id: 99, login: "dependabot[bot]" },
    "GET /repos/owner/repository/pulls/7/files?per_page=100&page=1": [
      { filename: "package.json" },
      { filename: "scripts/check.mjs" },
    ],
    [`POST /repos/owner/repository/statuses/${head}`]: {},
  });
  const directory = await temporaryDirectory(t);
  const eventPath = path.join(directory, "event.json");
  await writeFile(
    eventPath,
    JSON.stringify({
      action: "labeled",
      label: { name: "ci-policy-approved" },
      number: 7,
      sender: { id: 10, login: "owner", type: "User" },
      pull_request: { head: { sha: head }, changed_files: 2 },
    }),
  );
  const result = runEntrypoint("ci-policy-check.mjs", [], {
    env: {
      ...provider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SERVER_URL: "https://github.test",
      GITHUB_RUN_ID: "42",
    },
  });
  assert.match(result.stdout, /attestata dal proprietario/);
  assert.equal(provider.calls().filter(({ key }) => key.startsWith("POST ")).length, 1);

  const ordinaryProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository": { owner: { id: 10 } },
    "GET /users/dependabot%5Bbot%5D": { id: 99, login: "dependabot[bot]" },
    "GET /repos/owner/repository/pulls/8/files?per_page=100&page=1": [
      { filename: "app/routes/app._index.tsx" },
    ],
    [`POST /repos/owner/repository/statuses/${head}`]: [{ status: 204, body: {} }],
  });
  await writeFile(
    eventPath,
    JSON.stringify({
      action: "synchronize",
      number: 8,
      sender: { id: 20, login: "collaborator", type: "User" },
      pull_request: { head: { sha: head }, changed_files: 1 },
    }),
  );
  const ordinaryResult = runEntrypoint("ci-policy-check.mjs", [], {
    env: {
      ...ordinaryProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SERVER_URL: "https://github.test",
      GITHUB_RUN_ID: "43",
    },
  });
  assert.match(ordinaryResult.stdout, /non modifica il control plane CI/);

  const dependabotProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository": { owner: { id: 10 } },
    "GET /users/dependabot%5Bbot%5D": { id: 99, login: "dependabot[bot]" },
    "GET /repos/owner/repository/pulls/9/files?per_page=100&page=1": [
      { filename: "package-lock.json", previous_filename: "package-lock.old.json" },
    ],
    [`POST /repos/owner/repository/statuses/${head}`]: {},
  });
  await writeFile(
    eventPath,
    JSON.stringify({
      action: "synchronize",
      number: 9,
      sender: { id: 99, login: "dependabot[bot]", type: "Bot" },
      pull_request: { head: { sha: head }, changed_files: 1 },
    }),
  );
  const dependabotResult = runEntrypoint("ci-policy-check.mjs", [], {
    env: {
      ...dependabotProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SERVER_URL: "https://github.test",
      GITHUB_RUN_ID: "44",
    },
  });
  assert.match(dependabotResult.stdout, /automazione attendibile/);

  const invalidEvents = [
    {
      action: "synchronize",
      number: 10,
      sender: { id: 10 },
      pull_request: { head: { sha: "sha-non-valido" }, changed_files: 0 },
    },
    {
      action: "synchronize",
      number: "10",
      sender: { id: 10 },
      pull_request: { head: { sha: head }, changed_files: 0 },
    },
    {
      action: "synchronize",
      number: 10,
      sender: { id: 10 },
      pull_request: { head: { sha: head }, changed_files: "0" },
    },
    {
      action: "synchronize",
      number: 10,
      sender: {},
      pull_request: { head: { sha: head }, changed_files: 0 },
    },
  ];
  for (const event of invalidEvents) {
    await writeFile(eventPath, JSON.stringify(event));
    runEntrypoint("ci-policy-check.mjs", [], {
      env: {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "owner/repository",
        GITHUB_TOKEN: "token-sintetico",
        GITHUB_EVENT_PATH: eventPath,
      },
      success: false,
    });
  }

  const invalidOwnerProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository": { owner: {} },
  });
  await writeFile(
    eventPath,
    JSON.stringify({
      action: "synchronize",
      number: 11,
      sender: { id: 10 },
      pull_request: { head: { sha: head }, changed_files: 0 },
    }),
  );
  runEntrypoint("ci-policy-check.mjs", [], {
    env: {
      ...invalidOwnerProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_EVENT_PATH: eventPath,
    },
    success: false,
  });

  const incompleteFilesProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository": { owner: { id: 10 } },
    "GET /users/dependabot%5Bbot%5D": { id: 99, login: "dependabot[bot]" },
    "GET /repos/owner/repository/pulls/12/files?per_page=100&page=1": [],
  });
  await writeFile(
    eventPath,
    JSON.stringify({
      action: "synchronize",
      number: 12,
      sender: { id: 10 },
      pull_request: { head: { sha: head }, changed_files: 1 },
    }),
  );
  runEntrypoint("ci-policy-check.mjs", [], {
    env: {
      ...incompleteFilesProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_EVENT_PATH: eventPath,
    },
    success: false,
  });

  runEntrypoint("ci-policy-check.mjs", [], {
    env: { GITHUB_ACTIONS: "true" },
    success: false,
  });
});

test("i gate GitHub reali riusano check sintetici senza rete", async (t) => {
  const provider = await fetchEnvironment(t, {
    [`GET /repos/owner/repository/commits/${sha("d")}/check-runs?per_page=100`]: {
      check_runs: [
        { name: "unrelated", conclusion: "failure", check_suite: { id: 1 } },
        {
          id: 1,
          name: "verify",
          conclusion: "failure",
          details_url: "https://github.test/actions/runs/99/job/1",
          check_suite: { id: 2 },
        },
        { id: 2, name: "verify", conclusion: "success", check_suite: { id: 1 } },
        { id: 3, name: "coverage", conclusion: "failure", check_suite: { id: 1 } },
        { id: 4, name: "coverage", conclusion: "success", check_suite: { id: 1 } },
      ],
    },
  });
  const result = runEntrypoint("github-gates.mjs", [], {
    env: {
      ...provider,
      GITHUB_ACTIONS: "true",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_SHA: sha("d"),
      GITHUB_RUN_ID: "99",
      REQUIRED_CHECKS: "verify,coverage",
    },
  });
  assert.match(result.stdout, /Gate riusati/);
  assert.equal(provider.calls().length, 1);

  const unavailableProvider = await fetchEnvironment(t, {
    [`GET /repos/owner/repository/commits/${sha("d")}/check-runs?per_page=100`]: [
      { status: 503, body: {} },
    ],
  });
  runEntrypoint("github-gates.mjs", [], {
    env: {
      ...unavailableProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_TOKEN: "token-sintetico",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_SHA: sha("d"),
      GITHUB_RUN_ID: "99",
      REQUIRED_CHECKS: "verify",
    },
    success: false,
  });
});

test("il riallineamento reale copre no-op e recupero usando API sintetiche", async (t) => {
  const main = sha("a");
  const develop = sha("b");
  const commonEnvironment = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    RECONCILIATION_MODE: "no-deploy-promotion",
    GITHUB_TOKEN: "github-sintetico",
    RECONCILIATION_TOKEN: "app-sintetica",
    RECONCILIATION_APP_SLUG: "cf-ready-reconciler",
    EXPECTED_RECONCILIATION_APP_SLUG: "cf-ready-reconciler",
    GITHUB_REPOSITORY: "owner/repository",
  };
  const directProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/git/ref/heads/main": { object: { sha: main } },
    "GET /repos/owner/repository/git/ref/heads/develop": { object: { sha: develop } },
    [`GET /repos/owner/repository/git/commits/${main}`]: {
      parents: [{ sha: sha("0") }, { sha: develop }],
      tree: { sha: "same-tree" },
    },
    [`GET /repos/owner/repository/git/commits/${develop}`]: { tree: { sha: "same-tree" } },
  });
  const direct = runEntrypoint("reconcile-develop.mjs", [], {
    env: { ...directProvider, ...commonEnvironment },
  });
  assert.match(direct.stdout, /nessuna scrittura necessaria/);
  assert.equal(
    directProvider.calls().some(({ key }) => key.startsWith("PATCH ")),
    false,
  );

  const alreadyAlignedProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/git/ref/heads/main": { object: { sha: main } },
    "GET /repos/owner/repository/git/ref/heads/develop": { object: { sha: main } },
    [`GET /repos/owner/repository/git/commits/${main}`]: {
      parents: [{ sha: sha("0") }, { sha: develop }],
      tree: { sha: "same-tree" },
    },
    "GET /repos/owner/repository/actions/runs/43": {
      path: ".github/workflows/deploy-pages-production.yml",
      event: "workflow_dispatch",
      status: "completed",
      conclusion: "success",
      head_branch: "main",
      head_sha: main,
    },
  });
  const alreadyAligned = runEntrypoint("reconcile-develop.mjs", [], {
    env: {
      ...alreadyAlignedProvider,
      ...commonEnvironment,
      GITHUB_EVENT_NAME: "workflow_run",
      RECONCILIATION_MODE: "",
      SOURCE_DEPLOY_RUN_ID: "43",
      SOURCE_DEPLOY_SHA: main,
    },
  });
  assert.match(alreadyAligned.stdout, /è già allineato/);
  assert.equal(
    alreadyAlignedProvider.calls().some(({ key }) => key.startsWith("PATCH ")),
    false,
  );

  const promoted = sha("c");
  const target = sha("e");
  const recoveryProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/git/ref/heads/main": { object: { sha: main } },
    "GET /repos/owner/repository/git/ref/heads/develop": [
      { body: { object: { sha: develop } } },
      { body: { object: { sha: target } } },
    ],
    [`GET /repos/owner/repository/git/commits/${main}`]: {
      parents: [{ sha: sha("0") }, { sha: promoted }],
      tree: { sha: "promoted-tree" },
    },
    [`GET /repos/owner/repository/git/commits/${develop}`]: { tree: { sha: "current-tree" } },
    [`GET /repos/owner/repository/git/commits/${promoted}`]: { tree: { sha: "promoted-tree" } },
    [`GET /repos/owner/repository/compare/${promoted}...${develop}`]: {
      status: "ahead",
      ahead_by: 2,
      merge_base_commit: { sha: promoted },
    },
    "POST /repos/owner/repository/git/commits": { sha: target },
    "PATCH /repos/owner/repository/git/refs/heads/develop": {},
  });
  const recovery = runEntrypoint("reconcile-develop.mjs", [], {
    env: { ...recoveryProvider, ...commonEnvironment },
  });
  assert.match(recovery.stdout, /ascendenza di develop riallineata/);
  assert.equal(recoveryProvider.calls().filter(({ key }) => key.startsWith("PATCH ")).length, 1);
  runEntrypoint("reconcile-develop.mjs", [], {
    env: { ...commonEnvironment, RECONCILIATION_APP_SLUG: "altra-app" },
    success: false,
  });
  runEntrypoint("reconcile-develop.mjs", [], {
    env: { ...commonEnvironment, GITHUB_TOKEN: "" },
    success: false,
  });

  const unavailableProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/git/ref/heads/main": [{ status: 503, body: {} }],
  });
  runEntrypoint("reconcile-develop.mjs", [], {
    env: { ...unavailableProvider, ...commonEnvironment },
    success: false,
  });
});

test("identità Shopify, ruleset, audit e Vite usano confini sintetici", async (t) => {
  const projectPath = path.join(await temporaryDirectory(t), "project.json");
  await writeFile(
    projectPath,
    JSON.stringify({
      adff48d4fe4ceb0dadb4734520701dd7: { dev_store_url: "cf-ready-dev.myshopify.com" },
    }),
  );
  const providerPath = await providerBin(t, {
    shopify: "exit 0",
    npm: `
if [ "$*" = "audit --json" ]; then
  printf '%s\\n' '{"auditReportVersion":2,"vulnerabilities":{},"metadata":{"vulnerabilities":{"total":0}}}'
  exit 0
fi
if [ "$*" = "exec vite dev" ]; then exit 0; fi
exit 3`,
  });
  const identity = runEntrypoint("shopify-info-safe.mjs", ["shopify.app.dev.toml"], {
    env: { PATH: providerPath, SHOPIFY_PROJECT_FILE: projectPath },
  });
  assert.match(identity.stdout, /Dev store verificato/);
  assert.match(
    runEntrypoint("security-audit.mjs", [], { env: { PATH: providerPath } }).stdout,
    /Security audit superato/,
  );
  runEntrypoint("vite-dev.mjs", [], { env: { PATH: providerPath } });

  const rulesetProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/rulesets": [{ id: 7, name: "develop governance" }],
    "GET /repos/owner/repository/rulesets/7": {
      name: "develop governance",
      enforcement: "active",
      target: "branch",
      bypass_actors: [{ actor_id: 123, actor_type: "Integration", bypass_mode: "always" }],
    },
  });
  const ruleset = runEntrypoint("verify-reconciliation-ruleset.mjs", [], {
    env: {
      ...rulesetProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      RECONCILIATION_TOKEN: "token-sintetico",
      RECONCILIATION_ACTOR_ID: "123",
    },
  });
  assert.match(ruleset.stdout, /Ruleset develop verificato/);

  const unavailableRulesetProvider = await fetchEnvironment(t, {
    "GET /repos/owner/repository/rulesets": [{ status: 503, body: {} }],
  });
  runEntrypoint("verify-reconciliation-ruleset.mjs", [], {
    env: {
      ...unavailableRulesetProvider,
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "owner/repository",
      RECONCILIATION_TOKEN: "token-sintetico",
      RECONCILIATION_ACTOR_ID: "123",
    },
    success: false,
  });
});

test("l'entrypoint scadenze usa tempo esplicito e non contatta provider", async (t) => {
  const result = runEntrypoint("credential-expiry.mjs", ["2026-09-01"]);
  assert.match(result.stdout, /Credenziali con scadenza registrata/);
  assert.match(
    runEntrypoint("credential-expiry.mjs").stdout,
    /Credenziali con scadenza registrata/,
  );

  const directory = await temporaryDirectory(t);
  await mkdir(path.join(directory, "docs", "runbooks"), { recursive: true });
  await writeFile(
    path.join(directory, "docs", "runbooks", "secret-inventory.md"),
    `## Scadenze

| Secret | Ambiente | Scadenza | Nota |
|---|---|---|---|
| \`VALID\` | Test | **2 settembre 2026** | fixture |
| \`MISSING\` | Test | non registrata | fixture |
| \`BAD_MONTH\` | Test | **2 nonmese 2026** | fixture |
| \`BAD_PARTS\` | Test | **2** | fixture |
`,
  );
  const invalidRegistry = runEntrypoint("credential-expiry.mjs", ["2026-09-01"], {
    cwd: directory,
    success: false,
  });
  assert.match(invalidRegistry.stdout, /::warning::VALID/);
  assert.match(invalidRegistry.stdout, /::error::MISSING/);
  assert.match(invalidRegistry.stdout, /::error::BAD_MONTH/);
  assert.match(invalidRegistry.stdout, /::error::BAD_PARTS/);
});

test("corsia CI e report D1 attraversano gli entrypoint con input sintetici", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = path.join(directory, "github-output.txt");
  const lane = runEntrypoint(
    "ci-lane.mjs",
    [
      "--base-sha",
      "sha-non-valido",
      "--head-sha",
      "sha-non-valido",
      "--base-ref",
      "develop",
      "--head-ref",
      "feature",
    ],
    { env: { GITHUB_OUTPUT: outputPath } },
  );
  assert.equal(JSON.parse(lane.stdout).lane, "full");
  assert.match(readFileSync(outputPath, "utf8"), /lane=full/);

  const performance = JSON.stringify([
    {
      success: true,
      results: [
        {
          metric_name: "LCP",
          app_version: "1.1.4",
          app_route: "all",
          sample_count: 100,
          p75: 2400,
        },
      ],
    },
  ]);
  const launch = JSON.stringify([
    {
      success: true,
      results: [
        {
          generated_at: "2026-09-01 12:00:00",
          stores_total: 0,
          stores_active: 0,
          installs_7d: 0,
          installs_30d: 0,
          onboarding_completed: 0,
          validations_enabled: 0,
          stores_with_open_error: 0,
          trials_active: 0,
          paying_or_paid_stores: 0,
          complimentary_stores: 0,
          error_events_7d: 0,
          failed_webhooks_7d: 0,
        },
      ],
    },
  ]);
  const providerPath = await providerBin(t, {
    npm: `
case "$*" in
  *"WITH recent AS"*) printf '%s\\n' '${performance}' ;;
  *"stores_total"*) printf '%s\\n' '${launch}' ;;
  *) exit 3 ;;
esac`,
  });
  const performanceResult = runEntrypoint("performance-report.mjs", ["development"], {
    env: { PATH: providerPath },
  });
  assert.equal(JSON.parse(performanceResult.stdout).groups[0].status, "pass");
  const launchResult = runEntrypoint("controlled-launch-report.mjs", ["production"], {
    env: { PATH: providerPath },
  });
  assert.equal(JSON.parse(launchResult.stdout).environment, "production");
});
