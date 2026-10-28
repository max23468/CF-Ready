import { supportMailto, texts } from "../../i18n";
import type { HomeData } from "./home.server";

export function MerchantCheckIn({
  data,
  busy,
  pendingIntent,
  onDismiss,
}: {
  data: HomeData;
  busy: boolean;
  pendingIntent: string | null;
  onDismiss: () => void;
}) {
  const t = texts(data.locale);

  return (
    <s-banner
      heading={t.home.checkInHeading}
      tone="info"
      dismissible
      onDismiss={onDismiss}
      data-layout-region="checkin"
    >
      <s-paragraph>{t.home.checkInBody}</s-paragraph>
      <s-button
        slot="secondary-actions"
        href={supportMailto(
          {
            shopDomain: data.shopDomain,
            version: data.version,
            countryCode: data.countryCode,
            entitlement: data.entitlement.kind !== "none",
            validationEnabled: data.validationEnabled,
            errorCode: data.errorCode,
          },
          data.locale,
          "other",
        )}
      >
        {t.home.checkInContact}
      </s-button>
      <s-button
        slot="secondary-actions"
        disabled={busy}
        loading={pendingIntent === "dismiss_checkin"}
        onClick={onDismiss}
      >
        {t.home.checkInDismiss}
      </s-button>
    </s-banner>
  );
}
