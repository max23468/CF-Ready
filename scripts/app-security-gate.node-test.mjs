import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateDeterministicScan, KNOWN_PATH } from "./app-security-gate.mjs";

const known = JSON.parse(readFileSync(new URL(`../${KNOWN_PATH}`, import.meta.url), "utf8"));
const finding = (file) => ({ location: { file, line: 1 } });
const check = (id, findings, severity = "high", status = "executed") => ({
  id,
  status,
  snapshot: { severity },
  findings,
});
const scan = (checks, coverage = { files_skipped: [], gaps: [] }) => ({
  schema_version: 1,
  coverage,
  checks,
});

test("le occorrenze già verificate non bloccano", () => {
  const checks = known.findings.map(({ check: id, file, count }) =>
    check(
      id,
      Array.from({ length: count }, () => finding(file)),
    ),
  );
  assert.deepEqual(evaluateDeterministicScan(scan(checks), known), { problems: [], stale: [] });
});

test("un finding high nuovo o in più blocca, gli altri livelli no", () => {
  const result = evaluateDeterministicScan(
    scan([
      check("UNAUTHENTICATED_ENDPOINT", [
        finding("app/routes/app.tsx"),
        finding("app/routes/app.tsx"),
      ]),
      check("COMMITTED_SECRET", [finding("app/new.ts")]),
      check("WEAK_THING", [finding("app/new.ts")], "medium"),
    ]),
    known,
  );
  assert.equal(result.problems.length, 2);
  assert.match(result.problems.join("\n"), /UNAUTHENTICATED_ENDPOINT in app\/routes\/app\.tsx: 2/);
  assert.match(result.problems.join("\n"), /COMMITTED_SECRET in app\/new\.ts: 1 occorrenze, 0/);
});

test("stati anomali, copertura incompleta e risultati illeggibili bloccano", () => {
  const result = evaluateDeterministicScan(
    scan([check("X", [], "high", "error")], { files_skipped: ["a.ts"], gaps: [] }),
    known,
  );
  assert.equal(result.problems.length, 2);
  assert.throws(() => evaluateDeterministicScan({ schema_version: 2 }, known), /non leggibili/);
});

test("un falso positivo sparito resta un avviso", () => {
  const result = evaluateDeterministicScan(scan([check("UNSAFE_INNERHTML", [])]), known);
  assert.deepEqual(result.problems, []);
  assert.equal(result.stale.length, known.findings.length);
});
