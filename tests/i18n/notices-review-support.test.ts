import { expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  messagesAreDefault,
  onboardingCanAutoComplete,
  reviewIsDue,
} from "../../app/config";
import {
  SUPPORT_EMAIL,
  supportDiagnosticText,
  supportMailto,
  texts,
  trialNotice,
} from "../../app/i18n";

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
  };

  expect(reviewIsDue(ready, now)).toBe(true);
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
    errorCode: "validation_readback_failed",
    configSchemaVersion: 2,
    configHash: "sha256-tecnico",
    validationStateRevision: 7,
    lastSyncAt: "2026-08-29T10:00:00.000Z",
  };
  const diagnostic = supportDiagnosticText(details, "it");
  const mailBody = new URL(supportMailto(details, "it", "other")).searchParams.get("body");

  expect(mailBody).toContain(diagnostic);
  expect(diagnostic).toContain("1.1.0");
  expect(diagnostic).toContain("sha256-tecnico");
  expect(diagnostic).toContain("e9763a7e-f334-4121-8ad8-78f85c47b878");
  expect(diagnostic).not.toContain("Codice Fiscale");
  expect(diagnostic).not.toContain("PEC acquirente");
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
