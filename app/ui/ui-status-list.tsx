import { Fragment, type ReactNode } from "react";
import "./ui-status-list.css";

type StatusRow = { key: string; label: ReactNode; value: ReactNode };

// Il parser di `s-grid` non accetta `fit-content()`, quindi la larghezza massima dell'etichetta
// sta nel CSS. `s-badge` non va a capo e tronca: fino a 400 px etichetta e badge si impilano.
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
