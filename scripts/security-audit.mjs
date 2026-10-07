import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// D-175: eccezioni temporanee, ciascuna con scadenza. Un avviso ammesso non copre gli altri:
// basta un avviso diverso, o la scadenza superata, perché l'audit torni a bloccare.
export const AUDIT_EXCEPTIONS = [
  // `braces` non ha ancora una versione corretta; arriva solo dagli strumenti di build della Function.
  { advisory: "GHSA-vfj7-8cjw-p6xm", until: "2026-10-31" },
  // `sprintf-js` arriva dalla Shopify CLI; eccezione approvata dall'owner il 7 ottobre.
  { advisory: "GHSA-hp3w-g68c-fv3c", until: "2026-10-31" },
];

export function verifySecurityAudit(
  report,
  today = new Date().toISOString().slice(0, 10),
  exceptions = AUDIT_EXCEPTIONS,
) {
  if (
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.metadata?.vulnerabilities?.total !== "number"
  ) {
    throw new Error("Report npm audit non valido.");
  }
  if (!report.metadata.vulnerabilities.total && !Object.keys(report.vulnerabilities).length) return;
  const allowed = new Set(
    exceptions.filter((exception) => today <= exception.until).map(({ advisory }) => advisory),
  );
  const advisories = Object.values(report.vulnerabilities).flatMap((vulnerability) =>
    (vulnerability.via ?? []).filter((via) => typeof via === "object"),
  );
  const blocking = advisories.filter(
    (advisory) =>
      !allowed.has(
        String(advisory.url ?? "")
          .split("/")
          .pop(),
      ),
  );
  if (advisories.length === 0 || blocking.length > 0) {
    throw new Error("npm audit ha rilevato vulnerabilità.");
  }
}

function main() {
  const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
  if (!result.stdout) throw new Error("npm audit non ha restituito un report JSON.");
  verifySecurityAudit(JSON.parse(result.stdout));
  console.log("Security audit superato: nessuna vulnerabilità fuori dalle eccezioni D-175.");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
