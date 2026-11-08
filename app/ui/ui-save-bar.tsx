import { texts, type Locale } from "../i18n";

export function SaveBar({
  id,
  locale,
  busy,
  conflict,
  onSave,
  onDiscard,
}: {
  id: string;
  locale: Locale;
  busy: boolean;
  conflict: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = texts(locale).common;
  return (
    <ui-save-bar id={id}>
      <button
        type="button"
        variant="primary"
        disabled={busy || conflict}
        loading={busy ? "" : undefined}
        onClick={onSave}
      >
        {t.save}
      </button>
      <button type="button" disabled={busy} onClick={onDiscard}>
        {t.cancel}
      </button>
    </ui-save-bar>
  );
}
