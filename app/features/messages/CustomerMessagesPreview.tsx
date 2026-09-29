import type { Locale } from "../../i18n";
import "./CustomerMessagesPreview.css";

type CustomerMessagesPreviewProps = {
  activeLocale: Locale;
  context: string;
  errorHeading: string;
  fieldLabel: string;
  fieldLabelHeading: string;
  heading: string;
  languages: Record<Locale, string>;
  message: string;
  selectedHeading: string;
  selectedLabel: string;
};

export function CustomerMessagesPreview({
  activeLocale,
  context,
  errorHeading,
  fieldLabel,
  fieldLabelHeading,
  heading,
  languages,
  message,
  selectedHeading,
  selectedLabel,
}: CustomerMessagesPreviewProps) {
  return (
    <details className="customer-messages-preview">
      <summary>{heading}</summary>
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
              <s-text>
                {fieldLabelHeading}: <strong lang={activeLocale}>{fieldLabel}</strong>
              </s-text>
              <div lang={activeLocale} className="customer-messages-preview__error">
                <strong>{errorHeading}</strong>
                <p>{message}</p>
              </div>
            </s-stack>

            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text color="subdued">{selectedHeading}</s-text>
              <s-badge>{selectedLabel}</s-badge>
            </s-stack>
          </s-stack>
        </s-box>
      </div>
    </details>
  );
}
