import { useEffect, useRef, useState } from "react";

// Protocollo di concorrenza ottimistica sulla configurazione: la bozza parte da una base con il
// suo hash, il server rifiuta con `config_conflict` se nel frattempo è cambiata.
export function useConfigConflict<T>({
  current,
  configHash,
  errorCode,
  result,
  busy,
  onSaved,
}: {
  current: T;
  configHash: string | null;
  errorCode: string | null;
  result: { ok: boolean } | undefined;
  busy: boolean;
  onSaved?: (sent: T) => void;
}) {
  const baseRef = useRef(current);
  const sentRef = useRef<T | null>(null);
  const baseHash = useRef(configHash);
  const [resolved, setResolved] = useState(false);
  const conflict = errorCode === "config_conflict" && !resolved;

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    const sent = sentRef.current;
    sentRef.current = null;
    if (!result.ok) return;
    onSaved?.(sent);
    baseRef.current = current;
    baseHash.current = configHash;
  }, [result, current, configHash, busy, onSaved]);

  return {
    conflict,
    base: () => baseRef.current,
    configHash: () => baseHash.current,
    canSend: () => !busy && !conflict && !sentRef.current,
    markSent: (draft: T) => {
      sentRef.current = draft;
      setResolved(false);
    },
    adoptCurrent: () => {
      baseRef.current = current;
      baseHash.current = configHash;
      setResolved(true);
    },
  };
}
