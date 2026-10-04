import type { Locale } from "../../i18n";
import "./CustomerMessagesPreview.css";

type CustomerMessagesPreviewProps = {
  activeLocale: Locale;
  context: string;
  fieldLabel: string;
  fieldLabelHeading: string;
  heading: string;
  hint: string;
  message: string;
  // Sempre presente: se compare solo per alcuni messaggi l'anteprima cambia altezza e sposta
  // i campi sotto il puntatore.
  availability: string;
  selectedHeading: string;
  selectedLabel: string;
};

export function CustomerMessagesPreview({
  activeLocale,
  context,
  fieldLabel,
  fieldLabelHeading,
  heading,
  hint,
  message,
  availability,
  selectedHeading,
  selectedLabel,
}: CustomerMessagesPreviewProps) {
  return (
    <div className="customer-messages-preview">
      <div className="cf-motion-swap" key={`${activeLocale}-${selectedLabel}`}>
        <s-box background="subdued" borderRadius="base" padding="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-icon type="view" color="subdued" />
              <s-text type="strong">{heading}</s-text>
            </s-stack>

            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">
                {context}, {fieldLabelHeading}
              </s-text>
              <CheckoutErrorPreview locale={activeLocale} label={fieldLabel} message={message} />
            </s-stack>

            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-text color="subdued">{selectedHeading}</s-text>
              <s-badge>{selectedLabel}</s-badge>
            </s-stack>
            <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-100" alignItems="start">
              <s-icon type="info" color="subdued" />
              <s-text color="subdued">{availability}</s-text>
            </s-grid>
          </s-stack>
        </s-box>
      </div>
      <s-box paddingBlockStart="small-100">
        <s-text color="subdued">{hint}</s-text>
      </s-box>
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
