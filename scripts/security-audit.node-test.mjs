import assert from "node:assert/strict";
import test from "node:test";

import { verifySecurityAudit } from "./security-audit.mjs";

const allowedReport = {
  auditReportVersion: 2,
  vulnerabilities: {
    "react-router": { via: [{ source: 1124282 }] },
    "@react-router/dev": { via: ["react-router"] },
  },
  metadata: { vulnerabilities: { total: 2 } },
};

test("accetta soltanto l'advisory RSC noto quando RSC non è usato", () => {
  assert.doesNotThrow(() =>
    verifySecurityAudit(allowedReport, [{ path: "app/root.tsx", content: "export default {};" }]),
  );
});

test("rifiuta advisory nuovi e l'uso delle API RSC instabili", () => {
  assert.throws(
    () =>
      verifySecurityAudit({
        auditReportVersion: 2,
        vulnerabilities: { pacchetto: { via: [{ source: 42 }] } },
        metadata: { vulnerabilities: { total: 1 } },
      }),
    /non consentito/,
  );
  assert.throws(
    () =>
      verifySecurityAudit(
        {
          auditReportVersion: 2,
          vulnerabilities: {},
          metadata: { vulnerabilities: { total: 0 } },
        },
        [{ path: "app/root.tsx", content: "unstable_createCallServer();" }],
      ),
    /RSC instabili/,
  );
});

test("rifiuta un payload di errore del registry", () => {
  assert.throws(() => verifySecurityAudit({ error: { code: "E403" } }), /non valido/);
});
