import type { ReactNode } from "react";

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
      <s-stack slot="aside" direction="block" gap="base">
        {aside}
      </s-stack>
    </s-page>
  );
}
