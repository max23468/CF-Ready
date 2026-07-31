import { expect, test } from "vitest";
import { address2Declaration } from "../app/config";
import { describeCheckout, resolveLocale, texts } from "../app/i18n";

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

test("l'anteprima dice la conseguenza per il cliente, non lo stato dei campi", () => {
  const lines = describeCheckout(
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      status: "active",
    },
    "it",
  );

  expect(lines[0]).toContain("non completa l’ordine senza un Codice Fiscale");
  // L'eccezione estera è sempre dichiarata accanto alla regola che la rende rilevante.
  expect(lines).toContain(texts("it").checkout.foreign);
  expect(lines).not.toContain(texts("it").checkout.disabled);
});

test("senza regole attive l'anteprima non promette nulla", () => {
  expect(
    describeCheckout(
      {
        rules: { taxCode: "unmanaged", pec: "unmanaged" },
        errorDisplay: "inline",
        status: "active",
      },
      "it",
    ),
  ).toEqual([texts("it").checkout.nothing]);
});

test("una Validation disattivata lo dichiara nell'anteprima", () => {
  expect(
    describeCheckout(
      {
        rules: { taxCode: "unmanaged", pec: "required_validated" },
        errorDisplay: "preventive",
        status: "disabled",
      },
      "en",
    ),
  ).toContain(texts("en").checkout.disabled);
});

test("una Validation attiva senza piano non viene descritta come disattivata", () => {
  const lines = describeCheckout(
    {
      rules: { taxCode: "required_validated", pec: "unmanaged" },
      errorDisplay: "inline",
      status: "lapsed",
    },
    "it",
  );

  expect(lines).toContain(texts("it").checkout.lapsed);
  expect(lines).not.toContain(texts("it").checkout.disabled);
});

test("la dichiarazione sul campo “Interno” cambia solo quando il blocco è stato mostrato", () => {
  const submitted = (entries: [string, string][]) => {
    const form = new FormData();
    for (const [name, value] of entries) form.append(name, value);
    return address2Declaration(form);
  };

  expect(
    submitted([
      ["address2Shown", "1"],
      ["address2", "declared"],
    ]),
  ).toBe(true);
  expect(submitted([["address2Shown", "1"]])).toBe(false);
  // Codice Fiscale non gestito: il blocco non è sullo schermo e la dichiarazione resta com'è.
  expect(submitted([])).toBeNull();
});
