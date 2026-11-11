import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
import { diffCheckBase, runDiffCheck } from "./diff-check.mjs";
import { loadWorkerConfig } from "./worker-config.mjs";
import { preparePagesSite } from "./prepare-pages-site.mjs";
import {
  assertNeeds,
  assertStepOrder,
  commands,
  findStep,
  loadAction,
  loadWorkflow,
  stepProducing,
} from "./workflow-test-support.mjs";

function assertPermissions(workflow, expected) {
  assert.deepEqual(workflow.permissions, expected);
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.permissions, undefined);
  }
}

function assertAllMatch(text, patterns) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

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

test("copre sintassi HTML, entità e reference Markdown ai margini del contratto", () => {
  assert.deepEqual(
    htmlTargets(
      `<1 non-tag><a disabled href='first&amp;second.html' data-unquoted=value>` +
        `<img src=asset.svg><path fill="url(&#35;decimal)" stroke="url(&#x23;hex)" ` +
        `cursor="url(&#x110000;)"/><broken title="senza chiusura>`,
    ),
    ["first&second.html", "asset.svg", "#decimal", "#hex", "&#x110000;"],
  );
  assert.deepEqual(
    [...markdownAnchors("# Immagine ![Alt testo](asset.svg)\n# Solo **figli**")],
    ["immagine-alt-testo", "solo-figli"],
  );

  for (const source of ["testo [aperto", "[testo]x", "[testo][aperto", "testo normale"]) {
    const undefinedReferences = [];
    markdownTargets(source, undefinedReferences);
    assert.deepEqual(undefinedReferences, []);
  }

  const compactReferences = [];
  markdownTargets("[Etichetta][]\n[Testo [annidato]][missing]", compactReferences);
  assert.deepEqual(compactReferences, ["etichetta", "missing"]);

  const escapedBracket = [];
  markdownTargets(String.raw`[Testo \] ancora][missing]`, escapedBracket);
  assert.deepEqual(escapedBracket, ["missing"]);
});

test("il controllo integrato segnala ogni classe di riferimento locale non valido", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-errors-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    mkdirSync(join(repository, "docs"), { recursive: true });
    writeFileSync(join(repository, "package.json"), '{"scripts":{"known":"true"}}');
    writeFileSync(join(repository, "plain.txt"), "nessun anchor");
    writeFileSync(
      join(repository, "docs", "source.md"),
      [
        "[Fuori](../../outside.md)",
        "[Manca](missing.md)",
        "[Senza parser](../plain.txt#fragment)",
        "[README uno](../README.md#first)",
        "[README due](../README.md#missing)",
        "[Reference][undefined]",
        "`/Users/example/segreto`",
        "npm run absent",
      ].join("\n"),
    );
    writeFileSync(join(repository, "README.md"), "# First\n");
    execFileSync("git", ["add", "."], { cwd: repository });

    const errors = checkDocs(repository).errors.join("\n");
    assert.match(errors, /percorso locale non riproducibile/);
    assert.match(errors, /riferimento Markdown senza definizione: undefined/);
    assert.match(errors, /link locale fuori repository/);
    assert.match(errors, /link locale inesistente: missing.md/);
    assert.match(errors, /anchor locale inesistente: \.\.\/README\.md#missing/);
    assert.match(errors, /script npm inesistente: absent/);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("il controllo integrato risolve URL HTML senza estensione e rileva file ignorati", () => {
  const repository = mkdtempSync(join(tmpdir(), "cf-ready-docs-html-fallback-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(repository, ".gitignore"), "generated/\n");
    writeFileSync(join(repository, "package.json"), '{"scripts":{}}');
    mkdirSync(join(repository, "site"), { recursive: true });
    mkdirSync(join(repository, "generated"), { recursive: true });
    writeFileSync(join(repository, "site", "index.html"), '<a href="support">Supporto</a>');
    writeFileSync(join(repository, "site", "support.html"), "<h1>Supporto</h1>");
    writeFileSync(join(repository, "generated", "proof.md"), "# Generato");
    execFileSync("git", ["add", ".gitignore", "package.json", "site"], { cwd: repository });
    execFileSync("git", ["add", "-f", "generated/proof.md"], { cwd: repository });

    assert.deepEqual(checkDocs(repository).errors, ["generated/proof.md: file ignorato tracciato"]);
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
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

test("la CSP consente il manifest locale, beacon e raccolta Cloudflare Web Analytics", () => {
  const headers = readFileSync(new URL("../site/_headers", import.meta.url), "utf8");
  assert.match(headers, /(?:^|;)\s*manifest-src 'self'(?:;|$)/m);
  assert.match(headers, /default-src 'none'/);
  assert.match(headers, /script-src .*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(headers, /connect-src .*https:\/\/cloudflareinsights\.com/);
});

test("prepara Pages con nomi asset legati al contenuto", () => {
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-pages-"));
  const output = join(directory, "output");
  try {
    const assets = preparePagesSite(fileURLToPath(new URL("../site", import.meta.url)), output);
    assert.match(assets["menu.js"], /^menu\.[0-9a-f]{12}\.js$/);
    assert.match(assets["style.css"], /^style\.[0-9a-f]{12}\.css$/);
    assert.equal(existsSync(join(output, "menu.js")), false);
    assert.equal(existsSync(join(output, "style.css")), false);
    assert.equal(
      readFileSync(join(output, assets["menu.js"]), "utf8"),
      readFileSync(new URL("../site/menu.js", import.meta.url), "utf8"),
    );
    const home = readFileSync(join(output, "index.html"), "utf8");
    assert.match(home, new RegExp(`src="${assets["menu.js"].replace(".", "\\.")}"`));
    assert.match(home, new RegExp(`href="${assets["style.css"].replace(".", "\\.")}"`));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("il preparatore Pages rifiuta destinazioni ambigue e argomenti incompleti", () => {
  const site = fileURLToPath(new URL("../site", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "cf-ready-pages-entrypoint-"));
  const output = join(directory, "output");
  assert.throws(
    () => preparePagesSite(site, site),
    /directory Pages preparata deve essere distinta dalla sorgente/,
  );
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL("./prepare-pages-site.mjs", import.meta.url))],
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      ),
    /Uso: prepare-pages-site\.mjs/,
  );
  try {
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./prepare-pages-site.mjs", import.meta.url)), site, output],
      { stdio: "pipe" },
    );
    assert.equal(
      readdirSync(output).some((name) => /^menu\.[0-9a-f]{12}\.js$/.test(name)),
      true,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

const indexableSitePages = new Map([
  ["site/index.html", "https://cfready.it/"],
  ["site/en/index.html", "https://cfready.it/en/"],
  ["site/support.html", "https://cfready.it/support"],
  ["site/en/support.html", "https://cfready.it/en/support"],
  [
    "site/guide/codice-fiscale-obbligatorio-shopify.html",
    "https://cfready.it/guide/codice-fiscale-obbligatorio-shopify",
  ],
  [
    "site/en/guides/required-codice-fiscale-shopify-checkout.html",
    "https://cfready.it/en/guides/required-codice-fiscale-shopify-checkout",
  ],
  [
    "site/guide/campi-fiscali-shopify-codice-fiscale-pec.html",
    "https://cfready.it/guide/campi-fiscali-shopify-codice-fiscale-pec",
  ],
  [
    "site/en/guides/shopify-italian-tax-fields-codice-fiscale-pec.html",
    "https://cfready.it/en/guides/shopify-italian-tax-fields-codice-fiscale-pec",
  ],
  [
    "site/guide/indirizzo-2-codice-fiscale-shopify.html",
    "https://cfready.it/guide/indirizzo-2-codice-fiscale-shopify",
  ],
  [
    "site/en/guides/address-2-codice-fiscale-shopify.html",
    "https://cfready.it/en/guides/address-2-codice-fiscale-shopify",
  ],
  [
    "site/guide/validazione-codice-fiscale-shopify.html",
    "https://cfready.it/guide/validazione-codice-fiscale-shopify",
  ],
  [
    "site/en/guides/validate-codice-fiscale-shopify.html",
    "https://cfready.it/en/guides/validate-codice-fiscale-shopify",
  ],
]);

const siteHtmlPages = readdirSync(new URL("../site", import.meta.url), { recursive: true })
  .filter((path) => path.endsWith(".html"))
  .sort();

test("ogni pagina HTML pubblica mantiene metadati e alternative testuali", () => {
  for (const file of siteHtmlPages) {
    const html = readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8");
    assert.equal([...html.matchAll(/<title(?:\s[^>]*)?>[^<]+<\/title>/g)].length, 1, file);
    assert.equal(
      [...html.matchAll(/<meta name="description" content="[^"]+"(?:\s[^>]*)?>/g)].length,
      1,
      file,
    );
    assert.equal(
      [...html.matchAll(/<meta name="viewport" content="width=device-width, initial-scale=1">/g)]
        .length,
      1,
      file,
    );
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /\balt=(?:"[^"]*"|'[^']*')/, `${file}: ${tag}`);
    }
  }
});

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
      /<meta property="og:image" content="https:\/\/cfready\.it\/assets\/cf-ready-app-preview\.png">/,
      path,
    );
    assert.match(html, /<meta property="og:image:type" content="image\/png">/, path);
    assert.match(html, /<meta property="og:image:width" content="1600">/, path);
    assert.match(html, /<meta property="og:image:height" content="900">/, path);
    assert.match(html, /<meta property="og:image:alt" content="[^"]+">/, path);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, path);
    assert.match(
      html,
      /<meta name="twitter:image" content="https:\/\/cfready\.it\/assets\/cf-ready-app-preview\.png">/,
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

test("ogni pagina pubblica espone il set favicon multipiattaforma", () => {
  const tags = [
    '<link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">',
    '<meta name="apple-mobile-web-app-title" content="CF Ready">',
    '<link rel="manifest" href="/site.webmanifest">',
    '<meta name="theme-color" content="#F7F5EE">',
  ];

  for (const path of siteHtmlPages) {
    const html = readFileSync(new URL(`../site/${path}`, import.meta.url), "utf8");
    for (const tag of tags) assert.equal(html.split(tag).length - 1, 1, `${path}: ${tag}`);
  }

  for (const [file, width, height] of [
    ["favicon-96x96.png", 96, 96],
    ["apple-touch-icon.png", 180, 180],
    ["web-app-manifest-192x192.png", 192, 192],
    ["web-app-manifest-512x512.png", 512, 512],
  ]) {
    const image = readFileSync(new URL(`../site/${file}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString("ascii"), "PNG", file);
    assert.equal(image.readUInt32BE(16), width, file);
    assert.equal(image.readUInt32BE(20), height, file);
  }

  const icon = readFileSync(new URL("../site/favicon.ico", import.meta.url));
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 3);

  const manifest = JSON.parse(
    readFileSync(new URL("../site/site.webmanifest", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
    [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: undefined,
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  );
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
  assert.match(menu, /export function initializeMenu/);
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
  assert.match(robots, /^Content-signal: search=yes, ai-input=yes, ai-train=no, use=reference$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/cfready\.it\/sitemap\.xml$/m);
});

test("security.txt segue RFC 9116 senza rinviare al repository", () => {
  const securityTxt = readFileSync(
    new URL("../site/.well-known/security.txt", import.meta.url),
    "utf8",
  );
  const field = (name) => securityTxt.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];
  assert.equal(field("Contact"), "mailto:info@cfready.it");
  assert.equal(field("Canonical"), "https://cfready.it/.well-known/security.txt");
  assert.equal(field("Policy"), "https://cfready.it/en/support");
  assert.equal(field("Preferred-Languages"), "it, en");
  // RFC 9116 chiede una scadenza entro un anno: il test la ricorda prima che scada.
  const expires = Date.parse(field("Expires"));
  assert(expires > Date.now(), "security.txt è scaduto: aggiorna Expires");
  assert(expires - Date.now() < 366 * 24 * 60 * 60 * 1000, "Expires oltre un anno");
  assert.doesNotMatch(securityTxt, /github|SECURITY\.md/i);
});

test("llms.txt indicizza le pagine pubbliche senza prezzi né recapiti diversi", () => {
  const index = readFileSync(new URL("../site/llms.txt", import.meta.url), "utf8");
  const full = readFileSync(new URL("../site/llms-full.txt", import.meta.url), "utf8");
  const legalPages = [
    "https://cfready.it/privacy",
    "https://cfready.it/terms",
    "https://cfready.it/en/privacy",
    "https://cfready.it/en/terms",
  ];
  assert.match(index, /^# CF Ready$/m);
  assert.match(index, /^> /m);
  for (const url of [
    ...indexableSitePages.values(),
    ...legalPages,
    "https://cfready.it/llms-full.txt",
  ]) {
    assert(index.includes(`(${url})`), `llms.txt non cita ${url}`);
  }
  for (const file of [index, full]) {
    const urls = [...file.matchAll(/https:\/\/cfready\.it[^\s)>]*/g)].map((match) => match[0]);
    for (const url of urls) {
      assert(
        [
          ...indexableSitePages.values(),
          ...legalPages,
          "https://cfready.it/llms-full.txt",
        ].includes(url),
        `URL non pubblicato: ${url}`,
      );
    }
    assert.deepEqual(
      new Set([...file.matchAll(/[\w.+-]+@[\w.-]+/g)].map((match) => match[0])),
      new Set(["supporto@cfready.it", "info@cfready.it"]),
    );
    assert.doesNotMatch(file, /[$€]\s?\d|\d\s?(?:€|EUR|USD)/);
  }
  assert.match(full, /not who it belongs to/);
  assert.match(full, /don't reach CF Ready/);
});

test("i dati strutturati restano verificabili e non inventano prezzo o recensioni", () => {
  const home = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  assert.match(home, /"@type":"Organization"/);
  assert.match(home, /"@type":"WebSite"/);
  assert.doesNotMatch(home, /SoftwareApplication|aggregateRating|"offers"/);
  const graph = (html) =>
    JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1])["@graph"];
  const organization = graph(home).find((node) => node["@type"] === "Organization");
  assert.equal(organization.sameAs, undefined);
  assert.deepEqual(organization.contactPoint, {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "supporto@cfready.it",
    availableLanguage: ["it", "en"],
  });
  assert.deepEqual(
    graph(readFileSync(new URL("../site/en/index.html", import.meta.url), "utf8")),
    graph(home),
  );

  for (const path of [...indexableSitePages.keys()].filter((path) => path.includes("guide"))) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /"@type":"BreadcrumbList"/, path);
    assert.doesNotMatch(html, /SoftwareApplication|aggregateRating|"offers"/, path);
  }
});

test("la pagina 404 è dedicata e fuori dall’indice", () => {
  const notFound = readFileSync(new URL("../site/404.html", import.meta.url), "utf8");
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /<title[^>]*>Page not found \| CF Ready<\/title>/);
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
  assert.equal(packageJson.packageManager, "npm@12.2.2");
  assert.equal(packageJson.engines.node, ">=26.13.0 <27");
  assert.equal(packageJson.devDependencies.typescript, "7.0.2");
  assert.equal(packageJson.devDependencies["@typescript/typescript6"], undefined);
  assert.equal(
    packageJson.packageExtensions["@shopify/shopify-app-react-router@4.0.1"].peerDependencies[
      "react-router"
    ],
    "8.5.0",
  );
  assert.equal(lockfile.lockfileVersion, 4);
  assert.equal(lockfile.packages[""].engines.node, ">=26.13.0 <27");
  assert.equal(lockfile.packages[""].devDependencies.typescript, "7.0.2");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedSideEffectImports, true);
  assert.deepEqual(tsconfig.compilerOptions.lib, ["DOM", "ES2022"]);
  assert.equal(tsconfig.compilerOptions.ignoreDeprecations, undefined);
  assert.equal(tsconfig.compilerOptions.stableTypeOrdering, undefined);
  assert.match(npmrc, /^strict-allow-scripts=true$/m);
  assert.match(mise, /^node = "26\.13\.0"$/m);
  assert.match(mise, /^npm = "12\.2\.2"$/m);

  const setupNode = loadAction("setup-node-npm").runs;
  const setupNodeStep = findStep(setupNode, /^actions\/setup-node@/);
  assert.equal(setupNodeStep.with["node-version"], "26.13.0");
  assert.equal(setupNodeStep.with.cache, "npm");
  // I workflow che fissano Node fuori dall'azione condivisa usano la stessa versione.
  const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
  const workflowNodePins = readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) =>
      [
        ...readFileSync(new URL(name, workflowsDirectory), "utf8").matchAll(
          /node-version:\s*["']?([^"'\s]+)/g,
        ),
      ].map(([, version]) => ({ name, version })),
    );
  assert.ok(workflowNodePins.length > 0);
  for (const { name, version } of workflowNodePins) assert.equal(version, "26.13.0", name);
  findStep(setupNode, /npm install --global npm@12\.2\.2/);

  for (const path of [
    "ci.yml",
    "security-maintenance.yml",
    "backup-production.yml",
    "deploy-development.yml",
    "deploy-pages-production.yml",
    "deploy-production.yml",
    "mutation-campaign.yml",
    "playwright-cache.yml",
  ]) {
    const workflow = loadWorkflow(path);
    for (const [, version] of commands(workflow).matchAll(/@shopify\/cli@(\S+)/g)) {
      assert.equal(version, packageJson.devDependencies["@shopify/cli"], path);
    }
    for (const job of Object.values(workflow.jobs)) {
      const setups = job.steps.filter(({ uses }) => uses === "./.github/actions/setup-node-npm");
      const installs = job.steps.filter(({ run }) => run?.includes("npm ci"));
      assert.equal(setups.length, installs.length, path);
      if (installs.length > 0) {
        assertStepOrder(job, setups[0], installs[0]);
      }
      const fullCheck = job.steps.find(({ run }) => run?.includes("npm run check"));
      if (path !== "ci.yml" && fullCheck) {
        assertStepOrder(job, /playwright install --with-deps chromium webkit/, fullCheck);
      }
    }
  }

  const doctorJob = loadWorkflow("react-doctor.yml").jobs["react-doctor"];
  assert.equal(
    findStep(doctorJob, /^millionco\/react-doctor@/).with.version,
    packageJson.devDependencies["react-doctor"],
  );

  for (const path of ["deploy-development.yml", "deploy-production.yml"]) {
    const { deploy } = loadWorkflow(path).jobs;
    const schema = findStep(deploy, /npm run verify:function-schema/);
    assertStepOrder(
      deploy,
      /test -n "\$CLOUDFLARE_API_TOKEN" && test -n "\$SHOPIFY_SERVICE_ACCOUNT_TOKEN"/,
      schema,
    );
    assert.ok(schema.env.SHOPIFY_SERVICE_ACCOUNT_TOKEN, path);
  }

  const { deploy: productionDeploy } = loadWorkflow("deploy-production.yml").jobs;
  assert.equal(
    findStep(productionDeploy, /npm run verify:function-schema/).env.SHOPIFY_FUNCTION_SCHEMA_CONFIG,
    "production",
  );
});

test("il workflow Pages Production resta manuale, vincolato e verificabile", () => {
  const workflow = loadWorkflow("deploy-pages-production.yml");
  const { deploy, rollback } = workflow.jobs;
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.ok(workflow.on.workflow_dispatch.inputs.force_redeploy);
  assertPermissions(workflow, { checks: "read", contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(deploy.environment, "Pages Production");
  assert.equal(rollback.environment, "Pages Production");

  const branch = findStep(deploy, /^test "\$GITHUB_REF" = "refs\/heads\/main"$/);
  const preflight = findStep(deploy, /git rev-parse "\$\{GITHUB_SHA\}:site"/);
  // La suite è già verde sul merge Production: il sito ne riusa i gate, come Deploy Production.
  const gates = findStep(deploy, /^node scripts\/github-gates\.mjs$/);
  const prepare = findStep(deploy, /^node scripts\/prepare-pages-site\.mjs site /);
  const pagesDeploy = findStep(deploy, /wrangler pages deploy "\$RUNNER_TEMP\/pages-site"/);
  const readback = findStep(deploy, /pages-after\.json/);
  const smoke = findStep(deploy, /deployment\.txt\?commit=/);
  assert.equal(gates.env.REQUIRED_CHECKS, "verify,e2e,react-doctor,coverage");
  assertStepOrder(deploy, branch, preflight, gates, pagesDeploy, readback, smoke);
  assertStepOrder(deploy, stepProducing(deploy, "rollback_armed"), pagesDeploy);
  for (const step of [gates, prepare, pagesDeploy, readback, smoke]) {
    assert.match(step.if, /steps\.[\w-]+\.outputs\.deploy_required == 'true'/);
  }

  // Un commit canonico reso irraggiungibile da un riallineamento non blocca il preflight:
  // senza il suo tree il sito si ridistribuisce.
  assert.doesNotMatch(preflight.run, /^\s*git cat-file -e "\$\{rollback_commit\}\^\{commit\}"$/m);
  assertAllMatch(preflight.run, [
    /git rev-parse "\$\{rollback_commit\}:site"/,
    /if git cat-file -e "\$\{rollback_commit\}\^\{commit\}" 2>\/dev\/null; then/,
    /deployed_site_tree=""/,
    /canonical_deployment\.deployment_trigger\.metadata\.commit_hash/,
    /pages\/projects\/\$PAGES_PROJECT\/domains\/\$PUBLIC_DOMAIN/,
    /\.result\.status == "active"/,
    /## Ricevuta deploy Pages Production/,
  ]);
  assertAllMatch(pagesDeploy.run, [
    /--branch main/,
    /--commit-hash "\$GITHUB_SHA"/,
    /printf '%s\\n' "\$GITHUB_SHA" > "\$RUNNER_TEMP\/pages-site\/deployment\.txt"/,
  ]);
  assertAllMatch(smoke.run, [
    /--header "Cache-Control: no-cache"/,
    /if curl --fail/,
    /--location --max-redirs 5/,
    /PUBLIC_DOMAIN\/deployment\.txt/,
    /https:\/\/www\.\$PUBLIC_DOMAIN/,
    /www_effective_url/,
    /test "\$pages_dev_effective_url" = "https:\/\/\$PUBLIC_DOMAIN\/en\/support\?commit=\$GITHUB_SHA"/,
    /grep -Fxq "\$GITHUB_SHA"/,
    /--write-out '%\{url_effective\}'/,
    /test "\$published" = true/,
    /robots\.txt/,
    /sitemap\.xml/,
    /cmp --silent site\/robots\.txt/,
    /cmp --silent site\/sitemap\.xml/,
    /for text_file in llms\.txt llms-full\.txt \.well-known\/security\.txt; do/,
    /cmp --silent "site\/\$text_file" "\$text_copy"/,
    /og:image/,
    /BreadcrumbList/,
    /style\\\.\[0-9a-f\]\{12\}\\\.css/,
    /menu\\\.\[0-9a-f\]\{12\}\\\.js/,
    /cmp --silent site\/style\.css/,
    /cmp --silent site\/menu\.js/,
    /social-image-headers\.txt/,
    /test "\$not_found_status" = "404"/,
  ]);

  assertNeeds(rollback, "deploy");
  assertAllMatch(rollback.if, [
    /always\(\)/,
    /needs\.deploy\.result != 'success'/,
    /needs\.deploy\.outputs\.rollback_armed == 'true'/,
  ]);
  const restore = findStep(rollback, /deployments\/\$ROLLBACK_ID\/rollback/);
  assert.match(restore.run, /\.result\.canonical_deployment\.id == \$id/);

  const allCommands = commands(workflow);
  assert.doesNotMatch(allCommands, /npm run check|playwright install/);
  assert.doesNotMatch(allCommands, /wrangler deploy(?:\s|$)/);
  assert.doesNotMatch(allCommands, /shopify app deploy/);
});

test("il link assistenza rispetta il manifest corrente delle Admin Link extension", async () => {
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
  const { default: routes } = await import("../app/routes.ts");
  const appRoutes = routes.find((entry) => entry.path === "app");
  assert.equal(
    appRoutes.children.find((entry) => entry.path === "guide")?.file,
    "routes/app.guide.tsx",
  );
  // Il template support-link corrente espone il testo tramite `extensions.name`: né la radice
  // né il target accettano i campi delle UI extension. La CLI bloccherebbe altrimenti anche i
  // comandi della Function prima di poter verificare o distribuire lo schema.
  assert.doesNotMatch(manifest, /^api_version\s*=/m);
  assert.doesNotMatch(manifest, /^text\s*=/m);
  assert.deepEqual(english, { name: "Get support" });
  assert.deepEqual(italian, { name: "Richiedi assistenza" });
});

test("il rollback Production richiede uno snapshot Shopify e verifica il ripristino", () => {
  const { deploy, rollback } = loadWorkflow("deploy-production.yml").jobs;
  assertNeeds(rollback, "deploy");
  assert.equal(rollback.environment, "Production");
  assertAllMatch(rollback.if, [
    /always\(\)/,
    /needs\.deploy\.result != 'success'/,
    /needs\.deploy\.outputs\.shopify_rollback_version_tag != ''/,
    /needs\.deploy\.outputs\.worker_deploy_started == 'true'/,
    /needs\.deploy\.outputs\.shopify_deploy_started == 'true'/,
  ]);
  assertStepOrder(
    deploy,
    stepProducing(deploy, "worker_deploy_started"),
    /cf deploy --prebuilt --mode prod/,
  );
  assertStepOrder(deploy, stepProducing(deploy, "shopify_deploy_started"), /shopify app deploy/);
  assertAllMatch(findStep(rollback, /cf workers deployments create/).run, [
    /if \[ "\$SHOPIFY_DEPLOY_STARTED" != "true" \]/,
    /if \[ "\$WORKER_DEPLOY_STARTED" != "true" \]/,
    /shopify-rollback-readback\.json/,
    /worker-rollback-readback\.json/,
    /Readback rollback Production non riuscito/,
  ]);
});

test("il deploy Production provisiona entrambe le code webhook dichiarate", () => {
  const { deploy } = loadWorkflow("deploy-production.yml").jobs;
  assertAllMatch(findStep(deploy, /cf queues list/).run, [
    /cf queues list > "\$RUNNER_TEMP\/queues\.json"/,
    /cf-ready-webhooks-prod cf-ready-webhooks-prod-failures/,
    /cf queues create --queue-name "\$queue" --jurisdiction eu/,
  ]);
});

test("i deploy Shopify non autorizzano cancellazioni senza conferma", () => {
  // D-186: `--allow-deletes` cancellerebbe anche estensioni rimosse per errore.
  for (const path of ["deploy-development.yml", "deploy-production.yml"]) {
    const workflow = loadWorkflow(path);
    findStep(workflow.jobs.deploy, /shopify app deploy/);
    assert.doesNotMatch(commands(workflow), /--allow-deletes/, path);
  }
});

test("il backup Production cifra, ruota gli slot e prova il restore", () => {
  const workflow = loadWorkflow("backup-production.yml");
  const schedule = loadWorkflow("schedule-backup-production.yml");
  const { backup } = workflow.jobs;
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.ok(schedule.on.schedule);
  findStep(schedule.jobs.dispatch, /gh workflow run backup-production\.yml .*--ref main/);
  assertPermissions(workflow, { contents: "read" });
  assertPermissions(schedule, { actions: "write", contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(backup.environment, "Production Backups");

  const branch = findStep(backup, /^test "\$GITHUB_REF" = "refs\/heads\/main"$/);
  const preflight = findStep(backup, /cf d1 get "\$D1_DATABASE_ID"/);
  const dump = findStep(backup, /wrangler d1 export DB/);
  const restoreDrill = findStep(backup, /wrangler d1 execute DB/);
  const upload = findStep(backup, /wrangler r2 object put/);
  const readback = findStep(backup, /wrangler r2 object get "\$R2_BUCKET\/\$WEEKLY_KEY"/);
  assertStepOrder(backup, branch, preflight, dump, restoreDrill, upload, readback);

  assertAllMatch(preflight.run, [
    /^test -n "\$CLOUDFLARE_API_TOKEN"$/m,
    /^test -n "\$D1_BACKUP_KEY"$/m,
    /cf r2 buckets get "\$R2_BUCKET" --cf-r2-jurisdiction eu/,
    /backup-crypto\.mjs check-key/,
  ]);
  assertAllMatch(dump.run, [
    /wrangler d1 export DB --config "\$RUNNER_TEMP\/backup-wrangler\.json" --remote/,
    /--output "\$RUNNER_TEMP\/d1\.sql" > \/dev\/null/,
    /backup-crypto\.mjs encrypt/,
  ]);
  assertAllMatch(restoreDrill.run, [
    /wrangler d1 execute DB --config "\$RUNNER_TEMP\/backup-wrangler\.json" --local/,
    /backup-crypto\.mjs verify/,
  ]);
  assertAllMatch(upload.run, [
    /wrangler r2 object put "\$R2_BUCKET\/\$weekly_key"/,
    /--jurisdiction eu/,
    /monthly\/latest\.txt/,
  ]);
  assert.doesNotMatch(upload.run, /date -u \+%d/);
  assert.match(readback.run, /--jurisdiction eu/);
  assert.doesNotMatch(commands(workflow), /d1 execute .*--remote/);
});

test("osservabilità sicura e ricevute restano configurate", async () => {
  const development = loadWorkflow("deploy-development.yml");
  const operations = readFileSync(
    new URL("../docs/runbooks/operations.md", import.meta.url),
    "utf8",
  );
  for (const mode of ["dev", "prod"]) {
    const { observability } = await loadWorkerConfig(mode);
    assert.equal(observability.logs.headSamplingRate, 1);
    assert.equal(observability.logs.invocationLogs, false);
    assert.equal(observability.traces.enabled, false);
  }
  findStep(development.jobs.deploy, /## Ricevuta deploy Development/);
  assert.doesNotMatch(commands(development), /capacity:dev|capacity-check/);
  assert.doesNotMatch(
    development.jobs.deploy.steps.map(({ name }) => name).join("\n"),
    /Verifica capacità/,
  );
  assert.match(operations, /D1 storage per database \| 10 GB \| 5 GB/);
});

test("gli E2E pubblici sono eseguibili in CI senza sessione staff", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const ci = loadWorkflow("ci.yml");
  const coverageCollect = ci.jobs["coverage-collect"];
  const { e2e } = ci.jobs;
  const development = readFileSync(
    new URL("../docs/engineering/development.md", import.meta.url),
    "utf8",
  );
  const playwright = readFileSync(
    new URL("../tests/playwright.config.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    packageJson.scripts["test:e2e"],
    "playwright test --config tests/playwright.config.ts",
  );
  const setupPlaywright = loadAction("setup-playwright");
  // Browser e dipendenze di sistema arrivano da un'unica azione con cache dei .deb apt:
  // e2e installa entrambi i motori, la coverage browser solo quello del proprio job.
  assert.equal(
    findStep(coverageCollect, /setup-playwright$/).with.browsers,
    "${{ matrix.part == 'ui-webkit' && 'webkit' || 'chromium' }}",
  );
  assert.equal(findStep(e2e, /setup-playwright$/).with.browsers, "chromium webkit");
  assert.doesNotMatch(commands(ci), /playwright install/);
  const caches = setupPlaywright.runs.steps.filter(({ uses }) =>
    uses?.startsWith("actions/cache@"),
  );
  const cacheFor = (path) => caches.find((step) => step.with.path === path);
  for (const { uses } of caches) {
    assert.match(uses, /@[0-9a-f]{40}$/);
  }
  assertAllMatch(findStep(setupPlaywright.runs, /npx playwright install-deps/).run, [
    /Dir::Cache::Archives/,
    /timeout "\$DEPS_TIMEOUT" npx playwright install-deps "\$\{browsers\[@\]\}"/,
  ]);
  assert.equal(setupPlaywright.inputs["deps-timeout"].default, "240");
  // La cache apt nasce su develop, visibile a tutte le PR, e non solo dentro una PR.
  const cacheWorkflow = loadWorkflow("playwright-cache.yml");
  assert.ok(cacheWorkflow.on.schedule);
  assert.deepEqual(cacheWorkflow.on.push.branches, ["develop"]);
  assert.deepEqual(
    new Set(cacheWorkflow.jobs.warm.strategy.matrix.browsers),
    new Set(["chromium", "webkit", "chromium webkit"]),
  );
  assert.match(
    cacheFor("~/.cache/apt-playwright/*.deb").with["restore-keys"],
    /^playwright-apt-\$\{\{ steps\.versions\.outputs\.browsers \}\}-$/m,
  );
  assert.match(cacheFor("~/.cache/ms-playwright").with.key, /^playwright-\$\{\{ runner\.os \}\}/);
  for (const step of [
    findStep(coverageCollect, /npm run coverage:/),
    findStep(e2e, /npm run test:e2e/),
  ]) {
    assert.ok(step["timeout-minutes"] > 0, step.run);
  }
  assert.equal(
    packageJson.scripts["coverage:ui-chromium"].includes("--project 'merchant-chromium*'"),
    true,
  );
  assert.equal(
    packageJson.scripts["coverage:ui-webkit"].includes("--project 'merchant-webkit*'"),
    true,
  );
  assert.match(development, /playwright install chromium webkit/);
  assert.match(playwright, /fileURLToPath\(new URL\("\.\."/);
  const traces = findStep(e2e, /^actions\/upload-artifact@[0-9a-f]{40}$/);
  assert.equal(traces.with.path, "test-results");
  assert.match(playwright, /failOnFlakyTests: Boolean\(process\.env\.CI\)/);
  assert.match(playwright, /vite preview --mode dev/);
  assert.match(playwright, /CLOUDFLARE_INCLUDE_PROCESS_ENV: "true"/);
  assert.match(playwright, /npm run site:dev/);
  assert.doesNotMatch(playwright, /cf-ready-dev|cf-ready\.pages\.dev/);
});

test("la CI applica corsie proporzionate con required check stabili", () => {
  const ci = loadWorkflow("ci.yml");
  const { lane, verify, coverage, mutation, e2e, reusable } = ci.jobs;
  const coverageCollect = ci.jobs["coverage-collect"];
  const promotionGuard = loadWorkflow("promotion-guard.yml");
  const policy = loadWorkflow("ci-policy.yml");
  const { attest } = policy.jobs;
  const doctor = loadWorkflow("react-doctor.yml");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  findStep(lane, /node scripts\/ci-lane\.mjs/);
  assertPermissions(ci, {
    actions: "read",
    checks: "read",
    contents: "read",
    "pull-requests": "read",
    statuses: "read",
  });
  assertNeeds(verify, "lane");
  assertNeeds(coverage, "lane", "coverage-collect");
  assertNeeds(mutation, "lane", "critical-mutation");
  assertNeeds(e2e, "lane");
  assertNeeds(reusable, "lane", "verify", "coverage", "mutation", "e2e");
  for (const [command, condition] of [
    [/npm run check:docs/, /needs\.lane\.outputs\.lane == 'docs'/],
    [/npm run check:ci-standard/, /needs\.lane\.outputs\.lane == 'standard'/],
    [/npm run check:ci-full/, /needs\.lane\.outputs\.lane == 'full'/],
    [/node scripts\/github-gates\.mjs/, /needs\.lane\.outputs\.lane == 'promotion'/],
  ]) {
    assert.match(findStep(verify, command).if, condition);
  }
  assert.equal(coverage["timeout-minutes"], 15);
  assert.equal(e2e["timeout-minutes"], 20);
  assert.equal(promotionGuard.jobs["promotion-guard"]["timeout-minutes"], 15);
  assertAllMatch(findStep(coverage, /node scripts\/coverage-report\.mjs/).run, [
    /node scripts\/coverage-report\.mjs.*--base-sha/,
    /node scripts\/coverage-collect\.mjs --verify/,
  ]);
  assert.ok(coverageCollect.strategy.matrix.part);
  // Le fixture girano sul Wasm compilato solo con test:function, nel job della Function.
  const functionWasm = findStep(coverageCollect, /npm run test:function/);
  assert.equal(functionWasm.if, "matrix.part == 'function'");
  assert.ok(functionWasm["timeout-minutes"] > 0);
  assert.match(packageJson.scripts["test:function"], /--workspace cf-ready-validation -- --run$/);
  findStep(lane, /node scripts\/github-gates\.mjs --reuse-ci/);
  const coverageUpload = findStep(coverage, /^actions\/upload-artifact@/);
  assert.equal(coverageUpload.with.name, "coverage-${{ github.sha }}");
  assert.equal(coverageUpload.with["include-hidden-files"], true);
  assert.match(
    findStep(doctor.jobs["react-doctor"], /^millionco\/react-doctor@/).if,
    /steps\.[\w-]+\.outputs\.react_doctor == 'true'/,
  );
  assert.deepEqual(Object.keys(policy.on), ["pull_request_target"]);
  assert.deepEqual(
    new Set(policy.on.pull_request_target.types),
    new Set(["opened", "synchronize", "reopened", "ready_for_review"]),
  );
  assertPermissions(policy, { contents: "read", "pull-requests": "read", statuses: "write" });
  findStep(attest, /node scripts\/ci-policy-check\.mjs/);
  const policyCheckout = findStep(attest, /^actions\/checkout@/);
  assert.equal(policyCheckout.with["persist-credentials"], false);
  assert.equal(policyCheckout.with.ref, undefined);
  assert.doesNotMatch(
    JSON.stringify(policy.jobs),
    /pull_request\.head|gh pr checkout|git fetch|npm (?:ci|install)/,
  );
  assert.match(packageJson.scripts["check:docs"], /docs:check && node scripts\/diff-check\.mjs$/);
  assert.match(packageJson.scripts["check:local"], /typecheck/);
  assert.doesNotMatch(packageJson.scripts["check:ci-standard"], /npm (?:test|run test:ui)/);
  assert.doesNotMatch(packageJson.scripts["check:ci-full"], /npm (?:test|run test:ui)/);
});

test("il controllo degli spazi parte dal branch di destinazione", () => {
  const bases = { "origin/main": "a".repeat(40), "origin/develop": "b".repeat(40) };
  const git = ([, target]) =>
    bases[target] ? { status: 0, stdout: `${bases[target]}\n` } : { status: 128, stdout: "" };
  assert.equal(diffCheckBase({ env: { GITHUB_BASE_REF: "main" }, git }), bases["origin/main"]);
  assert.equal(diffCheckBase({ env: {}, git }), bases["origin/develop"]);
  assert.equal(diffCheckBase({ env: {}, git: () => ({ status: 128, stdout: "" }) }), null);

  // Con una base controlla da lì al working tree; senza, avvisa e parte da HEAD.
  const calls = [];
  const check = (args) => (calls.push(args), { status: 0 });
  assert.equal(runDiffCheck({ env: {}, git, check, warn: () => assert.fail() }), 0);
  const warnings = [];
  const missing = () => ({ status: 128, stdout: "" });
  const failing = (args) => (calls.push(args), { status: null });
  assert.equal(
    runDiffCheck({ env: {}, git: missing, check: failing, warn: (m) => warnings.push(m) }),
    1,
  );
  assert.deepEqual(calls, [
    ["diff", "--check", bases["origin/develop"]],
    ["diff", "--check", "HEAD"],
  ]);
  assert.equal(warnings.length, 1);
  // Con git reale il repository di test non ha spazi errati rispetto alla base.
  assert.equal(typeof diffCheckBase({ env: {} }), "string");
  assert.equal(runDiffCheck({ env: {}, warn: () => {} }), 0);
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
  const development = loadWorkflow("deploy-development.yml");
  const production = loadWorkflow("deploy-production.yml");
  assertPermissions(development, {
    contents: "read",
    checks: "read",
    "pull-requests": "read",
  });
  assertPermissions(production, {
    attestations: "write",
    checks: "read",
    contents: "read",
    "id-token": "write",
  });
  for (const [workflow, environment, branch] of [
    [development, "Development", /^test "\$GITHUB_REF" = "refs\/heads\/develop"$/],
    [production, "Production", /^test "\$GITHUB_REF" = "refs\/heads\/main"$/],
  ]) {
    const { deploy } = workflow.jobs;
    assert.equal(deploy.environment, environment);
    assert.equal(workflow.concurrency["cancel-in-progress"], false);
    const gates = findStep(deploy, /^node scripts\/github-gates\.mjs$/);
    assert.match(gates.env.REQUIRED_CHECKS, /\bcoverage\b/);
    assertStepOrder(deploy, branch, gates, /shopify app deploy/);
    assert.doesNotMatch(commands(workflow), /^npm run check(?:\s|$)/m);
    findStep(deploy, /^node scripts\/deploy-receipt\.mjs$/);
    assert.match(
      findStep(deploy, /^actions\/upload-artifact@/).with.name,
      /^deploy-receipt-[a-z]+-\$\{\{ github\.sha \}\}$/,
    );
  }

  const { deploy: developmentDeploy, rollback: developmentRollback } = development.jobs;
  assert.match(
    findStep(developmentDeploy, /developmentVersion/).run,
    /git rev-parse 'HEAD\^\{tree\}'/,
  );
  assertStepOrder(
    developmentDeploy,
    /^npm run preflight:dev$/,
    /^npm run build$/,
    /shopify app deploy/,
    /cf deploy --prebuilt --mode dev/,
  );
  assert.match(
    findStep(developmentDeploy, /^npm run build$/).if,
    /env\.DEPLOY_READBACK_ONLY != 'true'/,
  );
  const { run: developmentRestore } = findStep(developmentRollback, /shopify app release/);
  const developmentWorkerRollback = developmentRestore.indexOf("cf workers deployments create");
  const developmentShopifyRollback = developmentRestore.indexOf("shopify app release");
  assert.ok(
    developmentWorkerRollback >= 0 && developmentShopifyRollback > developmentWorkerRollback,
  );
  assert.match(
    developmentRestore,
    /if \[ "\$worker_restored" -eq 1 \] && node scripts\/provider-retry\.mjs -- shopify app versions list/,
  );
  // Le chiamate provider idempotenti di deploy e rollback ritentano gli errori transitori.
  for (const workflow of [development, production]) {
    for (const call of [
      "shopify app release",
      "shopify app versions list",
      "cf workers deployments list",
      "cf workers deployments create",
    ]) {
      const unprotected = commands(workflow)
        .split("\n")
        .filter((line) => line.includes(call) && !line.includes("provider-retry.mjs --"));
      assert.deepEqual(unprotected, [], call);
    }
  }

  const { deploy: productionDeploy, rollback: productionRollback } = production.jobs;
  findStep(productionDeploy, /^actions\/attest@[0-9a-f]{40}$/);
  assertStepOrder(productionDeploy, /shopify app deploy/, /cf deploy --prebuilt --mode prod/);
  const { run: productionRestore } = findStep(productionRollback, /shopify app release/);
  const productionWorkerRollback = productionRestore.indexOf("cf workers deployments create");
  const productionShopifyRollback = productionRestore.indexOf("shopify app release");
  assert.ok(productionWorkerRollback >= 0 && productionShopifyRollback > productionWorkerRollback);
  assert.match(productionRestore, /elif \[ "\$worker_ready_for_shopify" -ne 1 \]; then/);
});

test("la release si prepara in Development anche senza promozione autorizzata", () => {
  const plan = readFileSync(new URL("../docs/engineering/development.md", import.meta.url), "utf8");
  assert.match(plan, /La prossima versione si prepara nella PR verso `develop`/);
  assert.match(plan, /anche quando l’owner chiede “pubblica senza\s+promuovere”/);
  assert.match(plan, /Durante il collaudo si mantiene la stessa SemVer/);
  assert.match(plan, /Non si modifica la versione durante la promozione/);
  assert.match(plan, /senza attendere il via alla\s+Production/);
  assert.match(plan, /gate completi e un nuovo deploy\s+Development prima della promozione/);
});

test("il riallineamento develop è separato dal deploy e fallisce chiuso", () => {
  const workflow = loadWorkflow("reconcile-develop.yml");
  const { reconcile } = workflow.jobs;
  const script = readFileSync(new URL("./reconcile-develop.mjs", import.meta.url), "utf8");
  const rulesetVerifier = readFileSync(
    new URL("./verify-reconciliation-ruleset.mjs", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    new Set(workflow.on.workflow_run.workflows),
    new Set(["Deploy Production", "Deploy Pages Production"]),
  );
  assert.equal(reconcile.environment, "Repository Governance");
  assertPermissions(workflow, { actions: "read", contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assertAllMatch(reconcile.if, [
    /github\.event\.workflow_run\.conclusion == 'success'/,
    /github\.event\.workflow_run\.head_branch == 'main'/,
  ]);
  assert.deepEqual(
    new Set(workflow.on.workflow_dispatch.inputs.mode.options),
    new Set(["deploy-retry", "no-deploy-promotion"]),
  );
  const checkout = findStep(reconcile, /^actions\/checkout@/);
  assert.equal(checkout.with["persist-credentials"], false);
  assert.match(checkout.with.ref, /github\.event_name == 'workflow_dispatch' && github\.ref_name/);
  const appToken = findStep(reconcile, /^actions\/create-github-app-token@[0-9a-f]{40}$/);
  assert.equal(appToken.with["client-id"], "${{ vars.RECONCILIATION_APP_CLIENT_ID }}");
  assert.equal(appToken.with["app-id"], undefined);
  assert.doesNotMatch(JSON.stringify(workflow.jobs), /RECONCILIATION_APP_ID/);
  const rulesetCheck = findStep(reconcile, /^node scripts\/verify-reconciliation-ruleset\.mjs$/);
  assert.equal(rulesetCheck.env.RECONCILIATION_ACTOR_ID, "4735849");
  const realign = findStep(reconcile, /^node scripts\/reconcile-develop\.mjs$/);
  assertStepOrder(reconcile, rulesetCheck, realign);
  assert.equal(realign.env.SOURCE_DEPLOY_SHA, "${{ github.event.workflow_run.head_sha }}");
  assert.equal(realign.env.RECONCILIATION_MODE, "${{ inputs.mode }}");
  assert.match(realign.env.RECONCILIATION_APP_SLUG, /steps\.[\w-]+\.outputs\.app-slug/);
  assert.match(script, /parents\[1\] !== develop/);
  assert.match(script, /mainTree !== developTree/);
  assert.match(script, /deploy-receipt-production-/);
  assert.match(script, /actions\/workflows\/deploy-production\.yml\/runs/);
  assert.match(script, /actions\/workflows\/deploy-pages-production\.yml\/runs/);
  assert.match(script, /force: false/);
  assert.match(rulesetVerifier, /bypass_actors/);
  assert.match(script, /recover develop ancestry after main promotion/);
  assert.match(script, /eventName !== "workflow_dispatch"/);
  assert.match(script, /requiresDeploymentEvidence\(mode\)/);
  assert.match(script, /shouldDeferNoDeployReconciliation/);
  assert.match(script, /tree: develop\.tree\.sha/);
  assert.match(script, /comparison\.merge_base_commit\?\.sha !== promotedDevelop/);
  assert.match(script, /verifyRefReadback/);
  assert.match(script, /"cache-control": "no-cache"/);
});

test("la manutenzione sicurezza resta periodica e in sola lettura", () => {
  const ci = loadWorkflow("ci.yml");
  const workflow = loadWorkflow("security-maintenance.yml");
  const { repository, providers } = workflow.jobs;
  const functionSchema = workflow.jobs["function-schema"];
  assert.deepEqual(
    new Set(workflow.on.schedule.map(({ cron }) => cron)),
    new Set(["17 6 1 * *", "47 6 1 1,4,7,10 *", "37 5 * * *"]),
  );
  assertPermissions(workflow, {
    actions: "read",
    contents: "read",
    "security-events": "read",
  });
  assert.equal(functionSchema.environment.deployment, false);
  findStep(functionSchema, /npm run verify:function-schema/);
  assert.deepEqual(repository.environment, { name: "Security Maintenance", deployment: false });
  findStep(repository, /npm run audit:security/);
  findStep(repository, /npm audit signatures/);
  findStep(repository, /node scripts\/credential-expiry\.mjs/);
  findStep(providers, /npm run readback:dev/);
  for (const job of Object.values(workflow.jobs)) {
    findStep(job, /^test "\$GITHUB_REF" = "refs\/heads\/develop"$/);
  }
  const governance = findStep(repository, /verify_ruleset develop/);
  assert.equal(governance.env.GH_TOKEN, "${{ secrets.SECURITY_AUDIT_TOKEN }}");
  assertAllMatch(governance.run, [
    /required_status_checks/,
    /rulesets="\$\(gh api/,
    /ruleset="\$\(gh api/,
    /ci-policy,coverage,dependency-review,e2e,mutation,promotion-guard,react-doctor,verify/,
    /gh workflow list --all/,
    /workflows="\$\(gh workflow list/,
    /test -n "\$workflows"/,
    /--status completed --limit 1/,
    /startswith\("\.github\/workflows\/"\)/,
    /dependabot\/alerts code-scanning\/alerts secret-scanning\/alerts/,
    /--paginate --slurp/,
    /alerts="\$\(gh api/,
    /alert_count="\$\(jq/,
    /\.path != "\.github\/workflows\/security-maintenance\.yml"/,
    /\.target == "branch"/,
    /\.conditions\.ref_name\.include == \[\$ref\]/,
  ]);
  assert.doesNotMatch(governance.run, /success\|skipped\|neutral\|never/);
  for (const [, singleQuoted] of governance.run.matchAll(/'([^']*)'/g)) {
    assert.doesNotMatch(singleQuoted, /\\/);
  }
  assert.doesNotMatch(JSON.stringify(ci.jobs), /allow-ghsas/);
  const parsed = JSON.stringify(workflow);
  assert.doesNotMatch(parsed, /Security governance|required reviewer|approval|approvazione/);
  assert.doesNotMatch(parsed, /bypass_actors/);
  assert.doesNotMatch(parsed, /allow_auto_merge|delete_branch_on_merge/);
  assert.doesNotMatch(parsed, /branches\/\$branch\/protection/);
  assert.doesNotMatch(commands(workflow), /shopify app deploy|wrangler deploy|d1 migrations apply/);
});

test("README e indice non duplicano la versione corrente", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const index = readFileSync(new URL("../docs/index.md", import.meta.url), "utf8");
  const security = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /\b0\.\d+\.\d+\b/);
  assert.doesNotMatch(readme, /\bM\d+\b|progetto è in sviluppo/i);
  assert.doesNotMatch(index, /\b0\.\d+\.\d+\b/);
  assert.doesNotMatch(security, /ancora in sviluppo|non ha release pubbliche/i);
});

test("i documenti legali riportano solo Temisfera e non sono indicizzabili", () => {
  const legal = ["privacy.html", "terms.html", "en/privacy.html", "en/terms.html"];
  for (const file of legal) {
    const page = readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8");
    assert.match(page, /<strong>Temisfera<\/strong>/);
    assert.doesNotMatch(page, /__OWNER_NAME__/);
    const identity = page.match(/<h2>1\.[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(identity, `manca il paragrafo di identità in ${file}`);
    assert.deepEqual(
      [...identity.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]),
      ["Temisfera"],
    );
  }
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-pages-production.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /OWNER_LEGAL_NAME|__OWNER_NAME__/);

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
    new Set(["supporto@cfready.it", "info@cfready.it"]),
  );
});
