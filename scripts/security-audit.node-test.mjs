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
