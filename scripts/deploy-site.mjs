import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function siteArchive(cwd = process.cwd()) {
  return execFileSync("git", ["archive", "--format=tar", "HEAD", "site"], { cwd });
}

export function deploySite(cwd = process.cwd()) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const remoteMain = execFileSync(
    "git",
    ["ls-remote", "--exit-code", "origin", "refs/heads/main"],
    {
      cwd,
      encoding: "utf8",
    },
  )
    .trim()
    .split(/\s+/)[0];
  if (head !== remoteMain) throw new Error("site:deploy richiede il commit main remoto corrente");

  const directory = mkdtempSync(join(tmpdir(), "cf-ready-pages-"));
  try {
    execFileSync("tar", ["-xf", "-", "--strip-components=1", "-C", directory], {
      input: siteArchive(cwd),
    });
    execFileSync(
      "npm",
      [
        "exec",
        "--",
        "wrangler",
        "pages",
        "deploy",
        directory,
        "--project-name",
        "cf-ready",
        "--branch",
        "main",
      ],
      { cwd, stdio: "inherit" },
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) deploySite();
