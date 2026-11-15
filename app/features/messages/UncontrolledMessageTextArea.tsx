import { useCallback, useEffect, useRef } from "react";

// Almeno due righe come il ripiego; oltre venti, più dei 200 caratteri ammessi su righe normali,
// il campo scorre invece di allungare la pagina. Polaris misura la textarea con `border-box`:
// i limiti aggiungono padding e bordo verticali, letti dal campo (12px nella versione attuale).
const FRAME_PROPERTY = "--cf-text-area-frame";
let sheet: CSSStyleSheet | undefined;
function fitContentSheet() {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(`textarea {
      field-sizing: content;
      min-block-size: calc(2lh + var(${FRAME_PROPERTY}, 12px));
      max-block-size: calc(20lh + var(${FRAME_PROPERTY}, 12px));
    }`);
  }
  return sheet;
}

function fitContent(field: HTMLElementTagNameMap["s-text-area"]) {
  const root = field.shadowRoot;
  const input = root?.querySelector("textarea");
  if (!root || !input) return false;
  const style = getComputedStyle(input);
  const frame = [
    style.paddingTop,
    style.paddingBottom,
    style.borderTopWidth,
    style.borderBottomWidth,
  ].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
  field.style.setProperty(FRAME_PROPERTY, `${frame}px`);
  if (!root.adoptedStyleSheets.includes(fitContentSheet())) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, fitContentSheet()];
  }
  return true;
}

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
    // Dove il browser adatta da sé l'altezza al testo, un foglio di stile nello shadow root di
    // Polaris basta e non si misura niente a ogni battuta. Le misure qui sotto restano il
    // ripiego per Firefox prima della 152 e Safari prima della 26.2.
    // Se Polaris ha già disegnato il campo il foglio vale prima del paint, altrimenti al frame
    // successivo.
    if (CSS.supports("field-sizing", "content")) {
      if (fitContent(field)) return;
      const frame = requestAnimationFrame(() => fitContent(field));
      return () => cancelAnimationFrame(frame);
    }
    let observer: ResizeObserver | undefined;
    let resizeFrame = 0;
    const resize = () => {
      const input = field.shadowRoot?.querySelector("textarea");
      if (!input) return;
      const style = getComputedStyle(input);
      const lineHeight = Number.parseFloat(style.lineHeight);
      if (!lineHeight || !input.clientWidth) return;
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
