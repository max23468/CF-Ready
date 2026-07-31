import { expect, test } from "vitest";
import { address2Declaration, MESSAGE_KEYS, validateMessages } from "../app/config";
import {
  describeCheckout,
  formatDate,
  formatMoney,
  resolveLocale,
  summariseCheckout,
  texts,
} from "../app/i18n";

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

// §7.7: massimo tre frasi per blocco. È il caso più affollato possibile: due campi gestiti,
// avvisi preventivi e Validation disattivata.
test("l'anteprima non supera mai le tre frasi", () => {
  for (const status of ["active", "disabled", "lapsed"] as const) {
    for (const errorDisplay of ["inline", "preventive"] as const) {
      const lines = describeCheckout(
        {
          rules: { taxCode: "required_validated", pec: "required_validated" },
          errorDisplay,
          status,
        },
        "it",
      );

      expect(lines.length).toBeLessThanOrEqual(3);
      expect(new Set(lines).size).toBe(lines.length);
    }
  }
});

test("in Home lo stato sta in una riga, due se le regole non valgono", () => {
  const active = summariseCheckout(
    { rules: { taxCode: "required_validated", pec: "optional_validated" }, status: "active" },
    "it",
  );
  expect(active).toEqual([texts("it").checkout.summaryBlocking]);

  const lapsed = summariseCheckout(
    { rules: { taxCode: "optional_validated", pec: "unmanaged" }, status: "lapsed" },
    "it",
  );
  expect(lapsed).toEqual([texts("it").checkout.summaryChecking, texts("it").checkout.lapsed]);

  expect(
    summariseCheckout(
      { rules: { taxCode: "unmanaged", pec: "unmanaged" }, status: "disabled" },
      "en",
    ),
  ).toEqual([texts("en").checkout.nothing]);
});

test("importi e date seguono la lingua di chi guarda", () => {
  // `Intl` separa importo e simbolo con uno spazio unificatore, non con uno spazio normale.
  expect(formatMoney(2.99, "it")).toBe("2,99\u00a0€");
  expect(formatMoney(2.99, "en")).toBe("€2.99");
  // La data è un giorno locale dello store: formattarla non deve spostarla di un giorno.
  expect(formatDate("2026-08-10", "it")).toBe("10 agosto 2026");
  expect(formatDate("2026-08-10", "en")).toBe("August 10, 2026");
  expect(formatDate(null, "en")).toBe("");
});

test("i messaggi rifiutano vuoti e testi oltre il limite, e li trimmano", () => {
  const full = Object.fromEntries(
    (["it", "en"] as const).flatMap((locale) =>
      MESSAGE_KEYS.map((key) => [`${locale}.${key}`, `  testo ${locale} ${key}  `]),
    ),
  );

  const ok = validateMessages(full);
  expect("messages" in ok && ok.messages.it.taxCodeRequired).toBe("testo it taxCodeRequired");

  // FR-061: vuoto dopo trim non è salvabile, e il campo colpevole viene indicato.
  expect(validateMessages({ ...full, "en.pecInvalid": "   " })).toEqual({
    problem: { locale: "en", key: "pecInvalid" },
  });
  // FR-062: 200 caratteri esatti passano, 201 no.
  expect("messages" in validateMessages({ ...full, "it.pecRequired": "x".repeat(200) })).toBe(true);
  expect(validateMessages({ ...full, "it.pecRequired": "x".repeat(201) })).toEqual({
    problem: { locale: "it", key: "pecRequired" },
  });
  // Una chiave mancante è un vuoto, non un campo da lasciare com'era.
  const { "en.taxCodeInvalid": _absent, ...missing } = full;
  expect(validateMessages(missing)).toEqual({
    problem: { locale: "en", key: "taxCodeInvalid" },
  });
});
