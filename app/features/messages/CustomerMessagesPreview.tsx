import type { Locale } from "../../i18n";

type CustomerMessagesPreviewProps = {
  activeLocale: Locale;
  context: string;
  errorHeading: string;
  heading: string;
  languageLabel: string;
  languages: Record<Locale, string>;
  message: string;
  onLocaleChange: (locale: Locale) => void;
  selectedHeading: string;
  selectedLabel: string;
};

export function CustomerMessagesPreview({
  activeLocale,
  context,
  errorHeading,
  heading,
  languageLabel,
  languages,
  message,
  onLocaleChange,
  selectedHeading,
  selectedLabel,
}: CustomerMessagesPreviewProps) {
  return (
    <s-stack direction="block" gap="base">
      <s-select
        label={languageLabel}
        value={activeLocale}
        onChange={(event) => onLocaleChange(event.currentTarget.value as Locale)}
      >
        <s-option value="it">{languages.it}</s-option>
        <s-option value="en">{languages.en}</s-option>
      </s-select>

      <div className="cf-motion-swap" key={`${activeLocale}-${selectedLabel}`}>
        <s-box background="subdued" borderRadius="base" padding="base">
          <s-stack direction="block" gap="base">
            <s-stack
              direction="inline"
              gap="small-100"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-icon type="view" color="subdued" />
                <s-text type="strong">{heading}</s-text>
              </s-stack>
              <s-badge>{languages[activeLocale]}</s-badge>
            </s-stack>

            <s-stack direction="block" gap="small-100">
              <s-text color="subdued">{context}</s-text>
              <s-banner tone="critical" heading={errorHeading}>
                <s-paragraph>{message}</s-paragraph>
              </s-banner>
            </s-stack>

            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text color="subdued">{selectedHeading}</s-text>
              <s-badge>{selectedLabel}</s-badge>
            </s-stack>
          </s-stack>
        </s-box>
      </div>
    </s-stack>
  );
}
