import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkDocs,
  htmlAnchors,
  htmlTargets,
  ignoredTrackedFiles,
  markdownAnchors,
  markdownTargets,
  xmlAnchors,
} from "./check-docs.mjs";

test("rileva link Markdown reference-style", () => {
  assert.deepEqual(markdownTargets("[Guida][setup]\n\n[setup]: docs/missing.md"), [
    "docs/missing.md",
  ]);
});

test("segnala riferimenti Markdown senza definizione", () => {
  const undefinedReferences = [];
  markdownTargets("[Guida][setup]", undefinedReferences);
  assert.deepEqual(undefinedReferences, ["setup"]);
});

test("ignora riferimenti Markdown commentati o sottoposti a escape", () => {
  const undefinedReferences = [];
  markdownTargets("<!-- [Guida][setup] -->\n\\[Guida][setup]", undefinedReferences);
  assert.deepEqual(undefinedReferences, []);
});

test("ignora reference nei titoli inline e rileva badge annidati", () => {
  const titleReferences = [];
  assert.deepEqual(markdownTargets('[ok](dest.md "display [not][a-reference]")', titleReferences), [
    "dest.md",
  ]);
  assert.deepEqual(titleReferences, []);

  const badgeReferences = [];
  assert.deepEqual(markdownTargets("[![CI](badge.svg)][workflow]", badgeReferences), ["badge.svg"]);
  assert.deepEqual(badgeReferences, ["workflow"]);
});

test("considera la parità degli escape Markdown", () => {
  assert.deepEqual(markdownTargets(String.raw`\[Doc](ignored.md)`), []);
  assert.deepEqual(markdownTargets(String.raw`\\[Doc](missing.md)`), ["missing.md"]);
});

test("calcola gli anchor GitHub ignorando i blocchi di codice", () => {
  const anchors = markdownAnchors("```\n# Does not exist\n```\n\n#### `shopify_sessions`");
  assert(!anchors.has("does-not-exist"));
  assert(anchors.has("shopify_sessions"));
  assert.deepEqual([...markdownAnchors("# Foo\n# Foo\n# Foo-1")], ["foo", "foo-1", "foo-1-1"]);
});

test("rileva riferimenti e anchor HTML", () => {
  const html =
    '<svg><symbol id="marchio"></symbol><use href=#marchio /><use xlink:href="legacy.svg#marchio" /><path clip-path="url(#cardclip)" style="mask: url(&quot;#monomask&quot;)" /><style>.icon{filter:url(#stylefilter)}</style></svg><!-- <style>.old{mask:url(old.svg)}</style><img src="old.svg"> --><script>"<style>.old{mask:url(old.svg)}</style>"</script><code>href=old.svg</code><div data-example="src=old.svg url(missing.svg)"></div>';
  assert.deepEqual(htmlTargets(html), [
    "#marchio",
    "legacy.svg#marchio",
    "#cardclip",
    "#monomask",
    "#stylefilter",
  ]);
  assert(htmlAnchors(html).has("marchio"));
});

test("usa soltanto id per i frammenti SVG e XML", () => {
  assert(!xmlAnchors('<symbol name="marchio"/>').has("marchio"));
  assert(xmlAnchors('<symbol id="marchio"/>').has("marchio"));
});

test("gestisce link root-relative, URI esterni e frammenti SVG", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    mkdirSync(join(repository, "docs"), { recursive: true });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(
      join(repository, "README.md"),
      "[Root](/../README.md)\n[Encoded](/docs/My%20File.md)\n[FTP](ftp://example.com/file)\n[Icon](docs/icon.svg#marchio)\n[Guide](docs/GUIDE.MARKDOWN#title)",
    );
    writeFileSync(join(repository, "docs/My File.md"), "# Encoded");
    writeFileSync(join(repository, "docs/GUIDE.MARKDOWN"), "# Title");
    writeFileSync(join(repository, "docs/icon.svg"), '<symbol id="marchio"/>');
    execFileSync("git", ["add", "."], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, []);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("valida i link nei file HTML senza distinzione di maiuscole", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(join(repository, "PAGE.HTML"), '<a href="missing.html">Missing</a>');
    execFileSync("git", ["add", "."], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, [
      "PAGE.HTML: link locale inesistente: missing.html",
    ]);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("ignora il vecchio percorso di un documento rinominato ma non staged", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(join(repository, "old.md"), "# Old");
    execFileSync("git", ["add", "."], { cwd: repository });
    rmSync(join(repository, "old.md"));
    writeFileSync(join(repository, "new.md"), "# New");

    assert.deepEqual(checkDocs(repository).errors, []);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("valida i riferimenti CSS nei file SVG", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(
      join(repository, "icon.svg"),
      '<svg><path clip-path="url(&quot;#missing&quot;)"/></svg>',
    );
    execFileSync("git", ["add", "."], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, [
      "icon.svg: anchor locale inesistente: #missing",
    ]);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("rileva output tracciati in directory ignorate annidate", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, ".gitignore"), "/app/build\n/extensions/*/dist\n");
    mkdirSync(join(repository, "app/build"), { recursive: true });
    mkdirSync(join(repository, "extensions/example/dist"), { recursive: true });
    writeFileSync(join(repository, "app/build/app.js"), "");
    writeFileSync(join(repository, "extensions/example/dist/function.wasm"), "");
    execFileSync(
      "git",
      ["add", "-f", ".gitignore", "app/build/app.js", "extensions/example/dist/function.wasm"],
      { cwd: repository },
    );

    assert.deepEqual(ignoredTrackedFiles(repository), [
      "app/build/app.js",
      "extensions/example/dist/function.wasm",
    ]);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("la CSP consente beacon e raccolta Cloudflare Web Analytics", () => {
  const headers = readFileSync(new URL("../site/_headers", import.meta.url), "utf8");
  assert.match(headers, /script-src .*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(headers, /connect-src .*https:\/\/cloudflareinsights\.com/);
});

test("non espone un comando locale per il deploy Pages Production", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["site:deploy"], undefined);
});

test("la toolchain e il peer Shopify sono riproducibili in locale e nei workflow", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lockfile = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  const tsconfig = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"));
  const npmrc = readFileSync(new URL("../.npmrc", import.meta.url), "utf8");
  const mise = readFileSync(new URL("../mise.toml", import.meta.url), "utf8");
  assert.equal(packageJson.packageManager, "npm@12.0.2");
  assert.equal(packageJson.engines.node, ">=26.7.0 <27");
  assert.equal(packageJson.devDependencies.typescript, "7.0.2");
  assert.equal(packageJson.devDependencies["@typescript/typescript6"], undefined);
  assert.equal(packageJson.allowScripts["fsevents@2.3.2"], false);
  assert.equal(
    packageJson.packageExtensions["@shopify/shopify-app-react-router@2.0.0"].peerDependencies[
      "react-router"
    ],
    "^7.18.2 || ^8.3.0",
  );
  assert.equal(lockfile.lockfileVersion, 4);
  assert.equal(lockfile.packages[""].engines.node, ">=26.7.0 <27");
  assert.equal(lockfile.packages[""].devDependencies.typescript, "7.0.2");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedSideEffectImports, true);
  assert.deepEqual(tsconfig.compilerOptions.lib, ["DOM", "ES2022"]);
  assert.equal(tsconfig.compilerOptions.ignoreDeprecations, undefined);
  assert.equal(tsconfig.compilerOptions.stableTypeOrdering, undefined);
  assert.match(npmrc, /^strict-allow-scripts=true$/m);
  assert.match(mise, /^node = "26\.7\.0"$/m);
  assert.match(mise, /^npm = "12\.0\.2"$/m);

  for (const path of [
    "ci.yml",
    "security-maintenance.yml",
    "backup-production.yml",
    "deploy-development.yml",
    "deploy-pages-production.yml",
  ]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${path}`, import.meta.url), "utf8");
    const nodeVersions = [...workflow.matchAll(/node-version:\s*([^\s]+)/g)].map(
      (match) => match[1],
    );
    assert(nodeVersions.length > 0, path);
    assert.deepEqual([...new Set(nodeVersions)], ["26.7.0"], path);
    assert.equal(
      workflow.match(/npm install --global npm@12\.0\.2/g)?.length,
      workflow.match(/npm ci/g)?.length,
      path,
    );
    if (/shopify app|npm run check/.test(workflow)) {
      assert.doesNotMatch(workflow, /@shopify\/cli@(?!4\.7\.0)/, path);
    }
  }

  for (const path of ["deploy-development.yml", "deploy-production.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${path}`, import.meta.url), "utf8");
    const credentials = workflow.indexOf("Verifica credenziali provider");
    const schema = workflow.indexOf("Verifica schema Function API");
    assert(credentials >= 0 && schema > credentials, path);
    assert.match(
      workflow.slice(schema, schema + 240),
      /SHOPIFY_APP_AUTOMATION_TOKEN:[\s\S]*npm run verify:function-schema/,
      path,
    );
  }

  const production = readFileSync(
    new URL("../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    production,
    /Verifica schema Function API[\s\S]*SHOPIFY_FUNCTION_SCHEMA_CONFIG: production/,
  );
});

test("il workflow Pages Production resta manuale, vincolato e verificabile", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-pages-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /wrangler pages deploy site/);
  assert.match(workflow, /--branch main/);
  assert.match(workflow, /--commit-hash "\$GITHUB_SHA"/);
  const shopifyCliInstall = "npm install --global --allow-scripts=esbuild @shopify/cli@4.7.0";
  assert.match(workflow, new RegExp(shopifyCliInstall.replaceAll(".", "\\.")));
  assert(workflow.indexOf(shopifyCliInstall) < workflow.indexOf("npm run check"));
  assert.match(workflow, /canonical_deployment\.deployment_trigger\.metadata\.commit_hash/);
  assert.match(workflow, /deployments\/\$ROLLBACK_ID\/rollback/);
  assert.match(workflow, /--header "Cache-Control: no-cache"/);
  assert.match(workflow, /printf '%s\\n' "\$GITHUB_SHA" > site\/deployment\.txt/);
  assert.match(workflow, /if curl --fail/);
  assert.match(workflow, /--location --max-redirs 5/);
  assert.match(workflow, /PAGES_DOMAIN\/deployment\.txt/);
  assert.match(workflow, /grep -Fxq "\$GITHUB_SHA"/);
  assert.match(workflow, /--write-out '%\{url_effective\}'/);
  assert.match(workflow, /test "\$published" = true/);
  assert(
    workflow.indexOf("Arma rollback Pages Production") <
      workflow.indexOf("wrangler pages deploy site"),
  );
  assert.match(workflow, /needs\.deploy\.outputs\.rollback_armed == 'true'/);
  assert.match(workflow, /needs\.deploy\.result != 'success'/);
  assert.doesNotMatch(workflow, /wrangler deploy(?:\s|$)/);
  assert.doesNotMatch(workflow, /shopify app deploy/);
  assert.match(workflow, /## Ricevuta deploy Pages Production/);
});

test("il rollback Production richiede uno snapshot Shopify e verifica il ripristino", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /Nessuna versione Shopify attiva da registrare per il rollback/);
  assert.match(workflow, /needs\.deploy\.result != 'success'/);
  assert.match(workflow, /needs\.deploy\.outputs\.worker_deploy_started == 'true'/);
  assert.match(workflow, /needs\.deploy\.outputs\.shopify_deploy_started == 'true'/);
  assert.match(workflow, /Arma rollback Worker Production/);
  assert.match(workflow, /Arma rollback Shopify Production/);
  assert(
    workflow.indexOf("Arma rollback Worker Production") <
      workflow.indexOf("Deploy Worker Production"),
  );
  assert(
    workflow.indexOf("Arma rollback Shopify Production") <
      workflow.indexOf("Deploy Shopify Production"),
  );
  assert.match(workflow, /if \[ "\$SHOPIFY_DEPLOY_STARTED" != "true" \]/);
  assert.match(workflow, /if \[ "\$WORKER_DEPLOY_STARTED" != "true" \]/);
  assert.match(workflow, /shopify-rollback-readback\.json/);
  assert.match(workflow, /worker-rollback-readback\.json/);
  assert.match(workflow, /Readback rollback Production non riuscito/);
});

test("il deploy Production provisiona entrambe le code webhook dichiarate", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /wrangler queues info "\$queue"/);
  assert.match(workflow, /cf-ready-webhooks-prod cf-ready-webhooks-prod-failures/);
  assert.match(workflow, /wrangler queues create "\$queue"/);
});

test("il backup Production cifra, ruota gli slot e prova il restore", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/backup-production.yml", import.meta.url),
    "utf8",
  );
  const schedule = readFileSync(
    new URL("../.github/workflows/schedule-backup-production.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(schedule, /schedule:/);
  assert.match(schedule, /gh workflow run backup-production\.yml .*--ref main/);
  assert.match(workflow, /environment: Production Backups/);
  assert.match(workflow, /wrangler d1 export "\$D1_DATABASE" --remote/);
  assert.match(workflow, /--output "\$RUNNER_TEMP\/d1\.sql" > \/dev\/null/);
  assert.match(workflow, /test -n "\$CLOUDFLARE_API_TOKEN"\n\s+test -n "\$D1_BACKUP_KEY"/);
  assert.doesNotMatch(workflow, /test -n "\$CLOUDFLARE_API_TOKEN" &&/);
  assert.match(workflow, /backup-crypto\.mjs encrypt/);
  assert.match(workflow, /backup-crypto\.mjs check-key/);
  assert.match(workflow, /wrangler r2 object put "\$R2_BUCKET\/\$weekly_key"/);
  assert.match(workflow, /wrangler r2 object get "\$R2_BUCKET\/\$WEEKLY_KEY"/);
  assert.match(workflow, /--jurisdiction eu/);
  assert.match(workflow, /backup-crypto\.mjs verify/);
  assert.match(workflow, /wrangler d1 execute DB --local/);
  assert.match(workflow, /monthly\/latest\.txt/);
  assert.doesNotMatch(workflow, /date -u \+%d/);
  assert.ok(
    workflow.indexOf("backup-crypto.mjs verify") < workflow.indexOf("wrangler r2 object put"),
  );
  assert.doesNotMatch(workflow, /d1 execute .*--remote/);
});

test("osservabilità sicura e ricevute restano configurate", () => {
  const wrangler = JSON.parse(readFileSync(new URL("../wrangler.json", import.meta.url), "utf8"));
  const development = readFileSync(
    new URL("../.github/workflows/deploy-development.yml", import.meta.url),
    "utf8",
  );
  const operations = readFileSync(
    new URL("../docs/runbooks/operations.md", import.meta.url),
    "utf8",
  );
  assert.equal(wrangler.observability.logs.head_sampling_rate, 1);
  assert.equal(wrangler.observability.logs.invocation_logs, false);
  assert.equal(wrangler.observability.traces.enabled, false);
  assert.match(development, /## Ricevuta deploy Development/);
  assert.match(development, /npm run capacity:dev/);
  assert.match(operations, /D1 storage per database \| 500 MB \| 250 MB/);
});

test("gli E2E pubblici sono eseguibili in CI senza sessione staff", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const playwright = readFileSync(
    new URL("../tests/playwright.config.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    packageJson.scripts["test:e2e"],
    "playwright test --config tests/playwright.config.ts",
  );
  assert.match(ci, /playwright install --with-deps chromium webkit/);
  assert.match(ci, /actions\/cache@[0-9a-f]{40}/);
  assert.match(ci, /key: playwright-\$\{\{ runner\.os \}\}/);
  assert.match(ci, /npm run test:e2e/);
  assert.match(readme, /playwright install chromium webkit/);
  assert.match(playwright, /fileURLToPath\(new URL\("\.\."/);
  assert.match(ci, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(ci, /path: test-results/);
  assert.match(playwright, /failOnFlakyTests: Boolean\(process\.env\.CI\)/);
  assert.match(playwright, /wrangler dev --config build\/server\/wrangler\.json/);
  assert.match(playwright, /npm run site:dev/);
  assert.doesNotMatch(playwright, /cf-ready-dev|cf-ready\.pages\.dev/);
});

test("la CI applica corsie proporzionate con required check stabili", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const doctor = readFileSync(
    new URL("../.github/workflows/react-doctor.yml", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(ci, /node scripts\/ci-lane\.mjs/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'docs'[\s\S]*npm run check:docs/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'standard'[\s\S]*npm run check:standard/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'full'[\s\S]*npm run check/);
  assert.match(ci, /lane == 'promotion'[\s\S]*node scripts\/github-gates\.mjs/);
  assert.match(doctor, /steps\.lane\.outputs\.react_doctor == 'true'/);
  assert.match(packageJson.scripts["check:docs"], /docs:check/);
  assert.match(packageJson.scripts["check:standard"], /typecheck/);
});

test("i deploy riusano i gate e conservano ricevute fuori dalle PR", () => {
  const development = readFileSync(
    new URL("../.github/workflows/deploy-development.yml", import.meta.url),
    "utf8",
  );
  const production = readFileSync(
    new URL("../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  for (const workflow of [development, production]) {
    assert.match(workflow, /REQUIRED_CHECKS:/);
    assert.match(workflow, /node scripts\/github-gates\.mjs/);
    assert.doesNotMatch(workflow, /run: npm run check\s/);
    assert.match(workflow, /node scripts\/deploy-receipt\.mjs/);
    assert.match(workflow, /deploy-receipt-[a-z]+-\$\{\{ github\.sha \}\}/);
  }
  assert.match(development, /developmentVersion/);
  assert.match(development, /git rev-parse 'HEAD\^\{tree\}'/);
  const developmentPreflight = development.indexOf("name: Preflight Development");
  const developmentBuild = development.indexOf("name: Costruisci Worker Development");
  const developmentDeploy = development.indexOf("name: Deploy Worker Development");
  assert.ok(
    developmentPreflight >= 0 &&
      developmentBuild > developmentPreflight &&
      developmentDeploy > developmentBuild,
  );
  assert.match(
    development.slice(developmentBuild, developmentDeploy),
    /if: env\.DEPLOY_READBACK_ONLY != 'true'[\s\S]*run: npm run build/,
  );
  assert.match(production, /actions\/attest@[0-9a-f]{40}/);
  assert.match(production, /attestations: write/);
  assert.match(production, /id-token: write/);
});

test("il riallineamento develop è separato dal deploy e fallisce chiuso", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/reconcile-develop.yml", import.meta.url),
    "utf8",
  );
  const script = readFileSync(new URL("./reconcile-develop.mjs", import.meta.url), "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[Deploy Production\]/);
  assert.match(workflow, /environment: Repository Governance/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(script, /parents\[1\] !== develop/);
  assert.match(script, /mainTree !== developTree/);
  assert.match(script, /bypass_actors/);
  assert.match(script, /deploy-receipt-production-/);
  assert.match(script, /actions\/workflows\/deploy-production\.yml\/runs/);
  assert.match(script, /force: false/);
  assert.match(script, /readback\.object\.sha/);
});

test("la manutenzione sicurezza resta periodica e in sola lettura", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const workflow = readFileSync(
    new URL("../.github/workflows/security-maintenance.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /cron: "17 6 1 \* \*"/);
  assert.match(workflow, /cron: "47 6 1 1,4,7,10 \*"/);
  assert.match(workflow, /npm run audit:security/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /npm run readback:dev/);
  assert.match(workflow, /node scripts\/credential-expiry\.mjs/);
  assert.match(workflow, /required_status_checks/);
  assert.match(workflow, /rulesets="\$\(gh api/);
  assert.match(workflow, /ruleset="\$\(gh api/);
  assert.match(workflow, /codex-review,dependency-review,e2e,promotion-guard,react-doctor,verify/);
  assert.match(workflow, /gh workflow list --all/);
  assert.match(workflow, /workflows="\$\(gh workflow list/);
  assert.match(workflow, /test -n "\$workflows"/);
  assert.match(workflow, /--status completed --limit 1/);
  assert.match(workflow, /startswith\("\.github\/workflows\/"\)/);
  assert.match(workflow, /dependabot\/alerts code-scanning\/alerts secret-scanning\/alerts/);
  assert.match(workflow, /--paginate --slurp/);
  assert.match(workflow, /alerts="\$\(gh api/);
  assert.match(workflow, /alert_count="\$\(jq/);
  assert.match(workflow, /security-events: read/);
  assert.match(workflow, /name: Security Maintenance\n\s+deployment: false/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.SECURITY_AUDIT_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /success\|skipped\|neutral\|never/);
  assert.match(workflow, /\.path != "\.github\/workflows\/security-maintenance\.yml"/);
  assert.doesNotMatch(ci, /allow-ghsas:/);
  assert.match(workflow, /\.target == "branch"/);
  assert.match(workflow, /\.conditions\.ref_name\.include == \[\$ref\]/);
  for (const [, singleQuoted] of workflow.matchAll(/'([^']*)'/g)) {
    assert.doesNotMatch(singleQuoted, /\\/);
  }
  assert.doesNotMatch(workflow, /Security governance|required reviewer|approval|approvazione/);
  assert.doesNotMatch(workflow, /bypass_actors/);
  assert.doesNotMatch(workflow, /allow_auto_merge|delete_branch_on_merge/);
  assert.doesNotMatch(workflow, /branches\/$branch\/protection/);
  assert.equal((workflow.match(/test "\$GITHUB_REF" = "refs\/heads\/develop"/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /shopify app deploy|wrangler deploy|d1 migrations apply/);
});

test("il gate Codex esegue soltanto codice fidato e non fallisce sui finding", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/codex-review-gate.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /group: codex-review-\$\{\{ github\.event\.pull_request\.number \|\| github\.event\.issue\.number \|\| inputs\.pull_request \}\}/,
  );
  assert.match(workflow, /github\.event\.repository\.default_branch/);
  assert.match(workflow, /issues: read/);
  assert.doesNotMatch(workflow, /issues: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /statuses: write/);
  assert.match(workflow, /node --test scripts\/codex-review-gate\.test\.mjs/);
  assert.match(workflow, /node scripts\/codex-review-gate\.mjs/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/);
  const gate = readFileSync(new URL("./codex-review-gate.mjs", import.meta.url), "utf8");
  assert.match(gate, /isAutomaticFirstReview/);
  assert.match(gate, /latestCodexInvocation/);
  assert.match(gate, /\["P0", "P1"\]/);
  assert.match(gate, /resolveReviewThread/);
  assert.match(gate, /ADVISORY_REPORT_PATH/);
  assert.doesNotMatch(gate, /issues\/\$\{number\}\/comments[\s\S]*method: "POST"/);
  assert.match(gate, /Didn't find any major issues/);
  assert.match(gate, /pulls\/\$\{number\}\/reviews/);
  assert.match(gate, /Review Codex non conclusa entro cinque ore/);
  const plan = readFileSync(
    new URL("../docs/plans/2026-07-28-CF-Ready-Master-Plan.md", import.meta.url),
    "utf8",
  );
  assert.match(plan, /il\s+primo giro non richiede `@codex review`/);
  assert.match(plan, /P2\/P3[\s\S]*thread vengono risolti\s+automaticamente/);
  const maintenance = readFileSync(
    new URL("../.github/workflows/security-maintenance.yml", import.meta.url),
    "utf8",
  );
  assert.match(maintenance, /cancelled[\s\S]*codex-review-gate\.yml/);
});

test("README e indice non duplicano la versione corrente", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const index = readFileSync(new URL("../docs/INDEX.md", import.meta.url), "utf8");
  const security = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");
  const contributing = readFileSync(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /\b0\.\d+\.\d+\b/);
  assert.doesNotMatch(readme, /\bM\d+\b|progetto è in sviluppo/i);
  assert.doesNotMatch(index, /\b0\.\d+\.\d+\b/);
  assert.doesNotMatch(
    `${security}\n${contributing}`,
    /ancora in sviluppo|non ha release pubbliche/i,
  );
});

// Il nome della persona fisica titolare non deve entrare in un repository pubblico:
// nei sorgenti sta il segnaposto e il workflow Pages lo sostituisce al deploy. Se
// qualcuno scrive il nome qui, questo test lo ferma prima del commit.
test("l'identità del titolare resta un segnaposto e i documenti legali non sono indicizzabili", () => {
  const legal = ["privacy.html", "terms.html", "en/privacy.html", "en/terms.html"];
  for (const file of legal) {
    const page = readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8");
    assert.match(page, /<strong>__OWNER_NAME__<\/strong>/);
  }

  // Righe confrontate come stringhe: una regex costruita dai percorsi andrebbe
  // sottoposta a escape, e un escape parziale cambierebbe in silenzio il pattern.
  const lines = readFileSync(new URL("../site/_headers", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim());

  for (const route of ["/privacy*", "/terms*", "/en/privacy*", "/en/terms*"]) {
    const index = lines.indexOf(route);
    assert.notEqual(index, -1, `manca la regola per ${route}`);
    assert.equal(lines[index + 1], "X-Robots-Tag: noindex", `manca il noindex per ${route}`);
  }

  // Il noindex vale solo dove compare il nome: la Home e l'assistenza restano indicizzabili.
  assert.deepEqual(
    lines.filter((line) => line.startsWith("/") && !line.startsWith("/*")),
    ["/privacy*", "/terms*", "/en/privacy*", "/en/terms*"],
  );
});

test("il sito italiano e inglese mantiene il contratto pubblico essenziale", () => {
  const pairs = [
    ["index.html", "en/index.html"],
    ["support.html", "en/support.html"],
    ["privacy.html", "en/privacy.html"],
    ["terms.html", "en/terms.html"],
  ].map((pair) =>
    pair.map((file) => readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8")),
  );

  for (const [italian, english] of pairs) {
    for (const page of [italian, english]) {
      assert.match(page, /<a class="skip-link" href="#content">/);
      assert.match(page, /<main id="content" tabindex="-1">/);
      assert.match(page, /<a class="button" href="https:\/\/apps\.shopify\.com\/cf-ready">/);
      assert.doesNotMatch(page, /href="[^"]*\.html/);
    }
    assert.equal((italian.match(/<h2>/g) ?? []).length, (english.match(/<h2>/g) ?? []).length);
  }

  assert.match(pairs[2][0], /non viene inviato ai nostri sistemi, non viene registrato/);
  assert.match(pairs[2][1], /never sent to our systems, never logged/);
  assert.match(pairs[3][0], /cancella automaticamente l’abbonamento ricorrente/);
  assert.match(pairs[3][1], /automatically cancels the recurring subscription/);
  assert.deepEqual(
    new Set(
      pairs
        .flat()
        .flatMap((page) => [...page.matchAll(/mailto:([^?"]+)/g)].map((match) => match[1])),
    ),
    new Set(["cfready@icloud.com"]),
  );
});
