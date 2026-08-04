import { readFile } from "node:fs/promises";

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

// Soglia scelta sulla cadenza della manutenzione, che è mensile: 45 giorni garantiscono
// almeno un avviso prima della scadenza anche se cade subito dopo un controllo.
export const WARNING_DAYS = 45;

// Le righe della tabella «Scadenze» dell'inventario secret sono la fonte: una scadenza
// vive dove vive il resto del registro, invece che in una costante dentro un workflow.
export function readExpiries(inventory) {
  const expiries = [];
  for (const line of inventory.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const name = cells[1].replaceAll("`", "");
    const bold = cells[3];
    if (!name || !bold.startsWith("**") || !bold.endsWith("**")) continue;
    const [day, month, year] = bold.slice(2, -2).split(" ");
    const index = MONTHS.indexOf((month ?? "").toLowerCase());
    if (index < 0 || !Number(day) || !Number(year)) continue;
    expiries.push({
      name,
      environment: cells[2],
      date: Date.UTC(Number(year), index, Number(day)),
      label: `${day} ${month} ${year}`,
    });
  }
  return expiries;
}

export function findExpiringSoon(expiries, today) {
  const now = Date.parse(today);
  return expiries
    .map((expiry) => ({ ...expiry, days: Math.round((expiry.date - now) / 86_400_000) }))
    .filter(({ days }) => days <= WARNING_DAYS);
}

async function main() {
  const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const expiries = readExpiries(await readFile("docs/runbooks/secret-inventory.md", "utf8"));
  const soon = findExpiringSoon(expiries, today);
  for (const { name, environment, days, label } of soon) {
    console.log(`::warning::${name} (${environment}) scade fra ${days} giorni, il ${label}.`);
  }
  console.log(
    `Credenziali con scadenza registrata: ${expiries.length}; in scadenza entro ${WARNING_DAYS} giorni: ${soon.length}.`,
  );
}

if (import.meta.main) await main();
