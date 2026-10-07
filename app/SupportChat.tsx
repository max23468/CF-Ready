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
      <s-button
        id="support-chat-toggle"
        aria-controls="support-chat-panel"
        aria-expanded={expanded}
        onClick={() => {
          setStarted(true);
          setExpanded(!expanded);
        }}
      >
        {expanded ? t.support.minimizeChat : t.support.heading}
      </s-button>
    </div>
  );
}
