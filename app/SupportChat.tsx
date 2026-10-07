import { useEffect, useRef, useState } from "react";
import { SUPPORT_EMAIL, texts, type Locale } from "./i18n";
import "./SupportChat.css";

// Un widget tawk.to per lingua: la lingua del widget si imposta nella dashboard.
const CHAT_URLS: Record<Locale, string> = {
  it: "https://tawk.to/chat/6ac67c330815b934ca8c8652/1k4bnk33m",
  en: "https://tawk.to/chat/6ac67c330815b934ca8c8652/1k4bqnrvs",
};

export function SupportChat({ locale }: { locale: Locale }) {
  const [started, setStarted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const t = texts(locale);

  useEffect(() => {
    if (expanded) panel.current?.focus();
  }, [expanded]);

  return (
    <div className="support-chat">
      <section
        id="support-chat-panel"
        ref={panel}
        tabIndex={-1}
        className="support-chat__panel"
        aria-label={t.support.chatTitle}
        hidden={!expanded}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setExpanded(false);
            document.getElementById("support-chat-toggle")?.focus();
          }
        }}
      >
        {started ? (
          // tawk.to è un'origine diversa dall'app: script e storage restano isolati.
          // I popup servono ai link inviati in chat, che si aprono in una nuova scheda.
          // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
          <iframe
            src={CHAT_URLS[locale]}
            title={t.support.chatTitle}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
            className="support-chat__frame"
          />
        ) : null}
        <s-paragraph>
          {t.support.chatFallback} <s-link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</s-link>
        </s-paragraph>
      </section>
      <button
        type="button"
        id="support-chat-toggle"
        className="support-chat__toggle"
        aria-controls="support-chat-panel"
        aria-expanded={expanded}
        onClick={() => {
          setStarted(true);
          setExpanded(!expanded);
        }}
      >
        <img src="/cf-ready-mark-negative.svg" alt="" width="40" height="40" />
        {expanded ? t.support.minimizeChat : t.support.heading}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          {expanded ? (
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"
              fill="currentColor"
            />
          )}
        </svg>
      </button>
    </div>
  );
}
