import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateDeterministicScan,
  KNOWN_PATH,
  RESULTS_PATH,
  runAppSecurityGate,
} from "./app-security-gate.mjs";

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

test("il comando esegue la scansione, confronta i risultati e restituisce l'esito", () => {
  const output = [];
  const errors = [];
  const files = (results) => (path) =>
    JSON.stringify(path === RESULTS_PATH ? results : path === KNOWN_PATH ? known : null);
  const io = { out: (text) => output.push(text), err: (text) => errors.push(text) };
  let command;
  const ok = runAppSecurityGate({
    spawn: (...args) => {
      command = args;
      return { status: 0 };
    },
    read: files(scan([])),
    ...io,
  });
  assert.equal(ok, 0);
  assert.deepEqual(command.slice(0, 2), [
    "shopify",
    [
      "app",
      "security",
      "check",
      "--config",
      "shopify.app.toml",
      "--skip-instructions",
      "--no-input",
    ],
  ]);
  assert.equal(output.length, known.findings.length + 1);

  const blocked = runAppSecurityGate({
    spawn: () => ({ status: 0 }),
    read: files(scan([check("COMMITTED_SECRET", [finding("app/new.ts")])])),
    ...io,
  });
  assert.equal(blocked, 1);
  assert.match(errors.join(""), /COMMITTED_SECRET/);

  assert.throws(
    () => runAppSecurityGate({ spawn: () => ({ status: 2 }), read: files(scan([])), ...io }),
    /non è terminata/,
  );
});
