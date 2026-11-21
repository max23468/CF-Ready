// `npm install` attiva gli hook versionati in `.githooks`: un hook non si salta per
// dimenticanza come una riga di istruzioni. Fuori da un checkout Git non fa nulla.
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
} catch {
  process.exit(0);
}
execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
