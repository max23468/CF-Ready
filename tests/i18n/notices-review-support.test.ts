import { expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  messagesAreDefault,
  onboardingCanAutoComplete,
  reviewIsDue,
} from "../../app/config";
import {
  describeCheckout,
  quoteLabel,
  summariseCheckout,
  SUPPORT_EMAIL,
  supportDiagnosticText,
  supportMailto,
  texts,
  trialNotice,
} from "../../app/i18n";
import italianSource from "../../app/i18n/it.ts?raw";

test("l'azione di assistenza è esplicita in italiano e inglese", () => {
  expect(texts("it").support.requestSupport).toBe("Richiedi assistenza");
  expect(texts("en").support.requestSupport).toBe("Get support");
});

test("gli avvisi di prova scattano a sette, tre e all'ultimo giorno", () => {
  const at = (remaining: number) => trialNotice({ remaining, endsAt: "2026-08-10" }, "it");

  // Oltre la settimana non si dice nulla: sarebbe pressione senza motivo.
  expect(at(8)).toBeNull();
  expect(at(7)?.tone).toBe("info");
  expect(at(4)?.tone).toBe("info");
  // Da tre giorni il tono sale, ma il testo resta una constatazione con la data.
  expect(at(3)?.tone).toBe("warning");
  expect(at(2)?.tone).toBe("warning");
  expect(at(1)?.text).toBe(texts("it").plan.trialLastDay("10 agosto 2026"));
  // Scaduta: se ne occupa il banner di piano assente, non questo.
  expect(at(0)).toBeNull();
  expect(trialNotice({ remaining: 3, endsAt: null }, "it")).toBeNull();
  // §14.3: nessun conto alla rovescia, la data è esplicita.
  expect(at(3)?.text).toContain("10 agosto 2026");
  expect(at(3)?.text).not.toMatch(/\b3\b/);
});

test("la recensione si chiede solo alle condizioni di §15.10", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-08-10T12:00:00.000Z");
  const ready = {
    onboarding: "completed",
    validationEnabled: true,
    errorCode: null,
    enabledSince: new Date(now - 8 * day).toISOString(),
    partnerDevelopment: false,
    reviewCompleted: false,
  };

  expect(reviewIsDue(ready, now)).toBe(true);
  expect(reviewIsDue({ ...ready, reviewCompleted: true }, now)).toBe(false);
  // Sette giorni esatti bastano, sei no.
  expect(reviewIsDue({ ...ready, enabledSince: new Date(now - 7 * day).toISOString() }, now)).toBe(
    true,
  );
  expect(reviewIsDue({ ...ready, enabledSince: new Date(now - 6 * day).toISOString() }, now)).toBe(
    false,
  );
  // Onboarding non concluso, validazione ferma, errore aperto: nessuna richiesta.
  expect(reviewIsDue({ ...ready, onboarding: "in_progress" }, now)).toBe(false);
  expect(reviewIsDue({ ...ready, validationEnabled: false }, now)).toBe(false);
  expect(reviewIsDue({ ...ready, errorCode: "validation_readback_failed" }, now)).toBe(false);
  // Nei partner development store Shopify mostra una modale che non può inviare la recensione
  // e la ripropone a ogni Home: il tipo autorevole dello store la sopprime alla radice.
  expect(reviewIsDue({ ...ready, partnerDevelopment: true }, now)).toBe(false);
  // Mai attivata: non c'è un momento da cui contare.
  expect(reviewIsDue({ ...ready, enabledSince: null }, now)).toBe(false);
});

test("l'onboarding si completa appena lo setup operativo è effettivo", () => {
  const ready = {
    onboarding: "in_progress",
    configured: true,
    entitled: true,
    validationEnabled: true,
    errorCode: null,
  };

  expect(onboardingCanAutoComplete(ready)).toBe(true);
  expect(onboardingCanAutoComplete({ ...ready, configured: false })).toBe(false);
  expect(onboardingCanAutoComplete({ ...ready, entitled: false })).toBe(false);
  expect(onboardingCanAutoComplete({ ...ready, validationEnabled: false })).toBe(false);
  expect(onboardingCanAutoComplete({ ...ready, errorCode: "validation_readback_failed" })).toBe(
    false,
  );
  expect(onboardingCanAutoComplete({ ...ready, onboarding: "completed" })).toBe(false);
});

test("il messaggio di assistenza porta solo i dati dell'allowlist e nulla del cliente", () => {
  const link = supportMailto(
    {
      shopDomain: "cf-ready-dev.myshopify.com",
      version: "0.5.0",
      countryCode: "IT",
      entitlement: true,
      validationEnabled: false,
      errorCode: "validation_readback_failed",
    },
    "it",
    "checkout",
  );

  expect(link.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);

  const body = new URL(link).searchParams.get("body") ?? "";
  expect(new URL(link).searchParams.get("subject")).toBe(
    `${texts("it").support.subject}: ${texts("it").support.categories.checkout}`,
  );
  // §22: ogni campo dell'allowlist compare con il proprio valore.
  expect(body).toContain("cf-ready-dev.myshopify.com");
  expect(body).toContain("0.5.0");
  expect(body).toContain("IT");
  expect(body).toContain("validation_readback_failed");
  // Lo spazio resta uno spazio: URLSearchParams lo scriverebbe come "+" dentro il corpo.
  expect(link).not.toContain("+");

  // I campi facoltativi omessi non lasciano righe vuote o etichette senza valore.
  const minimal = new URL(
    supportMailto({ shopDomain: "a.myshopify.com", version: "0.5.0" }, "en", "other"),
  );
  const minimalBody = minimal.searchParams.get("body") ?? "";
  expect(minimalBody).not.toContain(texts("en").support.fieldErrorCode);
  expect(minimalBody).not.toContain(texts("en").support.fieldCountry);
  expect(minimalBody).toContain("a.myshopify.com");
  expect(minimalBody).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
});

test("la diagnostica copiabile usa gli stessi campi tecnici del messaggio", () => {
  const details = {
    shopDomain: "cf-ready-dev.myshopify.com",
    version: "1.1.0",
    diagnosticId: "e9763a7e-f334-4121-8ad8-78f85c47b878",
    entitlementKind: "annual" as const,
    validationEnabled: true,
    errorCode: "validation_readback_failed" as const,
    configSchemaVersion: 2,
    configHash: "sha256-tecnico",
    validationStateRevision: 7,
    lastSyncAt: "2026-08-29T10:00:00.000Z",
    checkoutLabelsEnabled: true,
    checkoutLabelsMode: "partial" as const,
    checkoutLabelsStatus: "action_required" as const,
    address2Classification: "fiscal_conflict" as const,
    address2Decision: "pending" as const,
    address2MarketOverride: true,
    checkoutLabelLocales: "it-IT,en",
    checkoutLabelMarketCount: 2,
    checkoutLabelsLastSyncAt: "2026-09-08T12:00:00.000Z",
    checkoutLabelsErrorCode: "checkout_labels_partial_sync",
  };
  const diagnostic = supportDiagnosticText(details, "it");
  const mailBody = new URL(supportMailto(details, "it", "other")).searchParams.get("body");

  expect(mailBody).toContain(diagnostic);
  expect(diagnostic).toContain("1.1.0");
  expect(diagnostic).toContain("sha256-tecnico");
  expect(diagnostic).toContain("e9763a7e-f334-4121-8ad8-78f85c47b878");
  expect(diagnostic).toContain("checkout_labels_mode=partial");
  expect(diagnostic).toContain("address2_classification=fiscal_conflict");
  expect(diagnostic).toContain("market_count=2");
  expect(diagnostic).not.toContain("Codice Fiscale");
  expect(diagnostic).not.toContain("PEC acquirente");
});

test("i riepiloghi coprono PEC facoltativa e stati disattivato o scaduto", () => {
  expect(
    describeCheckout(
      {
        rules: { taxCode: "unmanaged", pec: "optional_validated" },
        status: "active",
      },
      "it",
    ),
  ).toContain(texts("it").checkout.pecOptional);
  expect(
    summariseCheckout(
      {
        rules: { taxCode: "required_validated", pec: "unmanaged" },
        status: "lapsed",
      },
      "it",
    ),
  ).toContain(texts("it").checkout.lapsed);
  expect(
    supportDiagnosticText(
      { shopDomain: "demo.myshopify.com", version: "1.1.4", entitlement: false },
      "it",
    ),
  ).toContain(`${texts("it").support.fieldEntitlement}: ${texts("it").support.no}`);
});

test("la Home distingue i messaggi predefiniti da quelli riscritti", () => {
  expect(messagesAreDefault(DEFAULT_CONFIG.messages)).toBe(true);

  const edited = {
    ...DEFAULT_CONFIG.messages,
    en: { ...DEFAULT_CONFIG.messages.en, pecInvalid: "Check the address and try again." },
  };
  // Basta un testo riscritto in una lingua sola: la riga in Home deve dirlo.
  expect(messagesAreDefault(edited)).toBe(false);
});

test("gli errori rari nominano i comandi reali e spiegano cosa fare", () => {
  for (const locale of ["it", "en"] as const) {
    const t = texts(locale);
    // Punto 5: il comando si chiama come il bottone di Regole.
    for (const code of [
      "checkout_labels_conflict",
      "checkout_labels_stale_digest",
      "checkout_labels_readback_failed",
      "address2_restore_conflict",
    ] as const) {
      expect(t.errors[code]).toContain(quoteLabel(t.rules.labels.refresh, locale));
    }
    // Punto 12: si riprova dalla Guida, con il suo comando.
    expect(t.guide.diagnosis.failed).toContain(quoteLabel(t.guide.diagnosis.refresh, locale));
    // Punto 13: niente "risorse" senza un'azione.
    expect(t.errors.checkout_labels_resource_ambiguous).not.toMatch(/risorse|resource/);
  }
});

test("la procedura manuale cita tra virgolette ogni voce dell'interfaccia Shopify", () => {
  for (const locale of ["it", "en"] as const) {
    const labels = texts(locale).rules.labels;
    // Punto 14: come gli altri comandi, anche le voci di Translate & Adapt sono citate.
    for (const [primary, market] of [
      [true, null],
      [false, null],
      [false, "Europa"],
    ] as const) {
      const steps = labels.manualSteps("italiano", market, primary, ["Europa"]).join("\n");
      expect(steps).not.toMatch(/(?<![“«])Checkout and system/);
      expect(steps).not.toMatch(/(?<![“«]|→ )Tax (credential|email) it/);
      expect(steps).not.toMatch(/(?<![“«])B2B locations/);
    }
    // Punto 10: due conteggi sono due frasi, non frammenti uniti da un puntino.
    expect(labels.operationalSummary(1, 2)).not.toContain("·");
  }
});

test("i riepiloghi del campo Interno lo citano tra virgolette", () => {
  for (const summary of Object.values(texts("it").rules.labels.addressSummary)) {
    expect(summary).not.toMatch(/campo Interno/);
  }
});

test("in italiano ogni citazione usa le virgolette basse", () => {
  // P2-T6: «» per etichette Shopify, comandi e pagine; “” resta all'inglese.
  expect(italianSource).not.toMatch(/[“”]/);
  expect(texts("it").errors.checkout_labels_conflict).toContain(
    quoteLabel(texts("it").rules.labels.refresh, "it"),
  );
});

test("in inglese il Codice Fiscale ha un solo nome", () => {
  // EN-3: stesso nome in Home, Regole e Messaggi; nei nomi composti la forma breve.
  const en = texts("en");
  expect(en.messages.fieldNames.taxCode).toBe(en.rules.taxCodeLabel);
  expect(en.messages.taxCodeRequired).toMatch(/^Italian tax code /);
  expect(en.messages.taxCodeInvalid).toMatch(/^Italian tax code /);
});
