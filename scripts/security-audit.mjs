import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function verifySecurityAudit(report) {
  if (
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.metadata?.vulnerabilities?.total !== "number"
  ) {
    throw new Error("Report npm audit non valido.");
  }
  if (report.metadata.vulnerabilities.total || Object.keys(report.vulnerabilities).length) {
    throw new Error("npm audit ha rilevato vulnerabilità.");
  }
}

function main() {
  const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
  if (!result.stdout) throw new Error("npm audit non ha restituito un report JSON.");
  verifySecurityAudit(JSON.parse(result.stdout));
  console.log("Security audit superato: nessuna vulnerabilità rilevata.");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
