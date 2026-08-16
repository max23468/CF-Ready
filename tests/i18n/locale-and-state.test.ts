import { expect, test } from "vitest";
import {
  parseOnboardingStep,
  pendingFetcherIntent,
  pendingFetcherSource,
  showSavedBanner,
} from "../../app/config";
import { resolveLocale, texts } from "../../app/i18n";

const url = "https://cf-ready-dev.tmsf.workers.dev/app";

test("la lingua viene dallo staff Shopify, non dallo store né da una preferenza salvata", () => {
  expect(resolveLocale(new Request(`${url}?locale=it-IT`))).toBe("it");
  expect(resolveLocale(new Request(`${url}?locale=en-CA`))).toBe("en");
  // §16.1: tutto ciò che non è `it*` è inglese, non un terzo comportamento.
  expect(resolveLocale(new Request(`${url}?locale=de-DE`))).toBe("en");
  // Sulle richieste successive la locale arriva dall'header impostato da App Bridge.
  expect(resolveLocale(new Request(url, { headers: { "accept-language": "it" } }))).toBe("it");
  // Il parametro ha la precedenza: è il segnale del caricamento dentro l'Admin.
  expect(
    resolveLocale(new Request(`${url}?locale=en-US`, { headers: { "accept-language": "it" } })),
  ).toBe("en");
  expect(resolveLocale(new Request(url))).toBe("en");
  expect(texts(resolveLocale(new Request(`${url}?locale=it-IT`))).common.save).toBe("Salva");
});

test("feedback di salvataggio e caricamento seguono l'azione corrente", () => {
  expect(showSavedBanner({ ok: true }, false)).toBe(true);
  expect(showSavedBanner({ ok: true }, true)).toBe(false);
  expect(showSavedBanner({ ok: true }, false, true)).toBe(false);

  const form = new FormData();
  form.set("intent", "annual");
  form.set("source", "status");
  expect(pendingFetcherIntent(form)).toBe("annual");
  expect(pendingFetcherSource(form)).toBe("status");
  expect(pendingFetcherIntent(undefined)).toBeNull();
  expect(pendingFetcherSource(undefined)).toBeNull();
});

test("il passo onboarding accetta soltanto interi nell'intervallo", () => {
  expect(parseOnboardingStep("1")).toBe(1);
  expect(parseOnboardingStep("4")).toBe(4);
  expect(parseOnboardingStep("x")).toBeNull();
  expect(parseOnboardingStep("2.5")).toBeNull();
  expect(parseOnboardingStep("5")).toBeNull();
});

test("italiano e inglese descrivono le stesse cose", () => {
  // Gli array vanno percorsi come tutto il resto: un elenco con tre voci in italiano e due in
  // inglese sarebbe copy misto, che §16.4 vieta.
  const keys = (value: object): string[] =>
    Object.entries(value)
      .flatMap(([key, entry]) =>
        entry && typeof entry === "object"
          ? keys(entry).map((nested) => `${key}.${nested}`)
          : [key],
      )
      .sort();

  expect(keys(texts("en"))).toEqual(keys(texts("it")));
});
