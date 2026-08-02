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
  assert.match(workflow, /npm install --global @shopify\/cli@4\.6\.0/);
  assert(
    workflow.indexOf("npm install --global @shopify/cli@4.6.0") < workflow.indexOf("npm run check"),
  );
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
  assert.doesNotMatch(workflow, /wrangler deploy(?:\s|$)/);
  assert.doesNotMatch(workflow, /shopify app deploy/);
  assert.match(workflow, /## Ricevuta deploy Pages Production/);
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
  assert.equal(wrangler.observability.logs.head_sampling_rate, 1);
  assert.equal(wrangler.observability.logs.invocation_logs, false);
  assert.equal(wrangler.observability.traces.enabled, false);
  assert.match(development, /## Ricevuta deploy Development/);
});

test("la manutenzione sicurezza resta periodica e in sola lettura", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/security-maintenance.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /cron: "17 6 1 \* \*"/);
  assert.match(workflow, /cron: "47 6 1 1,4,7,10 \*"/);
  assert.match(workflow, /npm run audit:security/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /npm run readback:dev/);
  assert.match(workflow, /required_status_checks/);
  assert.match(workflow, /dependency-review,promotion-guard,react-doctor,verify/);
  assert.match(workflow, /\.target == "branch"/);
  assert.match(workflow, /\.conditions\.ref_name\.include == \[\$ref\]/);
  assert.doesNotMatch(workflow, /and \\\s*$/m);
  assert.match(workflow, /name: Conferma mensile governance amministrativa/);
  assert.match(workflow, /needs: repository/);
  assert.match(workflow, /required reviewer max23468 e branch policy develop/);
  assert.match(workflow, /environment: Security governance/);
  assert.match(workflow, /nessun bypass actor, auto-merge attivo/);
  assert.doesNotMatch(workflow, /bypass_actors/);
  assert.doesNotMatch(workflow, /allow_auto_merge|delete_branch_on_merge/);
  assert.doesNotMatch(workflow, /branches\/$branch\/protection/);
  assert.equal((workflow.match(/test "\$GITHUB_REF" = "refs\/heads\/develop"/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /shopify app deploy|wrangler deploy|d1 migrations apply/);
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
      assert.match(page, /<main id="content">/);
      assert.match(page, /<button class="button" type="button" disabled>/);
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
