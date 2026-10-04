import type { ComponentProps, ReactNode } from "react";
import "./ui-disclosure.css";

// P2-T9: il catalogo Polaris non ha un accordion, quindi resta `details`, accessibile e usabile da
// tastiera senza reimplementare nulla. Il chevron è l'icona Polaris (giù chiuso, su aperto, senza
// rotazioni che in WebKit spostano il summary di un pixel), sempre al bordo finale del `summary`:
// un disclosure annidato nel corpo di un pannello lo allinea a quello del pannello.
export function Disclosure({
  summary,
  children,
  panel = false,
  className,
  id,
  onToggle,
}: {
  summary: ReactNode;
  children: ReactNode;
  // Pannello bordato con spazi interni (Regole); senza, il disclosure è leggero (FAQ, simulatore).
  panel?: boolean;
  className?: string;
  id?: string;
  onToggle?: ComponentProps<"details">["onToggle"];
}) {
  const details = (
    <details
      className={["cf-disclosure", panel ? "cf-disclosure--panel" : null, className]
        .filter(Boolean)
        .join(" ")}
      id={id}
      onToggle={onToggle}
    >
      <summary className="cf-disclosure__summary">
        <div className="cf-disclosure__label">{summary}</div>
        <span className="cf-disclosure__icon" aria-hidden="true">
          <s-icon type="chevron-down" />
        </span>
        <span className="cf-disclosure__icon cf-disclosure__icon--open" aria-hidden="true">
          <s-icon type="chevron-up" />
        </span>
      </summary>
      <div className="cf-disclosure__body">{children}</div>
    </details>
  );
  return panel ? (
    <s-box borderWidth="base" borderRadius="base">
      {details}
    </s-box>
  ) : (
    details
  );
}
