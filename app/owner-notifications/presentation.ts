import { safeStoreDisplayName } from "../shop-profile.server";
import {
  type LocalBillingEvent,
  type LocalNotificationEvent,
  type OperationalSnapshot,
  type PartnerCharge,
  type PartnerEventType,
  planLabel,
  validCalendarDate,
  validIsoDate,
} from "./model";

const OWNER_NOTIFICATION_DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});
const OWNER_NOTIFICATION_DAY_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const OWNER_NOTIFICATION_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function notificationBody(
  description: string,
  occurredAt: string,
  sections: Array<{ title: string; lines: string[] }>,
) {
  const content = [description];
  for (const section of sections) {
    if (!section.lines.length) continue;
    content.push("", section.title, ...section.lines);
  }
  content.push("", `🕒 Evento: ${formatDate(occurredAt)}`);
  return content.join("\n");
}

export function storeSection(
  displayName: string | null | undefined,
  shopDomain: string,
  snapshot: Pick<OperationalSnapshot, "country_code" | "shop_currency" | "billing_currency"> | null,
) {
  const name = safeStoreDisplayName(displayName);
  const country = safeCode(snapshot?.country_code, 2);
  const currency = safeCode(snapshot?.billing_currency ?? snapshot?.shop_currency, 3);
  return {
    title: "🏪 Store",
    lines: [
      ...(name ? [`Nome: ${name}`] : []),
      `URL: https://${shopDomain}`,
      ...(country ? [`Paese: ${country}`] : []),
      ...(currency ? [`Valuta: ${currency}`] : []),
    ],
  };
}

export function operationalSection(
  snapshot: OperationalSnapshot | LocalNotificationEvent | null,
  overrides: {
    appStatus?: string;
    onboardingStatus?: string;
    validationStatus?: string;
    plan?: string | null;
    installationDuration?: string | null;
  } = {},
) {
  const appStatus = overrides.appStatus ?? installationStatusLabel(snapshot?.installation_status);
  const onboardingStatus =
    overrides.onboardingStatus ??
    onboardingLabel(snapshot?.onboarding_status, snapshot?.onboarding_step);
  const validationStatus =
    overrides.validationStatus ?? validationLabel(snapshot?.validation_enabled);
  const plan = overrides.plan === undefined ? operationalPlan(snapshot) : overrides.plan;
  const entitlement = entitlementLabel(snapshot?.entitlement_status);
  return {
    title: "⚙️ Stato operativo",
    lines: [
      ...(appStatus ? [`App: ${appStatus}`] : []),
      ...(onboardingStatus ? [`Onboarding: ${onboardingStatus}`] : []),
      ...(validationStatus ? [`Validation: ${validationStatus}`] : []),
      ...(plan ? [`Piano: ${plan}`] : []),
      ...(entitlement ? [`Diritto: ${entitlement}`] : []),
      ...(overrides.installationDuration
        ? [`Durata installazione: ${overrides.installationDuration}`]
        : []),
    ],
  };
}

export function operationalPlan(snapshot: OperationalSnapshot | LocalNotificationEvent | null) {
  return (
    planLabel(snapshot?.plan_kind) ??
    (snapshot?.trial_status === "active" ? "Prova gratuita" : "Nessun piano attivo")
  );
}

export function relationshipStatus(type: PartnerEventType) {
  return {
    RELATIONSHIP_INSTALLED: "Attiva",
    RELATIONSHIP_REACTIVATED: "Attiva",
    RELATIONSHIP_DEACTIVATED: "Disattivata da Shopify",
    RELATIONSHIP_UNINSTALLED: "Disinstallata",
  }[type as Extract<PartnerEventType, `RELATIONSHIP_${string}`>];
}

export function formatDuration(start: string | null | undefined, end: string) {
  if (!validIsoDate(start ?? undefined) || !validIsoDate(end)) return null;
  const duration = Date.parse(end) - Date.parse(start!);
  if (duration < 0) return null;
  const hours = Math.floor(duration / (60 * 60 * 1000));
  if (hours < 24) {
    const displayedHours = Math.max(1, hours);
    return `${displayedHours} ${displayedHours === 1 ? "ora" : "ore"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "giorno" : "giorni"}`;
}

export function relationshipCopy(type: PartnerEventType) {
  return {
    RELATIONSHIP_INSTALLED: {
      subject: "🟢 CF Ready · Nuova installazione",
      description: "Shopify ha registrato una nuova installazione di CF Ready.",
    },
    RELATIONSHIP_REACTIVATED: {
      subject: "🟢 CF Ready · Reinstallazione",
      description: "Shopify ha registrato una reinstallazione o riattivazione di CF Ready.",
    },
    RELATIONSHIP_DEACTIVATED: {
      subject: "🟡 CF Ready · App disattivata",
      description: "Shopify ha disattivato la relazione con CF Ready.",
    },
    RELATIONSHIP_UNINSTALLED: {
      subject: "🔴 CF Ready · Disinstallazione",
      description: "Shopify ha registrato la disinstallazione di CF Ready.",
    },
  }[type as Extract<PartnerEventType, `RELATIONSHIP_${string}`>];
}

export function billingCopy(type: PartnerEventType, changed: boolean) {
  if (changed) {
    return {
      subject: "🔄 CF Ready · Piano cambiato",
      description: "Shopify ha attivato il passaggio a un altro piano.",
    };
  }
  return {
    SUBSCRIPTION_CHARGE_ACCEPTED: {
      subject: "💳 CF Ready · Acquisto piano accettato",
      description: "Il merchant ha accettato l'acquisto del piano.",
    },
    SUBSCRIPTION_CHARGE_ACTIVATED: {
      subject: "🟢 CF Ready · Piano attivato",
      description: "Shopify ha attivato il nuovo piano.",
    },
    SUBSCRIPTION_CHARGE_CANCELED: {
      subject: "🔴 CF Ready · Abbonamento disdetto",
      description: "L'abbonamento è stato disdetto.",
    },
    SUBSCRIPTION_CHARGE_DECLINED: {
      subject: "🔴 CF Ready · Acquisto piano rifiutato",
      description: "Il merchant ha rifiutato l'acquisto del piano.",
    },
    SUBSCRIPTION_CHARGE_EXPIRED: {
      subject: "🟡 CF Ready · Richiesta piano scaduta",
      description: "La richiesta di attivazione del piano è scaduta.",
    },
    SUBSCRIPTION_CHARGE_FROZEN: {
      subject: "🔴 CF Ready · Abbonamento sospeso",
      description: "Shopify ha sospeso l'abbonamento per un problema di fatturazione dello store.",
    },
    SUBSCRIPTION_CHARGE_UNFROZEN: {
      subject: "🟢 CF Ready · Abbonamento riattivato",
      description: "Shopify ha riattivato l'abbonamento precedentemente sospeso.",
    },
    ONE_TIME_CHARGE_ACCEPTED: {
      subject: "💳 CF Ready · Pagamento unico accettato",
      description: "Il merchant ha accettato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_ACTIVATED: {
      subject: "🟢 CF Ready · Pagamento unico attivato",
      description: "Shopify ha attivato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_DECLINED: {
      subject: "🔴 CF Ready · Pagamento unico rifiutato",
      description: "Il merchant ha rifiutato il piano con pagamento unico.",
    },
    ONE_TIME_CHARGE_EXPIRED: {
      subject: "🟡 CF Ready · Pagamento unico scaduto",
      description: "La richiesta del piano con pagamento unico è scaduta.",
    },
  }[type as Exclude<PartnerEventType, `RELATIONSHIP_${string}`>];
}

export function localBillingCopy(
  eventType: LocalBillingEvent["event_type"],
  planKind: LocalBillingEvent["status"],
  changed: boolean,
) {
  if (changed) {
    return {
      subject: "🔄 CF Ready · Piano cambiato",
      description: "Shopify Admin ha confermato il passaggio a un altro piano.",
    };
  }
  if (eventType === "active") {
    return planKind === "one_time"
      ? {
          subject: "🟢 CF Ready · Pagamento unico attivato",
          description: "Shopify Admin ha confermato il piano con pagamento unico.",
        }
      : {
          subject: "🟢 CF Ready · Piano attivato",
          description: "Shopify Admin ha confermato il nuovo piano.",
        };
  }
  return {
    ending: {
      subject: "🟡 CF Ready · Abbonamento in scadenza",
      description:
        "Shopify Admin non espone più il piano come attivo, ma il periodo acquistato non è ancora terminato.",
    },
    expired: {
      subject: "🟡 CF Ready · Abbonamento terminato",
      description: "Shopify Admin ha confermato il termine dell'abbonamento.",
    },
    refunded: {
      subject: "🔴 CF Ready · Pagamento unico rimborsato",
      description: "Shopify Admin non espone più il pagamento unico come attivo.",
    },
  }[eventType];
}

export function partnerBillingState(type: PartnerEventType) {
  return {
    SUBSCRIPTION_CHARGE_ACCEPTED: "accepted",
    SUBSCRIPTION_CHARGE_ACTIVATED: "active",
    SUBSCRIPTION_CHARGE_CANCELED: "ending",
    SUBSCRIPTION_CHARGE_DECLINED: "declined",
    SUBSCRIPTION_CHARGE_EXPIRED: "request_expired",
    SUBSCRIPTION_CHARGE_FROZEN: "frozen",
    SUBSCRIPTION_CHARGE_UNFROZEN: "unfrozen",
    ONE_TIME_CHARGE_ACCEPTED: "accepted",
    ONE_TIME_CHARGE_ACTIVATED: "active",
    ONE_TIME_CHARGE_DECLINED: "declined",
    ONE_TIME_CHARGE_EXPIRED: "request_expired",
  }[type as Exclude<PartnerEventType, `RELATIONSHIP_${string}`>];
}

export function localBillingState(type: LocalBillingEvent["event_type"]) {
  return {
    active: "active",
    ending: "ending",
    expired: "entitlement_expired",
    refunded: "refunded",
  }[type];
}

export function formatDate(value: string) {
  return OWNER_NOTIFICATION_DATE_FORMATTER.format(new Date(value));
}

export function formatCalendarDate(value: string) {
  return OWNER_NOTIFICATION_DAY_FORMATTER.format(new Date(`${value}T00:00:00.000Z`));
}

export function formatMoney(
  money: NonNullable<PartnerCharge["amount"]>,
  kind: "monthly" | "annual" | "one_time" | null,
) {
  const amount = Number(money.amount);
  const currency = money.currencyCode!;
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(amount);
  const cadence =
    kind === "monthly"
      ? " / mese"
      : kind === "annual"
        ? " / anno"
        : kind === "one_time"
          ? " · una tantum"
          : "";
  return `${formatted}${cadence ?? ""}`;
}

export function formatMinorMoney(
  amountMinor: number,
  currency: string,
  kind: "monthly" | "annual" | "one_time",
) {
  return formatMoney({ amount: String(amountMinor / 100), currencyCode: currency }, kind);
}

export function trialDaysRemaining(occurredAt: string, endsAt: string | null) {
  if (!validIsoDate(occurredAt) || !validCalendarDate(endsAt ?? undefined)) return null;
  const start = calendarDateInRome(occurredAt);
  const duration = Date.parse(`${endsAt}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`);
  return Math.max(0, Math.ceil(duration / (24 * 60 * 60 * 1000)));
}

function installationStatusLabel(value: string | null | undefined) {
  return {
    active: "Attiva",
    uninstalled: "Disinstallata",
    blocked_country: "Paese non supportato",
    suspended: "Sospesa",
  }[value ?? ""];
}

function onboardingLabel(status: string | null | undefined, step: number | null | undefined) {
  if (status === "completed") return "Completato";
  if (status === "not_started") return "Non iniziato";
  if (status === "in_progress") return step && step > 0 ? `In corso · step ${step}` : "In corso";
  return null;
}

function validationLabel(value: number | null | undefined) {
  if (value === 1) return "Attiva";
  if (value === 0) return "Non attiva";
  return null;
}

function entitlementLabel(value: string | null | undefined) {
  return {
    trial: "Prova",
    active: "Attivo",
    ending: "In scadenza",
    expired: "Scaduto",
    refunded: "Rimborsato",
    none: "Nessuno",
  }[value ?? ""];
}

function safeCode(value: string | null | undefined, length: number) {
  const normalized = value?.trim().toLocaleUpperCase("en-US");
  return normalized && new RegExp(`^[A-Z]{${length}}$`).test(normalized) ? normalized : null;
}

function calendarDateInRome(value: string) {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of OWNER_NOTIFICATION_CALENDAR_FORMATTER.formatToParts(new Date(value))) {
    fields[part.type] = part.value;
  }
  if (!fields.year || !fields.month || !fields.day) {
    throw new Error("owner_notification_date_format_failed");
  }
  return `${fields.year}-${fields.month}-${fields.day}`;
}
