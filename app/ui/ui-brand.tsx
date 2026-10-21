// P2-T5, N-3: il logo ha due sole forme. `s-avatar` è pensato per persone e la favicon porta il
// fondo panna della scheda del browser: nell'app si usa il marchio positivo senza fondo
// (`docs/brand/assets/icon.svg`), decorativo accanto a un titolo che nomina la superficie.
export function BrandMark() {
  return (
    <s-box inlineSize="32px">
      <s-image src="/cf-ready-mark.svg" alt="" aspectRatio="1/1" objectFit="contain" />
    </s-box>
  );
}

// Lockup alla sua larghezza nativa e allineato al testo della colonna laterale.
export function BrandLockup({ alt = "" }: { alt?: string }) {
  return (
    <s-box inlineSize="128px">
      <s-image src="/cf-ready-lockup.svg" alt={alt} aspectRatio="16/3" objectFit="contain" />
    </s-box>
  );
}
