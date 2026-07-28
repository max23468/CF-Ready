import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  htmlAnchors,
  htmlTargets,
  ignoredTrackedFiles,
  markdownAnchors,
  markdownTargets,
} from "./check-docs.mjs";

test("rileva link Markdown reference-style", () => {
  assert.deepEqual(markdownTargets("[Guida][setup]\n\n[setup]: docs/missing.md"), [
    "docs/missing.md",
  ]);
});

test("calcola gli anchor GitHub ignorando i blocchi di codice", () => {
  const anchors = markdownAnchors("```\n# Does not exist\n```\n\n#### `shopify_sessions`");
  assert(!anchors.has("does-not-exist"));
  assert(anchors.has("shopify_sessions"));
});

test("rileva riferimenti e anchor HTML", () => {
  const html = '<svg><symbol id="marchio"></symbol><use href="#marchio"/></svg>';
  assert.deepEqual(htmlTargets(html), ["#marchio"]);
  assert(htmlAnchors(html).has("marchio"));
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
