import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const CLIENT_BUNDLE_BUDGET = 350 * 1024;

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(target);
      return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
    }),
  );
  return nested.flat();
}

export function assertWithinClientBundleBudget(bytes, budget = CLIENT_BUNDLE_BUDGET) {
  if (bytes > budget) {
    throw new Error(
      `Client bundle ${Math.ceil(bytes / 1024)} KiB gzip exceeds ${Math.floor(budget / 1024)} KiB budget`,
    );
  }
}

export async function clientBundleGzipBytes(directory) {
  const files = await javascriptFiles(directory);
  const sizes = await Promise.all(
    files.map(async (file) => gzipSync(await readFile(file)).byteLength),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function main() {
  const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const bytes = await clientBundleGzipBytes(path.join(repositoryRoot, "build/client/assets"));
  assertWithinClientBundleBudget(bytes);
  console.log(`Client bundle: ${Math.ceil(bytes / 1024)} KiB gzip / 350 KiB`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
