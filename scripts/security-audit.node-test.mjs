import assert from "node:assert/strict";
import test from "node:test";

import { verifySecurityAudit } from "./security-audit.mjs";

const allowedReport = {
  vulnerabilities: {
    "react-router": { via: [{ source: 1124282 }] },
    "@react-router/dev": { via: ["react-router"] },
  },
};

test("accetta soltanto l'advisory RSC noto quando RSC non è usato", () => {
  assert.doesNotThrow(() =>
    verifySecurityAudit(allowedReport, [{ path: "app/root.tsx", content: "export default {};" }]),
  );
});

test("rifiuta advisory nuovi e l'uso delle API RSC instabili", () => {
  assert.throws(
    () => verifySecurityAudit({ vulnerabilities: { pacchetto: { via: [{ source: 42 }] } } }),
    /non consentito/,
  );
  assert.throws(
    () =>
      verifySecurityAudit({ vulnerabilities: {} }, [
        { path: "app/entry.rsc.tsx", content: "export default {};" },
      ]),
    /RSC instabili/,
  );
});
