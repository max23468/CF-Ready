import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { PerformanceLayoutRegion } from "../performance-contract";

// Polaris 2 passa a due colonne solo quando trova un figlio `slot="aside"`. Se il primo paint
// arriva prima della colonna laterale, il contenuto parte a tutta larghezza e poi si restringe
// (CLS fino a 0,33 sulla Home). Il segnaposto vuoto in testa fissa subito la griglia; la colonna
// vera resta in coda, perché sotto i 784 px sta dopo il contenuto e anticiparla la sposterebbe.
export function PageWithAside({
  heading,
  aside,
  children,
}: {
  heading: string;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <s-page heading={heading}>
      <div slot="aside" hidden />
      {children}
      <s-stack slot="aside" direction="block" gap="base" data-layout-region="aside">
        {aside}
      </s-stack>
    </s-page>
  );
}

// D-199: un blocco presente al primo paint conserva, fino al prossimo caricamento, l'altezza più
// grande raggiunta. Se la conferma Shopify accorcia il contenuto, ciò che segue resta dov'era.
// `flow-root` tiene dentro il blocco i margini dei figli, che la `min-height` smetterebbe di far
// collassare all'esterno.
export function KeepHeight({
  region,
  children,
}: {
  region: PerformanceLayoutRegion;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      element.style.minHeight = `${element.offsetHeight}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="cf-keep-height" data-layout-region={region}>
      {children}
    </div>
  );
}
