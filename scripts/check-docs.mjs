import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";

const root = resolve(import.meta.dirname, "..");

export function checkDocs(repositoryRoot = root) {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ":(icase)*.md",
      ":(icase)*.markdown",
      ":(icase)*.html",
      ":(icase)*.svg",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => file && existsSync(resolve(repositoryRoot, file)));
  const errors = [];
  const anchorsByFile = new Map();

  for (const file of files) {
    const content = readFileSync(resolve(repositoryRoot, file), "utf8");
    const undefinedReferences = [];
    const extension = extname(file).toLowerCase();
    const targets = [".html", ".svg"].includes(extension)
      ? htmlTargets(content)
      : markdownTargets(content, undefinedReferences);

    for (const localPath of localMachinePaths(content)) {
      errors.push(`${file}: percorso locale non riproducibile: ${localPath}`);
    }

    for (const reference of undefinedReferences) {
      errors.push(`${file}: riferimento Markdown senza definizione: ${reference}`);
    }

    for (const target of targets) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;

      const [encodedPath, encodedFragment] = target.split("#", 2);
      const rawPath = encodedPath.split("?", 1)[0];
      const path = rawPath.startsWith("/")
        ? decodeURIComponent(new URL(rawPath, "https://docs.invalid").pathname)
        : decodeURIComponent(rawPath);
      const fragment = encodedFragment && decodeURIComponent(encodedFragment);
      const rawLinkedFile = !path
        ? resolve(repositoryRoot, file)
        : path.startsWith("/")
          ? resolve(repositoryRoot, `.${path}`)
          : resolve(repositoryRoot, dirname(file), path);
      const linkedFile =
        extension === ".html" && !existsSync(rawLinkedFile) && existsSync(`${rawLinkedFile}.html`)
          ? `${rawLinkedFile}.html`
          : rawLinkedFile;
      if (relative(repositoryRoot, linkedFile).split(/[\\/]/)[0] === "..") {
        errors.push(`${file}: link locale fuori repository: ${path}`);
      } else if (!existsSync(linkedFile)) {
        errors.push(`${file}: link locale inesistente: ${path}`);
      } else if (fragment) {
        const linkedAnchors = anchors(linkedFile, anchorsByFile);
        if (linkedAnchors && !linkedAnchors.has(fragment)) {
          errors.push(`${file}: anchor locale inesistente: ${target}`);
        }
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

export function localMachinePaths(content) {
  return [
    ...content.matchAll(
      /(?:\/Users\/[^\s`"'<>]+|\/home\/[^\s`"'<>]+|[A-Za-z]:\\Users\\[^\s`"'<>]+)/g,
    ),
  ].map((match) => match[0]);
}

export function markdownTargets(content, undefinedReferences = []) {
  const tree = fromMarkdown(content);
  const targets = [];
  const definitions = new Set();
  const maskedRanges = [];

  visitMarkdown(tree, (node) => {
    if (node.type === "definition") {
      definitions.add(normalizeReference(node.identifier));
      targets.push(node.url);
    } else if (node.type === "link" || node.type === "image") {
      targets.push(node.url);
    }
    if (
      [
        "code",
        "definition",
        "html",
        "image",
        "imageReference",
        "inlineCode",
        "link",
        "linkReference",
      ].includes(node.type) &&
      node.position
    ) {
      maskedRanges.push([node.position.start.offset, node.position.end.offset]);
    }
  });

  for (const reference of referenceUses(maskMarkdown(content, maskedRanges))) {
    if (!definitions.has(reference)) undefinedReferences.push(reference);
  }

  return targets;
}

export function htmlTargets(content) {
  const inactive = inactiveHtmlRanges(content);
  const attributes = htmlTags(content)
    .filter((tag) => !isInactive(tag.index, inactive))
    .flatMap(({ value }) => tagAttributes(value))
    .flatMap(({ name, value }) => [
      ...(/^(?:href|src|xlink:href)$/i.test(name) ? [value] : []),
      ...(/^(?:style|clip-path|mask|filter|fill|stroke|marker-(?:start|mid|end)|cursor)$/i.test(
        name,
      )
        ? cssTargets(value)
        : []),
    ]);
  const styles = [...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
    .filter((match) => !isInactive(match.index, inactive))
    .flatMap((match) => cssTargets(match[1]));
  return [...attributes, ...styles];
}

export function markdownAnchors(content) {
  const result = new Set();
  const nextSuffix = new Map();

  visitMarkdown(fromMarkdown(content), (node) => {
    if (node.type !== "heading") return;
    const base = markdownText(node)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    let suffix = nextSuffix.get(base) ?? 0;
    let slug = suffix ? `${base}-${suffix}` : base;
    while (result.has(slug)) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    nextSuffix.set(base, suffix + 1);
    result.add(slug);
  });

  return result;
}

function cssTargets(value) {
  return [...value.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi)]
    .map((match) => (match[2] ?? match[3]).trim())
    .filter(Boolean);
}

export function htmlAnchors(content) {
  const inactive = inactiveHtmlRanges(content);
  return new Set(
    htmlTags(content)
      .filter((tag) => !isInactive(tag.index, inactive))
      .flatMap(({ value }) => tagAttributes(value))
      .filter(({ name }) => /^(?:id|name)$/i.test(name))
      .map(({ value }) => value),
  );
}

export function xmlAnchors(content) {
  const inactive = inactiveHtmlRanges(content);
  return new Set(
    htmlTags(content)
      .filter((tag) => !isInactive(tag.index, inactive))
      .flatMap(({ value }) => tagAttributes(value))
      .filter(({ name }) => /^id$/i.test(name))
      .map(({ value }) => value),
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
  const extension = extname(file).toLowerCase();
  const result = [".md", ".markdown"].includes(extension)
    ? markdownAnchors(content)
    : extension === ".html"
      ? htmlAnchors(content)
      : [".svg", ".xml"].includes(extension)
        ? xmlAnchors(content)
        : undefined;
  cache.set(file, result);
  return result;
}

function normalizeReference(reference) {
  return reference.trim().replace(/\s+/g, " ").toLowerCase();
}

function inactiveHtmlRanges(content) {
  const ranges = [...content.matchAll(/<!--[\s\S]*?-->/g)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  for (const match of content.matchAll(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi)) {
    const start = match.index + match[1].length;
    ranges.push([start, start + match[3].length]);
  }
  return ranges;
}

function htmlTags(content) {
  const tags = [];
  for (let start = content.indexOf("<"); start !== -1; start = content.indexOf("<", start + 1)) {
    if (!/[a-z]/i.test(content[start + 1] ?? "")) continue;

    let quote;
    for (let end = start + 1; end < content.length; end += 1) {
      const character = content[end];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        tags.push({ index: start, value: content.slice(start, end + 1) });
        start = end;
        break;
      }
    }
  }
  return tags;
}

function tagAttributes(tag) {
  const attributes = [];
  const nameEnd = tag.match(/^<[^\s/>]+/)?.[0].length ?? tag.length;
  const attribute = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  attribute.lastIndex = nameEnd;
  for (let match = attribute.exec(tag); match; match = attribute.exec(tag)) {
    attributes.push({
      name: match[1],
      value: decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""),
    });
  }
  return attributes;
}

function decodeEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi,
    (entity, dec, hex, name) => {
      if (name) return named[name.toLowerCase()];
      const codePoint = Number.parseInt(dec ?? hex, dec ? 10 : 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

function isInactive(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function visitMarkdown(node, visitor) {
  visitor(node);
  for (const child of node.children ?? []) visitMarkdown(child, visitor);
}

function markdownText(node) {
  if (typeof node.value === "string") return node.value;
  if (typeof node.alt === "string") return node.alt;
  return (node.children ?? []).map(markdownText).join("");
}

function maskMarkdown(content, ranges) {
  const characters = content.split("");
  for (const [start, end] of ranges) {
    for (let index = start; index < end; index += 1) characters[index] = " ";
  }
  return characters.join("");
}

function referenceUses(content) {
  const references = [];
  for (let start = 0; start < content.length; start += 1) {
    if (content[start] !== "[" || isEscaped(content, start)) continue;

    const textEnd = closingBracket(content, start);
    if (textEnd === -1 || content[textEnd + 1] !== "[") continue;
    const referenceEnd = closingBracket(content, textEnd + 1);
    if (referenceEnd === -1) continue;

    const label = content.slice(textEnd + 2, referenceEnd) || content.slice(start + 1, textEnd);
    references.push(normalizeReference(label));
    start = referenceEnd;
  }
  return references;
}

function closingBracket(content, start) {
  let depth = 0;
  for (let index = start + 1; index < content.length; index += 1) {
    if (isEscaped(content, index)) continue;
    if (content[index] === "[") depth += 1;
    if (content[index] === "]" && depth-- === 0) return index;
  }
  return -1;
}

function isEscaped(content, index) {
  let slashes = 0;
  while (content[index - slashes - 1] === "\\") slashes += 1;
  return slashes % 2 === 1;
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
