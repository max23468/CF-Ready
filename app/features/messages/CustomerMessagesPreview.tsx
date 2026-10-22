import type { Locale } from "../../i18n";
import "./CustomerMessagesPreview.css";

type CustomerMessagesPreviewProps = {
  activeLocale: Locale;
  fieldLabel: string;
  // Assente mentre si attende la lettura da Shopify: non si dichiara una provenienza ignota.
  fieldLabelHeading?: string;
  heading: string;
  message: string;
  selectedLabel: string;
};

export function CustomerMessagesPreview({
  activeLocale,
  fieldLabel,
  fieldLabelHeading,
  heading,
  message,
  selectedLabel,
}: CustomerMessagesPreviewProps) {
  return (
    <div className="customer-messages-preview">
      <div className="cf-motion-swap" key={`${activeLocale}-${selectedLabel}`}>
        <s-box background="subdued" borderRadius="base" padding="base">
          <s-stack direction="block" gap="small-100">
            <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-100" alignItems="start">
              <s-icon type="view" color="subdued" />
              <s-text type="strong">
                {heading}: {selectedLabel}
              </s-text>
            </s-grid>

            <s-stack direction="block" gap="small-100">
              {fieldLabelHeading ? <s-text color="subdued">{fieldLabelHeading}</s-text> : null}
              <CheckoutErrorPreview locale={activeLocale} label={fieldLabel} message={message} />
            </s-stack>
          </s-stack>
        </s-box>
      </div>
    </div>
  );
}

// N-1: esempio condiviso da Messaggi e onboarding. Un campo nativo in sola lettura con l'errore
// in linea somiglia al checkout e non si confonde con i campi modificabili.
export function CheckoutErrorPreview({
  locale,
  label,
  message,
}: {
  locale: Locale;
  label: string;
  message: string;
}) {
  return (
    <div lang={locale} className="customer-messages-preview__error">
      <s-text-field readOnly label={label} value="" error={message} />
    </div>
  );
}
