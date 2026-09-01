import { describe, expect, test } from "vitest";
import {
  localBillingPlan,
  localNotificationEvent,
  normalizeShopDomain,
  planKindFromCharge,
  planLabel,
  safePlanName,
  validCalendarDate,
  validIsoDate,
  validLocalBillingEvent,
  validMinorMoney,
  validMoney,
  validPartnerEvent,
  type LocalBillingEvent,
  type LocalNotificationEvent,
  type OperationalSnapshot,
  type PartnerEventNode,
  type PartnerEventType,
} from "../app/owner-notifications/model";
import {
  billingCopy,
  formatCalendarDate,
  formatDate,
  formatDuration,
  formatMinorMoney,
  formatMoney,
  localBillingCopy,
  localBillingState,
  notificationBody,
  operationalPlan,
  operationalSection,
  partnerBillingState,
  relationshipCopy,
  relationshipStatus,
  storeSection,
  trialDaysRemaining,
} from "../app/owner-notifications/presentation";

const SNAPSHOT: OperationalSnapshot = {
  display_name: "Negozio",
  installation_status: "active",
  country_code: "it",
  shop_currency: "eur",
  billing_currency: null,
  installed_at: "2026-08-01T10:00:00.000Z",
  onboarding_status: "in_progress",
  onboarding_step: 2,
  validation_enabled: 1,
  trial_status: null,
  trial_ends_at: null,
  plan_kind: "monthly",
  entitlement_status: "active",
};

function billingEvent(overrides: Partial<LocalBillingEvent> = {}): LocalBillingEvent {
  return {
    ...SNAPSHOT,
    id: 1,
    shop_domain: "contratti.myshopify.com",
    shopify_resource_gid: "gid://shopify/AppSubscription/1",
    event_type: "active",
    status: "monthly",
    amount_minor: 299,
    currency: "EUR",
    period_end: "2026-09-01",
    occurred_at: "2026-08-01T10:00:00.000Z",
    previous_plan_kind: "none",
    ...overrides,
  };
}

function partnerEvent(overrides: Partial<PartnerEventNode> = {}): PartnerEventNode {
  return {
    type: "SUBSCRIPTION_CHARGE_ACTIVATED",
    occurredAt: "2026-08-01T10:00:00.000Z",
    shop: {
      id: "gid://partners/Shop/1",
      myshopifyDomain: "contratti.myshopify.com",
      name: "Negozio",
    },
    charge: {
      id: "gid://shopify/AppSubscription/1",
      name: "CF Ready mensile",
      amount: { amount: "2.99", currencyCode: "EUR" },
      test: false,
    },
    ...overrides,
  };
}

describe("contratti dei dati delle notifiche owner", () => {
  test("normalizza soltanto domini Shopify e nomi di piano sicuri", () => {
    expect(normalizeShopDomain(" HTTPS://Negozio.MYSHOPIFY.COM/ ")).toBe("negozio.myshopify.com");
    for (const value of [
      "negozio.example.com",
      "-negozio.myshopify.com",
      "negozio.myshopify.com/x",
    ]) {
      expect(() => normalizeShopDomain(value)).toThrow("partner_api_invalid_shop_domain");
    }
    expect(safePlanName(undefined)).toBeNull();
    expect(safePlanName("\u0000  Piano\n annuale  ")).toBe("Piano annuale");
    expect(safePlanName("\u0000\n")).toBeNull();
    expect(safePlanName("x".repeat(140))).toHaveLength(120);
  });

  test("classifica piani ricorrenti, una tantum e fallback locali", () => {
    expect(planKindFromCharge("ONE_TIME_CHARGE_ACCEPTED", undefined)).toBe("one_time");
    expect(planKindFromCharge("SUBSCRIPTION_CHARGE_ACTIVATED", "Piano annuale")).toBe("annual");
    expect(planKindFromCharge("SUBSCRIPTION_CHARGE_ACTIVATED", "Piano mensile")).toBe("monthly");
    expect(planKindFromCharge("SUBSCRIPTION_CHARGE_ACTIVATED", "Piano speciale")).toBeNull();
    expect(planKindFromCharge("SUBSCRIPTION_CHARGE_ACTIVATED", undefined)).toBeNull();
    expect(planLabel("monthly")).toBe("Mensile");
    expect(planLabel("sconosciuto")).toBeUndefined();
    expect(localBillingPlan(billingEvent({ status: "annual" }))).toBe("annual");
    expect(localBillingPlan(billingEvent({ status: "none", previous_plan_kind: "monthly" }))).toBe(
      "monthly",
    );
    expect(
      localBillingPlan(billingEvent({ status: "none", previous_plan_kind: "none" })),
    ).toBeNull();
    expect(localBillingPlan(billingEvent({ status: "none", previous_plan_kind: null }))).toBeNull();
  });

  test("rifiuta ogni forma incompleta degli eventi Partner", () => {
    expect(validPartnerEvent(partnerEvent())).toBe(true);
    expect(validPartnerEvent(undefined)).toBe(false);
    expect(validPartnerEvent(partnerEvent({ type: "IGNORED" }))).toBe(false);
    expect(validPartnerEvent(partnerEvent({ occurredAt: "non-data" }))).toBe(false);
    expect(
      validPartnerEvent(partnerEvent({ shop: { id: "1", myshopifyDomain: "invalid", name: "X" } })),
    ).toBe(false);
    expect(
      validPartnerEvent(partnerEvent({ shop: { id: "1", myshopifyDomain: "x.myshopify.com" } })),
    ).toBe(false);
    expect(validPartnerEvent(partnerEvent({ charge: undefined }))).toBe(false);
    expect(
      validPartnerEvent(
        partnerEvent({
          charge: {
            id: "1",
            name: "Piano",
            amount: { amount: "-1", currencyCode: "EUR" },
            test: false,
          },
        }),
      ),
    ).toBe(false);
    expect(
      validPartnerEvent(
        partnerEvent({
          type: "RELATIONSHIP_INSTALLED",
          charge: undefined,
        }),
      ),
    ).toBe(true);
  });

  test("valida eventi locali, denaro e date senza coercizioni", () => {
    const local = billingEvent();
    expect(validLocalBillingEvent(local)).toBe(true);
    for (const invalid of [
      billingEvent({ shopify_resource_gid: "" }),
      billingEvent({ event_type: "ignored" as LocalBillingEvent["event_type"] }),
      billingEvent({ status: "ignored" as LocalBillingEvent["status"] }),
      billingEvent({ status: "none", previous_plan_kind: "none" }),
      billingEvent({ occurred_at: "non-data" }),
    ]) {
      expect(validLocalBillingEvent(invalid)).toBe(false);
    }
    expect(validMinorMoney(299, "EUR")).toBe(true);
    expect(validMinorMoney(299, null)).toBe(false);
    expect(validMinorMoney(null, "EUR")).toBe(false);
    expect(validMinorMoney(-1, "EUR")).toBe(false);
    expect(validMinorMoney(1.5, "EUR")).toBe(false);
    expect(validMoney({ amount: "1", currencyCode: "EUR" })).toBe(true);
    expect(validMoney(undefined)).toBe(false);
    expect(validMoney({ amount: "x", currencyCode: "EUR" })).toBe(false);
    expect(validMoney({ amount: "1", currencyCode: "EU" })).toBe(false);
    expect(validMoney({ amount: "1", currencyCode: "ZZZ" })).toBe(true);
    expect(validIsoDate("2026-08-01T10:00:00.000Z")).toBe(true);
    expect(validIsoDate(undefined)).toBe(false);
    expect(validCalendarDate("2024-02-29")).toBe(true);
    expect(validCalendarDate(undefined)).toBe(false);
    expect(validCalendarDate("2023-02-29")).toBe(false);
    expect(validCalendarDate("01-08-2026")).toBe(false);
  });

  test("riconosce soltanto gli eventi locali notificabili", () => {
    const event = { event_name: "trial_started" } as LocalNotificationEvent;
    expect(localNotificationEvent(event)).toBe(true);
    expect(
      localNotificationEvent({
        ...event,
        event_name: "ignored" as LocalNotificationEvent["event_name"],
      }),
    ).toBe(false);
  });
});

describe("presentazione deterministica delle notifiche owner", () => {
  test("omette sezioni vuote e normalizza store e stato operativo", () => {
    expect(
      notificationBody("Evento", "2026-08-01T10:00:00.000Z", [{ title: "Vuota", lines: [] }]),
    ).not.toContain("Vuota");
    expect(
      storeSection("\u0000", "x.myshopify.com", {
        country_code: " i1 ",
        shop_currency: " euro ",
        billing_currency: " eur ",
      }),
    ).toEqual({
      title: "🏪 Store",
      lines: ["URL: https://x.myshopify.com", "Valuta: EUR"],
    });
    expect(
      storeSection("Negozio", "x.myshopify.com", {
        country_code: " it ",
        shop_currency: " eur ",
        billing_currency: null,
      }).lines,
    ).toContain("Paese: IT");
    expect(operationalSection(SNAPSHOT).lines).toEqual([
      "App: Attiva",
      "Onboarding: In corso · step 2",
      "Validation: Attiva",
      "Piano: Mensile",
      "Diritto: Attivo",
    ]);
    expect(
      operationalSection(
        {
          ...SNAPSHOT,
          onboarding_status: "not_started",
          validation_enabled: 0,
          entitlement_status: "ending",
        },
        { appStatus: "Manuale", plan: null, installationDuration: "2 ore" },
      ).lines,
    ).toEqual([
      "App: Manuale",
      "Onboarding: Non iniziato",
      "Validation: Non attiva",
      "Diritto: In scadenza",
      "Durata installazione: 2 ore",
    ]);
    expect(operationalPlan({ ...SNAPSHOT, plan_kind: null, trial_status: "active" })).toBe(
      "Prova gratuita",
    );
    expect(operationalPlan(null)).toBe("Nessun piano attivo");
    expect(
      operationalSection({
        ...SNAPSHOT,
        installation_status: "unknown",
        onboarding_status: "in_progress",
        onboarding_step: 0,
        validation_enabled: null,
        plan_kind: null,
        entitlement_status: "unknown",
      }).lines,
    ).toEqual(["Onboarding: In corso", "Piano: Nessun piano attivo"]);
  });

  test("copre stati lifecycle, billing e relativi testi", () => {
    const relationships: PartnerEventType[] = [
      "RELATIONSHIP_INSTALLED",
      "RELATIONSHIP_REACTIVATED",
      "RELATIONSHIP_DEACTIVATED",
      "RELATIONSHIP_UNINSTALLED",
    ];
    expect(relationships.map(relationshipStatus)).toEqual([
      "Attiva",
      "Attiva",
      "Disattivata da Shopify",
      "Disinstallata",
    ]);
    expect(relationships.map(relationshipCopy)).toHaveLength(4);
    expect(billingCopy("SUBSCRIPTION_CHARGE_ACTIVATED", true).subject).toContain("cambiato");
    const billingTypes = [
      "SUBSCRIPTION_CHARGE_ACCEPTED",
      "SUBSCRIPTION_CHARGE_ACTIVATED",
      "SUBSCRIPTION_CHARGE_CANCELED",
      "SUBSCRIPTION_CHARGE_DECLINED",
      "SUBSCRIPTION_CHARGE_EXPIRED",
      "SUBSCRIPTION_CHARGE_FROZEN",
      "SUBSCRIPTION_CHARGE_UNFROZEN",
      "ONE_TIME_CHARGE_ACCEPTED",
      "ONE_TIME_CHARGE_ACTIVATED",
      "ONE_TIME_CHARGE_DECLINED",
      "ONE_TIME_CHARGE_EXPIRED",
    ] as const;
    expect(billingTypes.map((type) => billingCopy(type, false).subject)).toHaveLength(11);
    expect(billingTypes.map(partnerBillingState)).toEqual([
      "accepted",
      "active",
      "ending",
      "declined",
      "request_expired",
      "frozen",
      "unfrozen",
      "accepted",
      "active",
      "declined",
      "request_expired",
    ]);
    expect(localBillingCopy("active", "one_time", false).subject).toContain("Pagamento unico");
    expect(localBillingCopy("active", "monthly", false).subject).toContain("Piano attivato");
    expect(localBillingCopy("active", "annual", true).subject).toContain("cambiato");
    expect(
      ["ending", "expired", "refunded"].map(
        (type) =>
          localBillingCopy(type as "ending" | "expired" | "refunded", "monthly", false).subject,
      ),
    ).toHaveLength(3);
    expect(
      ["active", "ending", "expired", "refunded"].map((type) =>
        localBillingState(type as "active" | "ending" | "expired" | "refunded"),
      ),
    ).toEqual(["active", "ending", "entitlement_expired", "refunded"]);
  });

  test("formatta durate, importi e calendario ai bordi", () => {
    expect(formatDuration(undefined, "2026-08-01T10:00:00.000Z")).toBeNull();
    expect(formatDuration("2026-08-02T10:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBeNull();
    expect(formatDuration("2026-08-01T10:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBe("1 ora");
    expect(formatDuration("2026-08-01T09:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBe("1 ora");
    expect(formatDuration("2026-08-01T08:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBe("2 ore");
    expect(formatDuration("2026-07-31T10:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBe("1 giorno");
    expect(formatDuration("2026-07-30T10:00:00.000Z", "2026-08-01T10:00:00.000Z")).toBe("2 giorni");
    expect(formatMoney({ amount: "2.99", currencyCode: "EUR" }, "monthly")).toContain("/ mese");
    expect(formatMoney({ amount: "29.90", currencyCode: "EUR" }, "annual")).toContain("/ anno");
    expect(formatMoney({ amount: "89.90", currencyCode: "EUR" }, "one_time")).toContain(
      "una tantum",
    );
    expect(formatMoney({ amount: "1", currencyCode: "EUR" }, null)).not.toContain("/");
    expect(formatMinorMoney(299, "EUR", "monthly")).toContain("2,99");
    expect(formatDate("2026-08-01T10:00:00.000Z")).toContain("2026");
    expect(formatCalendarDate("2026-08-01")).toContain("2026");
    expect(trialDaysRemaining("invalid", "2026-08-01")).toBeNull();
    expect(trialDaysRemaining("2026-08-01T10:00:00.000Z", null)).toBeNull();
    expect(trialDaysRemaining("2026-08-01T10:00:00.000Z", "2026-08-01")).toBe(0);
    expect(trialDaysRemaining("2026-08-01T10:00:00.000Z", "2026-08-03")).toBe(2);
  });
});
