import { Fragment, type ReactNode } from "react";
import "./ui-status-list.css";

export type StatusRow = { key: string; label: ReactNode; value: ReactNode };

// P2-T8: righe etichetta-valore (Home, Messaggi, riepilogo dell'onboarding) in una sola griglia
// Polaris. Le righe condividono le colonne, quindi i valori restano allineati anche con le
// etichette inglesi lunghe; l'etichetta occupa al massimo metà riga (CSS: il parser di `s-grid`
// non accetta `fit-content()`). Sotto 200 px, una larghezza che le pagine non raggiungono
// (la colonna laterale di Messaggi a 320 px è larga 224 px), si impila.
export function StatusList({ rows }: { rows: StatusRow[] }) {
  return (
    <s-query-container>
      <s-grid
        gridTemplateColumns="@container (inline-size > 200px) auto 1fr, 1fr"
        alignItems="center"
        columnGap="base"
        rowGap="small-300"
      >
        {rows.map((row) => (
          <Fragment key={row.key}>
            <div className="cf-status-list__label">{row.label}</div>
            <div className="cf-status-list__value">{row.value}</div>
          </Fragment>
        ))}
      </s-grid>
    </s-query-container>
  );
}
