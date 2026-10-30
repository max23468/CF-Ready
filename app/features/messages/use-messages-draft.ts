import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useNavigation, useSubmit } from "react-router";
import { DEFAULT_CONFIG, MESSAGE_KEYS, type CheckoutConfig } from "../../config";
import { texts, type Locale } from "../../i18n";
import { messageSubmission, rebaseMessageDraft, updateMessageDraft } from "../../messages-draft";
import { setSaveBarVisibility, showToast } from "../../save-bar";

export const MESSAGES_SAVE_BAR = "cf-ready-messages";
type MessageKey = (typeof MESSAGE_KEYS)[number];
const MESSAGE_FIELDS = (["it", "en"] as const).flatMap((locale) =>
  MESSAGE_KEYS.map((key) => `${locale}.${key}`),
);
type SavedMessages = {
  messages: CheckoutConfig["messages"];
  configHash: string | null;
  locale: Locale;
};
type MessageResult =
  | { ok: true }
  | {
      ok: false;
      errorCode?: string;
      problem?: { locale: Locale; key: MessageKey };
    };

export function useMessagesDraft(saved: SavedMessages, result: MessageResult | undefined) {
  const send = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const baseRef = useRef(saved.messages);
  const sentRef = useRef<CheckoutConfig["messages"] | null>(null);
  const baseHash = useRef(saved.configHash);
  const [resolvedConflict, setResolvedConflict] = useState(false);
  // Annulla riporta la bozza al salvato: gli errori del salvataggio rifiutato non la descrivono più.
  const [discardedResult, setDiscardedResult] = useState<MessageResult>();
  const rejected = result?.ok === false && result !== discardedResult ? result : null;
  const errorCode = rejected?.errorCode ?? null;
  const problem = rejected?.problem;
  const conflict = errorCode === "config_conflict" && !resolvedConflict;
  const t = texts(saved.locale);
  const [draft, setDraft] = useState<CheckoutConfig["messages"]>(saved.messages);
  const draftRef = useRef(draft);
  const [, startDraftTransition] = useTransition();
  const [activeLocale, setActiveLocale] = useState<Locale>(saved.locale);
  const [selectedKey, setSelectedKey] = useState<MessageKey>("taxCodeRequired");
  // I campi non sono controllati: React che riscrive `value` a ogni tasto farebbe saltare il
  // cursore dentro un testo lungo. Il ripristino li rimonta cambiando chiave, così ripartono
  // dal nuovo valore predefinito senza che React possieda il contenuto.
  const [mounted, setMounted] = useState<Record<string, number>>({});

  const remount = useCallback((fields: string[]) => {
    // La risposta asincrona normalizza i campi uncontrolled: la chiave riallinea il DOM
    // solo dove il server ha cambiato il testo, preservando le battute successive all'invio.
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setMounted((current) => {
      const next = { ...current };
      for (const field of fields) next[field] = (next[field] ?? 0) + 1;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!result || !sentRef.current || busy) return;
    const sent = sentRef.current;
    sentRef.current = null;
    if (!result.ok) return;
    const next = rebaseMessageDraft(sent, draftRef.current, saved.messages);
    const normalizedFields = (["it", "en"] as const).flatMap((locale) =>
      MESSAGE_KEYS.flatMap((key) =>
        next[locale][key] !== draftRef.current[locale][key] ? [`${locale}.${key}`] : [],
      ),
    );
    remount(normalizedFields);
    draftRef.current = next;
    baseRef.current = saved.messages;
    baseHash.current = saved.configHash;
    setDraft(next);
  }, [result, saved.messages, saved.configHash, busy, remount]);

  useEffect(() => {
    if (!result || result.ok || !("problem" in result) || !result.problem) return;
    setActiveLocale(result.problem.locale);
    setSelectedKey(result.problem.key);
  }, [result]);

  const dirty = (["it", "en"] as const).some((locale) =>
    MESSAGE_KEYS.some((key) => draft[locale][key] !== saved.messages[locale][key]),
  );

  useEffect(() => setSaveBarVisibility(MESSAGES_SAVE_BAR, dirty), [dirty]);
  const savedText = t.messages.saved;
  useEffect(() => {
    if (result?.ok) showToast(savedText);
  }, [result, savedText]);

  // `input` copre ogni battuta; ascoltare anche `change` ripeteva lo stesso lavoro al commit.
  // Il campo è uncontrolled: la ref conserva subito la sorgente usata da Salva, mentre
  // contatore, altezza e Save Bar possono aggiornarsi in background senza ritardare l'eco
  // visiva della digitazione.
  const readDraft = (event: { target: EventTarget | null }) => {
    const field = event.target as { name?: string; value?: string } | null;
    const [locale, key] = (field?.name ?? "").split(".");
    if (locale !== "it" && locale !== "en") return;
    if (!(MESSAGE_KEYS as readonly string[]).includes(key)) return;
    const value = field?.value ?? "";
    setSelectedKey(key as MessageKey);
    draftRef.current = updateMessageDraft(
      draftRef.current,
      locale,
      key as (typeof MESSAGE_KEYS)[number],
      value,
    );
    startDraftTransition(() => {
      // Leggere la ref nell'updater impedisce a una transition già accodata di ripristinare
      // una battuta precedente dopo Salva o Annulla.
      setDraft(() => draftRef.current);
    });
  };

  const discard = () => {
    baseRef.current = saved.messages;
    baseHash.current = saved.configHash;
    setResolvedConflict(true);
    setDiscardedResult(result);
    draftRef.current = saved.messages;
    setDraft(saved.messages);
    remount(MESSAGE_FIELDS);
  };

  const save = () => {
    if (busy || conflict || sentRef.current) return;
    sentRef.current = draftRef.current;
    setResolvedConflict(false);
    send(messageSubmission(baseHash.current ?? "", draftRef.current), { method: "post" });
  };

  const reapply = () => {
    const next = rebaseMessageDraft(baseRef.current, draftRef.current, saved.messages);
    baseRef.current = saved.messages;
    draftRef.current = next;
    baseHash.current = saved.configHash;
    setDraft(next);
    setResolvedConflict(true);
    remount(MESSAGE_FIELDS);
  };

  // FR-063: il ripristino agisce su una lingua sola e lo dichiara nella conferma. Non salva da
  // sé: rimette i testi predefiniti nei campi e il salvataggio resta un gesto esplicito.
  const restore = (locale: Locale) => {
    draftRef.current = {
      ...draftRef.current,
      [locale]: { ...DEFAULT_CONFIG.messages[locale] },
    };
    setDraft(draftRef.current);
    remount(MESSAGE_FIELDS.filter((field) => field.startsWith(`${locale}.`)));
  };

  return {
    draft,
    dirty,
    busy,
    conflict,
    errorCode,
    problem,
    activeLocale,
    setActiveLocale,
    selectedKey,
    setSelectedKey,
    mounted,
    readDraft,
    save,
    discard,
    reapply,
    restore,
  };
}
