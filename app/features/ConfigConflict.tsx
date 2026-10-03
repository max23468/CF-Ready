import { texts, type Locale } from "../i18n";
import { RevealBanner } from "../ui-feedback";

export function ConfigConflict({
  locale,
  rows,
  busy,
  onReapply,
  onDiscard,
}: {
  locale: Locale;
  rows: { label: string; current: string; draft: string }[];
  busy: boolean;
  onReapply: () => void;
  onDiscard: () => void;
}) {
  const t = texts(locale).conflict;
  return (
    // Il conflitto blocca il salvataggio: è un avviso che si porta in vista, come gli altri (T13).
    <RevealBanner tone="warning" heading={t.heading}>
      <s-stack direction="block" gap="base">
        <s-paragraph>{t.body}</s-paragraph>
        {rows.map((row) =>
          row.current === row.draft ? null : (
            <s-box key={row.label} padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small-100">
                <s-text type="strong">{row.label}</s-text>
                <s-paragraph>
                  {t.current}: {row.current}
                </s-paragraph>
                <s-paragraph>
                  {t.draft}: {row.draft}
                </s-paragraph>
              </s-stack>
            </s-box>
          ),
        )}
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" disabled={busy} onClick={onReapply}>
            {t.reapply}
          </s-button>
          <s-button disabled={busy} onClick={onDiscard}>
            {t.discard}
          </s-button>
        </s-stack>
      </s-stack>
    </RevealBanner>
  );
}
