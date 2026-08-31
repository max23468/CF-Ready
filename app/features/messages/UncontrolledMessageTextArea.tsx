import { useCallback, useRef } from "react";

export function UncontrolledMessageTextArea({
  details,
  error,
  initialValue,
  label,
  name,
  onBlur,
  onFocus,
  rows,
}: {
  details?: string;
  error?: string;
  initialValue: string;
  label: string;
  name: string;
  onBlur: () => void;
  onFocus: () => void;
  rows: number;
}) {
  const initialValueRef = useRef(initialValue);
  // Polaris riflette `defaultValue` prima dell'idratazione e React lo segnala come diverso
  // anche quando il testo coincide. La ref inizializza la proprietà al mount, poi lascia il
  // campo non controllato: digitazione e cursore restano interamente nativi.
  const initialize = useCallback((field: HTMLElementTagNameMap["s-text-area"] | null) => {
    if (field) field.value = initialValueRef.current;
  }, []);

  return (
    <s-text-area
      ref={initialize}
      label={label}
      name={name}
      rows={rows}
      details={details}
      error={error}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
