import { cpSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fingerprint(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
}

export function preparePagesSite(sourceDirectory, outputDirectory) {
  const source = resolve(sourceDirectory);
  const output = resolve(outputDirectory);
  if (source === output) {
    throw new Error("La directory Pages preparata deve essere distinta dalla sorgente.");
  }

  rmSync(output, { force: true, recursive: true });
  cpSync(source, output, { recursive: true });

  const assets = new Map();
  for (const name of ["menu.js", "style.css"]) {
    const extensionIndex = name.lastIndexOf(".");
    const versionedName = `${name.slice(0, extensionIndex)}.${fingerprint(join(source, name))}${name.slice(extensionIndex)}`;
    renameSync(join(output, name), join(output, versionedName));
    assets.set(name, versionedName);
  }

  for (const relativeFile of readdirSync(output, { recursive: true, encoding: "utf8" })) {
    if (!relativeFile.endsWith(".html")) continue;
    const htmlFile = join(output, relativeFile);
    let html = readFileSync(htmlFile, "utf8");
    for (const [name, versionedName] of assets) {
      html = html.replaceAll(name, versionedName);
    }
    writeFileSync(htmlFile, html);
  }

  return Object.fromEntries(assets);
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const [sourceDirectory, outputDirectory] = process.argv.slice(2);
  if (!sourceDirectory || !outputDirectory) {
    throw new Error(`Uso: ${basename(process.argv[1])} <directory-sorgente> <directory-output>`);
  }
  preparePagesSite(sourceDirectory, outputDirectory);
}
