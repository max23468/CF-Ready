import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkDocs,
  htmlAnchors,
  htmlTargets,
  ignoredTrackedFiles,
  localMachinePaths,
  markdownAnchors,
  markdownTargets,
  xmlAnchors,
} from "./check-docs.mjs";

test("rifiuta percorsi assoluti legati alla macchina locale", () => {
  assert.deepEqual(
    localMachinePaths(
      "`/Users/example/project/evidence.png` /home/example/report.json C:\\Users\\example\\report.json",
    ),
    [
      "/Users/example/project/evidence.png",
      "/home/example/report.json",
      "C:\\Users\\example\\report.json",
    ],
  );
});

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

test("risolve gli URL di directory HTML sul relativo index", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    mkdirSync(join(repository, "site/guide"), { recursive: true });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(join(repository, "site/index.html"), '<section id="guide"></section>');
    writeFileSync(join(repository, "site/guide/example.html"), '<a href="../#guide">Guide</a>');
    execFileSync("git", ["add", "."], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, []);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("risolve gli URL root-relative HTML dalla radice del sito statico", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    mkdirSync(join(repository, "site/assets"), { recursive: true });
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    writeFileSync(join(repository, "site/assets/icon.svg"), '<svg id="icon"></svg>');
    writeFileSync(join(repository, "site/404.html"), '<img src="/assets/icon.svg#icon">');
    execFileSync("git", ["add", "."], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, []);
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

const indexableSitePages = new Map([
  ["site/index.html", "https://cf-ready.pages.dev/"],
  ["site/en/index.html", "https://cf-ready.pages.dev/en/"],
  ["site/support.html", "https://cf-ready.pages.dev/support"],
  ["site/en/support.html", "https://cf-ready.pages.dev/en/support"],
  [
    "site/guide/codice-fiscale-obbligatorio-shopify.html",
    "https://cf-ready.pages.dev/guide/codice-fiscale-obbligatorio-shopify",
  ],
  [
    "site/en/guides/required-codice-fiscale-shopify-checkout.html",
    "https://cf-ready.pages.dev/en/guides/required-codice-fiscale-shopify-checkout",
  ],
  [
    "site/guide/campi-fiscali-shopify-codice-fiscale-pec.html",
    "https://cf-ready.pages.dev/guide/campi-fiscali-shopify-codice-fiscale-pec",
  ],
  [
    "site/en/guides/shopify-italian-tax-fields-codice-fiscale-pec.html",
    "https://cf-ready.pages.dev/en/guides/shopify-italian-tax-fields-codice-fiscale-pec",
  ],
  [
    "site/guide/indirizzo-2-codice-fiscale-shopify.html",
    "https://cf-ready.pages.dev/guide/indirizzo-2-codice-fiscale-shopify",
  ],
  [
    "site/en/guides/address-2-codice-fiscale-shopify.html",
    "https://cf-ready.pages.dev/en/guides/address-2-codice-fiscale-shopify",
  ],
  [
    "site/guide/validazione-codice-fiscale-shopify.html",
    "https://cf-ready.pages.dev/guide/validazione-codice-fiscale-shopify",
  ],
  [
    "site/en/guides/validate-codice-fiscale-shopify.html",
    "https://cf-ready.pages.dev/en/guides/validate-codice-fiscale-shopify",
  ],
]);

test("le pagine indicizzabili dichiarano canonical, lingue e metadati sociali", () => {
  for (const [path, canonical] of indexableSitePages) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /<title>[^<]+<\/title>/, path);
    assert.match(html, /<meta name="description" content="[^"]+">/, path);
    assert.match(html, /<h1(?: class="[^"]+")?>[^<]+<\/h1>/, path);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`), path);
    for (const language of ["it", "en", "x-default"]) {
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="${language}"`), path);
    }
    assert.match(html, /<meta property="og:title"/, path);
    assert.match(html, /<meta property="og:url"/, path);
    assert.match(
      html,
      /<meta property="og:image" content="https:\/\/cf-ready\.pages\.dev\/assets\/cf-ready-app-preview\.png">/,
      path,
    );
    assert.match(html, /<meta property="og:image:type" content="image\/png">/, path);
    assert.match(html, /<meta property="og:image:width" content="1600">/, path);
    assert.match(html, /<meta property="og:image:height" content="900">/, path);
    assert.match(html, /<meta property="og:image:alt" content="[^"]+">/, path);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, path);
    assert.match(
      html,
      /<meta name="twitter:image" content="https:\/\/cf-ready\.pages\.dev\/assets\/cf-ready-app-preview\.png">/,
      path,
    );
    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1, path);
  }
});

test("la Home espone il token di verifica Google Search Console", () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const verificationTag =
    '<meta name="google-site-verification" content="pomXU4nkD8bOvThHT5IssaCXE9geVRjGa8N2xH4CkBk">';
  assert.equal(html.split(verificationTag).length - 1, 1);
  assert.ok(html.indexOf(verificationTag) < html.indexOf("</head>"));
});

test("l’anteprima sociale è un PNG pubblico nelle dimensioni dichiarate", () => {
  const image = readFileSync(new URL("../site/assets/cf-ready-app-preview.png", import.meta.url));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(image.readUInt32BE(16), 1600);
  assert.equal(image.readUInt32BE(20), 900);
});

test("le schermate prodotto riservano lo spazio prima del caricamento", () => {
  for (const path of ["site/index.html", "site/en/index.html"]) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const screenshots = [...html.matchAll(/<img class="product-shot"[^>]+>/g)];
    assert.equal(screenshots.length, 3, path);
    for (const [tag] of screenshots) {
      assert.match(tag, /width="1600"/, path);
      assert.match(tag, /height="900"/, path);
      assert.match(tag, /alt="[^"]+"/, path);
    }
  }
});

test("il menu calcola la sezione attiva nell’ordine del documento", () => {
  const menu = readFileSync(new URL("../site/menu.js", import.meta.url), "utf8");
  assert.match(menu, /compareDocumentPosition/);
  assert.match(menu, /Node\.DOCUMENT_POSITION_FOLLOWING/);
});

test("le fasce senza titolo e il corpo delle guide usano contenitori non sezionanti", () => {
  for (const path of ["site/index.html", "site/en/index.html"]) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /<div class="facts">/, path);
    assert.doesNotMatch(html, /<section class="facts">/, path);
  }

  for (const path of [...indexableSitePages.keys()].filter((path) => path.includes("guide"))) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /<div class="divided article-section"><article/, path);
    assert.doesNotMatch(html, /<section class="divided"><article/, path);
  }
});

test("sitemap e robots espongono solo URL indicizzabili canonici", () => {
  const sitemap = readFileSync(new URL("../site/sitemap.xml", import.meta.url), "utf8");
  const robots = readFileSync(new URL("../site/robots.txt", import.meta.url), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, [...indexableSitePages.values()]);
  assert.doesNotMatch(sitemap, /\/privacy|\/terms|\/404/);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/cf-ready\.pages\.dev\/sitemap\.xml$/m);
});

test("i dati strutturati restano verificabili e non inventano prezzo o recensioni", () => {
  const home = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  assert.match(home, /"@type":"Organization"/);
  assert.match(home, /"@type":"WebSite"/);
  assert.doesNotMatch(home, /SoftwareApplication|aggregateRating|"offers"/);

  for (const path of [...indexableSitePages.keys()].filter((path) => path.includes("guide"))) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /"@type":"BreadcrumbList"/, path);
    assert.doesNotMatch(html, /SoftwareApplication|aggregateRating|"offers"/, path);
  }
});

test("la pagina 404 è dedicata e fuori dall’indice", () => {
  const notFound = readFileSync(new URL("../site/404.html", import.meta.url), "utf8");
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /<title>Pagina non trovata — CF Ready<\/title>/);
  assert.doesNotMatch(notFound, /rel="canonical"/);
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
  assert.match(workflow, /robots\.txt/);
  assert.match(workflow, /sitemap\.xml/);
  assert.match(workflow, /cmp --silent site\/robots\.txt/);
  assert.match(workflow, /cmp --silent site\/sitemap\.xml/);
  assert.match(workflow, /og:image/);
  assert.match(workflow, /BreadcrumbList/);
  assert.match(workflow, /social-image-headers\.txt/);
  assert.match(workflow, /test "\$not_found_status" = "404"/);
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

test("il link assistenza rispetta il manifest corrente delle Admin Link extension", () => {
  const manifest = readFileSync(
    new URL("../extensions/support-link/shopify.extension.toml", import.meta.url),
    "utf8",
  );
  const english = JSON.parse(
    readFileSync(
      new URL("../extensions/support-link/locales/en.default.json", import.meta.url),
      "utf8",
    ),
  );
  const italian = JSON.parse(
    readFileSync(new URL("../extensions/support-link/locales/it.json", import.meta.url), "utf8"),
  );

  assert.match(manifest, /^name = "t:name"$/m);
  assert.match(manifest, /^type = "admin_link"$/m);
  assert.match(manifest, /^target = "admin\.app\.support\.link"$/m);
  assert.match(manifest, /^url = "app:\/\/app\/guide"$/m);
  const routes = readFileSync(new URL("../app/routes.ts", import.meta.url), "utf8");
  assert.match(routes, /route\("app"[\s\S]*route\("guide", "routes\/app\.guide\.tsx"\)/);
  // Il template support-link corrente espone il testo tramite `extensions.name`: né la radice
  // né il target accettano i campi delle UI extension. La CLI bloccherebbe altrimenti anche i
  // comandi della Function prima di poter verificare o distribuire lo schema.
  assert.doesNotMatch(manifest, /^api_version\s*=/m);
  assert.doesNotMatch(manifest, /^text\s*=/m);
  assert.deepEqual(english, { name: "Get support" });
  assert.deepEqual(italian, { name: "Richiedi assistenza" });
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
  const policy = readFileSync(
    new URL("../.github/workflows/ci-policy.yml", import.meta.url),
    "utf8",
  );
  const doctor = readFileSync(
    new URL("../.github/workflows/react-doctor.yml", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(ci, /node scripts\/ci-lane\.mjs/);
  assert.match(ci, /checks: read/);
  assert.match(ci, /statuses: read/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'docs'[\s\S]*npm run check:docs/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'standard'[\s\S]*npm run check:standard/);
  assert.match(ci, /needs\.lane\.outputs\.lane == 'full'[\s\S]*npm run check/);
  assert.match(ci, /lane == 'promotion'[\s\S]*node scripts\/github-gates\.mjs/);
  assert.match(doctor, /steps\.lane\.outputs\.react_doctor == 'true'/);
  assert.match(policy, /pull_request_target:/);
  assert.match(policy, /labeled, unlabeled/);
  assert.match(policy, /statuses: write/);
  assert.match(policy, /node scripts\/ci-policy-check\.mjs/);
  assert.match(policy, /persist-credentials: false/);
  assert.doesNotMatch(policy, /pull_request\.head|gh pr checkout|git fetch|npm (?:ci|install)/);
  assert.match(packageJson.scripts["check:docs"], /docs:check/);
  assert.match(packageJson.scripts["check:standard"], /typecheck/);
});

test("gli entrypoint operativi usano un rilevamento di esecuzione portabile", () => {
  const scripts = readdirSync(new URL(".", import.meta.url)).filter((file) =>
    file.endsWith(".mjs"),
  );
  for (const script of scripts) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");
    assert.doesNotMatch(source, /import\.meta\.main/, script);
  }
  for (const script of ["ci-lane.mjs", "reconcile-develop.mjs"]) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");
    assert.match(source, /pathToFileURL\(process\.argv\[1\]\)\.href/, script);
  }
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

test("la preparazione tardiva della release resta un forward-fix verificato", () => {
  const plan = readFileSync(
    new URL("../docs/plans/2026-07-28-CF-Ready-Master-Plan.md", import.meta.url),
    "utf8",
  );
  assert.match(plan, /autorizza Production soltanto dopo l'integrazione/);
  assert.match(
    plan,
    /PR preparatoria che modifica esclusivamente manifest, lockfile, changelog,[\s\S]*regressioni mirate della relativa policy/,
  );
  assert.match(plan, /gate completo e il deploy\s+Development exact-HEAD/);
  assert.match(plan, /non è una PR di ricevuta o di\s+chiusura/);
});

test("il riallineamento develop è separato dal deploy e fallisce chiuso", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/reconcile-develop.yml", import.meta.url),
    "utf8",
  );
  const script = readFileSync(new URL("./reconcile-develop.mjs", import.meta.url), "utf8");
  const rulesetVerifier = readFileSync(
    new URL("./verify-reconciliation-ruleset.mjs", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[Deploy Production\]/);
  assert.match(workflow, /environment: Repository Governance/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /SOURCE_DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(
    workflow,
    /RECONCILIATION_APP_SLUG: \$\{\{ steps\.app-token\.outputs\.app-slug \}\}/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /Verifica bypass unico del ruleset develop/);
  assert.match(workflow, /RECONCILIATION_ACTOR_ID: "4735849"/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && github\.ref_name/);
  assert.match(script, /parents\[1\] !== develop/);
  assert.match(script, /mainTree !== developTree/);
  assert.match(script, /deploy-receipt-production-/);
  assert.match(script, /actions\/workflows\/deploy-production\.yml\/runs/);
  assert.match(script, /force: false/);
  assert.match(rulesetVerifier, /bypass_actors/);
  assert.match(script, /recover develop ancestry after main promotion/);
  assert.match(script, /eventName !== "workflow_dispatch"/);
  assert.match(script, /tree: develop\.tree\.sha/);
  assert.match(script, /comparison\.merge_base_commit\?\.sha !== promotedDevelop/);
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
  assert.match(workflow, /ci-policy,dependency-review,e2e,promotion-guard,react-doctor,verify/);
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

  // Il noindex vale sui documenti con l'identità e sulla risposta 404: Home,
  // assistenza e guide restano indicizzabili.
  assert.deepEqual(
    lines.filter((line) => line.startsWith("/") && !line.startsWith("/*")),
    ["/privacy*", "/terms*", "/en/privacy*", "/en/terms*", "/404*"],
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
