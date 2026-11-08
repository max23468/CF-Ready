import type { ComponentProps, ReactNode } from "react";
import "./ui-disclosure.css";

// Il catalogo Polaris non ha un accordion, quindi resta `details`. Due icone al posto di una
// rotazione, che in WebKit sposta il summary di un pixel.
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
