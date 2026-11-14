import {
  button,
  formatDate,
  keyboard,
  panel,
  section,
  type OwnerControlMessage,
  type Row,
} from "./presentation-format";
import type { StoreUsageRow } from "./usage.server";

const NUMBER = new Intl.NumberFormat("it-IT");

export function usageMessage(data: {
  since: string;
  days: number;
  cachedAt: string;
  rows: Array<StoreUsageRow & { name: string }>;
}): OwnerControlMessage {
  const measured = data.rows.filter((row) => row.status === "ok");
  const missing = data.rows.filter((row) => row.status !== "ok");
  const ranking: Row[] = measured.length
    ? measured.map((row, index) => [`${index + 1}. ${row.name}`, usageLabel(row)])
    : [["Nessuno store", "Nessuno store con read_orders"]];
  return panel(
    "Utilizzo",
    [
      section(`🏆 Ordini con CF o PEC · ${data.days} giorni`, ranking),
      ...(missing.length
        ? [
            section(
              "Non letti",
              missing.map((row): Row => [
                row.name,
                row.status === "no_scope" ? "Permesso ordini revocato" : "Lettura non riuscita",
              ]),
            ),
          ]
        : []),
    ],
    keyboard([
      [button("Aggiorna", { view: "usage", refresh: true })],
      [button("‹ Dashboard", { view: "dashboard" })],
    ]),
    `Solo store con read_orders, ordini dal ${data.since}; gli altri si leggono dalla Dev Dashboard · ${formatDate(data.cachedAt)}`,
  );
}

function usageLabel(row: StoreUsageRow) {
  const more = row.truncated ? "oltre " : "";
  return `${more}${NUMBER.format(row.either)} su ${more}${NUMBER.format(row.orders)} ordini (CF ${NUMBER.format(row.taxCode)}, PEC ${NUMBER.format(row.pec)})`;
}
