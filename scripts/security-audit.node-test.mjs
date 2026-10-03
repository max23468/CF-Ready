import assert from "node:assert/strict";
import test from "node:test";

import { verifySecurityAudit } from "./security-audit.mjs";

const cleanReport = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { total: 0 } },
};

test("accetta un audit senza vulnerabilità", () => {
  assert.doesNotThrow(() => verifySecurityAudit(cleanReport));
});

test("rifiuta qualsiasi vulnerabilità", () => {
  assert.throws(
    () =>
      verifySecurityAudit({
        auditReportVersion: 2,
        vulnerabilities: { pacchetto: { via: [{ source: 42 }] } },
        metadata: { vulnerabilities: { total: 1 } },
      }),
    /vulnerabilità/,
  );
});

test("rifiuta un payload di errore del registry", () => {
  assert.throws(() => verifySecurityAudit({ error: { code: "E403" } }), /non valido/);
});

const bracesReport = (extra = []) => ({
  auditReportVersion: 2,
  vulnerabilities: {
    braces: {
      via: [{ source: 1, url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }, ...extra],
    },
    micromatch: { via: ["braces"] },
  },
  metadata: { vulnerabilities: { total: 2 } },
});

test("ammette un avviso in eccezione solo fino alla scadenza (D-175)", () => {
  assert.doesNotThrow(() => verifySecurityAudit(bracesReport(), "2026-10-31"));
  assert.throws(() => verifySecurityAudit(bracesReport(), "2026-11-01"), /vulnerabilità/);
});

test("un avviso in eccezione non copre gli altri", () => {
  assert.throws(
    () =>
      verifySecurityAudit(
        bracesReport([{ source: 2, url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" }]),
        "2026-10-03",
      ),
    /vulnerabilità/,
  );
});
