import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useNavigation, useSubmit } from "react-router";
import { DEFAULT_CONFIG, MESSAGE_KEYS, type CheckoutConfig } from "../../config";
import { texts, type Locale } from "../../i18n";
import { messageSubmission, rebaseMessageDraft, updateMessageDraft } from "./messages-draft";
import { setSaveBarVisibility, showToast } from "../../save-bar";
import { useConfigConflict } from "../use-config-conflict";
import type { MessageKey } from "./message-fields";

export const MESSAGES_SAVE_BAR = "cf-ready-messages";
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
  const [discardedResult, setDiscardedResult] = useState<MessageResult>();
  const rejected = result?.ok === false && result !== discardedResult ? result : null;
  const errorCode = rejected?.errorCode ?? null;
  const problem = rejected?.problem;
  const t = texts(saved.locale);
  const [draft, setDraft] = useState<CheckoutConfig["messages"]>(saved.messages);
  const draftRef = useRef(draft);
  const [, startDraftTransition] = useTransition();
  const [activeLocale, setActiveLocale] = useState<Locale>(saved.locale);
  const [selectedKey, setSelectedKey] = useState<MessageKey>("taxCodeRequired");
  const [mounted, setMounted] = useState<Record<string, number>>({});

  const remount = useCallback((fields: string[]) => {
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setMounted((current) => {
      const next = { ...current };
      for (const field of fields) next[field] = (next[field] ?? 0) + 1;
      return next;
    });
  }, []);

  const applySaved = useCallback(
    (sent: CheckoutConfig["messages"]) => {
      const next = rebaseMessageDraft(sent, draftRef.current, saved.messages);
      const normalizedFields = (["it", "en"] as const).flatMap((locale) =>
        MESSAGE_KEYS.flatMap((key) =>
          next[locale][key] !== draftRef.current[locale][key] ? [`${locale}.${key}`] : [],
        ),
      );
      remount(normalizedFields);
      draftRef.current = next;
      setDraft(next);
    },
    [saved.messages, remount],
  );
  const sync = useConfigConflict({
    current: saved.messages,
    configHash: saved.configHash,
    errorCode,
    result,
    busy,
    onSaved: applySaved,
  });
  const { conflict } = sync;

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
      setDraft(() => draftRef.current);
    });
  };

  const discard = () => {
    sync.adoptCurrent();
    setDiscardedResult(result);
    draftRef.current = saved.messages;
    setDraft(saved.messages);
    remount(MESSAGE_FIELDS);
  };

  const save = () => {
    if (!sync.canSend()) return;
    sync.markSent(draftRef.current);
    send(messageSubmission(sync.configHash() ?? "", draftRef.current), { method: "post" });
  };

  const reapply = () => {
    const next = rebaseMessageDraft(sync.base(), draftRef.current, saved.messages);
    sync.adoptCurrent();
    draftRef.current = next;
    setDraft(next);
    remount(MESSAGE_FIELDS);
  };

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
