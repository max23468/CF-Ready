import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");

export function checkDocs(repositoryRoot = root) {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md", "*.html"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const errors = [];
  const anchorsByFile = new Map();

  for (const file of files) {
    const content = readFileSync(resolve(repositoryRoot, file), "utf8");
    const targets = extname(file) === ".html" ? htmlTargets(content) : markdownTargets(content);

    for (const target of targets) {
      if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(target)) continue;

      const [encodedPath, encodedFragment] = target.split("#", 2);
      const path = decodeURIComponent(encodedPath.split("?", 1)[0]);
      const fragment = encodedFragment && decodeURIComponent(encodedFragment);
      const linkedFile = resolve(
        repositoryRoot,
        path.startsWith("/") ? `.${path}` : dirname(file),
        path || file.split("/").at(-1),
      );
      if (!existsSync(linkedFile)) {
        errors.push(`${file}: link locale inesistente: ${path}`);
      } else if (fragment && !anchors(linkedFile, anchorsByFile).has(fragment)) {
        errors.push(`${file}: anchor locale inesistente: ${target}`);
      }
    }

    for (const match of content.matchAll(/\bnpm run ([\w:-]+)/g)) {
      if (!packageJson.scripts[match[1]]) {
        errors.push(`${file}: script npm inesistente: ${match[1]}`);
      }
    }
  }

  for (const file of ignoredTrackedFiles(repositoryRoot)) {
    errors.push(`${file}: file ignorato tracciato`);
  }

  return { errors, files };
}

export function markdownTargets(content) {
  const source = withoutMarkdownCode(content);
  const targets = [];

  for (const match of source.matchAll(/\[[^\]]*]\(\s*(?:<([^>]+)>|([^\s)]+))/g)) {
    targets.push(match[1] ?? match[2]);
  }
  for (const match of source.matchAll(/^\s{0,3}\[[^\]]+]:\s*(?:<([^>]+)>|(\S+))/gm)) {
    targets.push(match[1] ?? match[2]);
  }

  return targets;
}

export function htmlTargets(content) {
  return [...content.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
}

export function markdownAnchors(content) {
  const result = new Set();
  const duplicates = new Map();

  for (const match of withoutFencedCode(content).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[`*~]/g, "")
      .replace(/[^\p{L}\p{N}_\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = duplicates.get(base) ?? 0;
    result.add(count ? `${base}-${count}` : base);
    duplicates.set(base, count + 1);
  }

  return result;
}

export function htmlAnchors(content) {
  return new Set(
    [...content.matchAll(/\b(?:id|name)\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]),
  );
}

export function ignoredTrackedFiles(repositoryRoot) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: tracked,
  });
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr);
  return result.stdout.split("\0").filter(Boolean);
}

function anchors(file, cache) {
  if (cache.has(file)) return cache.get(file);

  const content = readFileSync(file, "utf8");
  const result = extname(file) === ".html" ? htmlAnchors(content) : markdownAnchors(content);
  cache.set(file, result);
  return result;
}

function withoutMarkdownCode(content) {
  return withoutFencedCode(content).replace(/`+[^`\n]*`+/g, "");
}

function withoutFencedCode(content) {
  let fence;
  return content
    .split("\n")
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
      if (!fence && marker) {
        fence = marker;
        return "";
      }
      if (fence && marker?.[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, files } = checkDocs();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${files.length} documenti verificati`);
  }
}
