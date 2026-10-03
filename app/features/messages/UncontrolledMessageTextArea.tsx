import { useCallback, useEffect, useRef } from "react";

export function UncontrolledMessageTextArea({
  details,
  error,
  initialValue,
  label,
  name,
  onFocus,
  rows,
}: {
  details?: string;
  error?: string;
  initialValue: string;
  label: string;
  name: string;
  onFocus: () => void;
  rows: number;
}) {
  const initialValueRef = useRef(initialValue);
  const fieldRef = useRef<HTMLElementTagNameMap["s-text-area"] | null>(null);
  // Polaris riflette `defaultValue` prima dell'idratazione e React lo segnala come diverso
  // anche quando il testo coincide. La ref inizializza la proprietà al mount, poi lascia il
  // campo non controllato: digitazione e cursore restano interamente nativi.
  const initialize = useCallback((field: HTMLElementTagNameMap["s-text-area"] | null) => {
    fieldRef.current = field;
    if (field) field.value = initialValueRef.current;
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let observer: ResizeObserver | undefined;
    let resizeFrame = 0;
    const resize = () => {
      const input = field.shadowRoot?.querySelector("textarea");
      if (!input) return;
      const style = getComputedStyle(input);
      const lineHeight = Number.parseFloat(style.lineHeight);
      if (!lineHeight || !input.clientWidth) return;
      // Ridurre prima le righe consente anche di accorciare il campo dopo una cancellazione.
      input.rows = 2;
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const visibleRows = Math.max(2, Math.ceil((input.scrollHeight - padding) / lineHeight));
      field.rows = visibleRows;
      input.rows = visibleRows;
    };
    // Polaris completa il proprio render dopo React; la prima misura attende quel frame.
    const frame = requestAnimationFrame(() => {
      const input = field.shadowRoot?.querySelector("textarea");
      if (!input) return;
      let width = 0;
      observer = new ResizeObserver(([entry]) => {
        const nextWidth = entry.borderBoxSize[0].inlineSize;
        if (nextWidth === width) return;
        width = nextWidth;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
      });
      observer.observe(input, { box: "border-box" });
      field.addEventListener("input", resize);
      resize();
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      field.removeEventListener("input", resize);
    };
  }, [rows]);

  return (
    <s-text-area
      ref={initialize}
      label={label}
      name={name}
      rows={rows}
      details={details}
      error={error}
      onFocus={onFocus}
    />
  );
}
