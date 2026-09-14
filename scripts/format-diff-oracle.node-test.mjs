import { execFileSync } from "node:child_process";
import test from "node:test";

const target = "tests/installation-diagnostics-edge-cases.test.ts";

test("format diff oracle", () => {
  execFileSync("node_modules/.bin/oxfmt", [target], { stdio: "inherit" });
  const diff = execFileSync("git", ["diff", "--no-ext-diff", "--", target], {
    encoding: "utf8",
  });
  console.log(`OXFMT_DIFF_START\n${diff}OXFMT_DIFF_END`);
});
