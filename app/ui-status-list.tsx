import { Fragment, type ReactNode } from "react";
import "./ui-status-list.css";

export type StatusRow = { key: string; label: ReactNode; value: ReactNode };

// P2-T8: righe etichetta-valore (Home, Messaggi, riepilogo dell'onboarding) in una sola griglia
// Polaris. Le righe condividono le colonne, quindi i valori restano allineati anche con le
// etichette inglesi lunghe; l'etichetta occupa al massimo metà riga (CSS: il parser di `s-grid`
// non accetta `fit-content()`). C-2: `s-badge` non va a capo e tronca, quindi fino a 400 px
// etichetta e badge si impilano (riepilogo e Home a 390 e 320 px).
export function StatusList({ rows }: { rows: StatusRow[] }) {
  return (
    <s-query-container>
      <s-grid
        gridTemplateColumns="@container (inline-size > 400px) auto 1fr, 1fr"
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
