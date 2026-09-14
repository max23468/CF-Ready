import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const target = "tests/installation-diagnostics-edge-cases.test.ts";

test("format oracle", () => {
  execFileSync("node_modules/.bin/oxfmt", [target], { stdio: "inherit" });
  console.log(`OXFMT_START\n${readFileSync(target, "utf8")}OXFMT_END`);
});
