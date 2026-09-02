import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertWithinClientBundleBudget,
  clientBundleGzipBytes,
  CLIENT_BUNDLE_BUDGET,
} from "./check-client-bundle.mjs";

test("il bundle client resta entro il budget", () => {
  assert.doesNotThrow(() => assertWithinClientBundleBudget(CLIENT_BUNDLE_BUDGET));
});

test("il gate blocca un bundle client oltre il budget", () => {
  assert.throws(
    () => assertWithinClientBundleBudget(CLIENT_BUNDLE_BUDGET + 1),
    /exceeds 350 KiB budget/,
  );
});

test("somma soltanto gli asset JavaScript anche nelle directory annidate", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cf-ready-client-bundle-"));
  try {
    await mkdir(path.join(directory, "nested"));
    await Promise.all([
      writeFile(path.join(directory, "entry.js"), "export const entry = 'entry';\n"),
      writeFile(path.join(directory, "nested", "chunk.js"), "export const chunk = 'chunk';\n"),
      writeFile(path.join(directory, "style.css"), ".ignored {}\n"),
    ]);

    const measured = await clientBundleGzipBytes(directory);
    const expected = await Promise.all(
      [path.join(directory, "entry.js"), path.join(directory, "nested", "chunk.js")].map(
        async (file) => {
          const { gzipSync } = await import("node:zlib");
          const { readFile } = await import("node:fs/promises");
          return gzipSync(await readFile(file)).byteLength;
        },
      ),
    );

    assert.equal(measured, expected[0] + expected[1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("un albero senza JavaScript misura zero byte", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cf-ready-client-bundle-empty-"));
  try {
    await writeFile(path.join(directory, "style.css"), ".ignored {}\n");
    assert.equal(await clientBundleGzipBytes(directory), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
