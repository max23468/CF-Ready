import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "*.md"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);
const errors = [];
const anchorsByFile = new Map();

for (const file of files) {
  const content = readFileSync(resolve(root, file), "utf8");

  for (const match of content.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:)/.test(target)) continue;

    const [path, fragment] = target.split("#", 2).map(decodeURIComponent);
    const linkedFile = resolve(root, dirname(file), path || file.split("/").at(-1));
    if (!existsSync(linkedFile)) {
      errors.push(`${file}: link locale inesistente: ${path}`);
    } else if (fragment && linkedFile.endsWith(".md") && !anchors(linkedFile).has(fragment)) {
      errors.push(`${file}: anchor locale inesistente: ${target}`);
    }
  }

  for (const match of content.matchAll(/\bnpm run ([\w:-]+)/g)) {
    if (!packageJson.scripts[match[1]]) {
      errors.push(`${file}: script npm inesistente: ${match[1]}`);
    }
  }
}

const generated = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => /^(?:build|dist|node_modules|public\/build)\//.test(file));
for (const file of generated) errors.push(`${file}: output generato tracciato`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${files.length} documenti verificati`);
}

function anchors(file) {
  if (anchorsByFile.has(file)) return anchorsByFile.get(file);

  const result = new Set();
  const duplicates = new Map();
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>|[`*_~]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = duplicates.get(base) ?? 0;
    result.add(count ? `${base}-${count}` : base);
    duplicates.set(base, count + 1);
  }
  anchorsByFile.set(file, result);
  return result;
}
