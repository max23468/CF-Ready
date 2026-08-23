import { expect, test } from "vitest";
import { MESSAGE_KEYS, messageAppears, validateMessages } from "../../app/config";
import { formatDate, formatMoney } from "../../app/i18n";

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

test("un messaggio compare solo se le regole lo rendono raggiungibile", () => {
  const shown = (rules: Parameters<typeof messageAppears>[0]) =>
    MESSAGE_KEYS.filter((key) => messageAppears(rules, key));

  // Campo non gestito: nessuno dei suoi due messaggi raggiunge il cliente.
  expect(shown({ taxCode: "unmanaged", pec: "unmanaged" })).toEqual([]);
  // Facoltativo: il messaggio di obbligo non esiste, quello di formato sì.
  expect(shown({ taxCode: "optional_validated", pec: "unmanaged" })).toEqual(["taxCodeInvalid"]);
  expect(shown({ taxCode: "required_validated", pec: "optional_validated" })).toEqual([
    "taxCodeRequired",
    "taxCodeInvalid",
    "pecInvalid",
  ]);
  expect(shown({ taxCode: "required_validated", pec: "required_validated" })).toEqual([
    ...MESSAGE_KEYS,
  ]);
});
