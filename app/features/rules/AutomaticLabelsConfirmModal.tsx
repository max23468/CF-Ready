import type { CheckoutLabelSlot } from "../../checkout-labels/domain";
import { texts, type Locale } from "../../i18n";

export function AutomaticLabelsConfirmModal({
  id,
  locale,
  writes,
  onConfirm,
}: {
  id: string;
  locale: Locale;
  writes: Array<{ slot: CheckoutLabelSlot; proposed: string }>;
  onConfirm: () => void;
}) {
  const t = texts(locale);
  const copy = t.rules.labels;
  return (
    <s-modal
      id={id}
      heading={copy.enableConfirmHeading}
      accessibilityLabel={copy.enableConfirmHeading}
    >
      <s-stack direction="block" gap="base">
        <s-paragraph>{copy.enableConfirmBody}</s-paragraph>
        <s-unordered-list>
          {writes.map(({ slot, proposed }) => (
            <s-list-item key={`${slot.name}:${slot.family}`}>
              {slot.name === "taxCode" ? t.rules.taxCodeLabel : t.rules.pecLabel} ·{" "}
              {slot.family === "it" ? copy.italian : copy.english}: {proposed}
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-stack>
      <s-button slot="secondary-actions" commandFor={id} command="--hide">
        {t.common.cancel}
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        commandFor={id}
        command="--hide"
        onClick={onConfirm}
      >
        {copy.enableConfirmAction}
      </s-button>
    </s-modal>
  );
}
