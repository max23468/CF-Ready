import { expect, test } from "vitest";
import {
  address2Declaration,
  DEFAULT_CONFIG,
  MESSAGE_KEYS,
  messagesAreDefault,
  messageAppears,
  parseOnboardingStep,
  pendingFetcherIntent,
  pendingFetcherSource,
  reviewIsDue,
  showSavedBanner,
  validateMessages,
} from "../app/config";
import {
  describeCheckout,
  formatDate,
  formatMoney,
  homeCheckoutSummary,
  resolveLocale,
  summariseCheckout,
  texts,
  trialNotice,
  validationStatus,
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

test("anche l'accesso pubblico segue la locale comune", () => {
  expect(texts(resolveLocale(new Request(`${url}?locale=it-IT`))).auth.heading).toBe("Accedi");
  expect(texts(resolveLocale(new Request(`${url}?locale=en-US`))).auth.heading).toBe("Log in");
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

test("la revisione onboarding descrive lo stato reale della Validation", () => {
  expect(validationStatus(true, true)).toBe("active");
  expect(validationStatus(true, false)).toBe("lapsed");
  expect(validationStatus(false, true)).toBe("disabled");
  expect(validationStatus(false, false)).toBe("disabled");
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

test("la Home descrive lo stato reale prima delle regole", () => {
  const rules = { taxCode: "required_validated", pec: "unmanaged" } as const;

  expect(homeCheckoutSummary({ rules, status: "active" }, "it")).toContain("non completa l’ordine");
  expect(homeCheckoutSummary({ rules, status: "disabled" }, "it")).toBe(
    texts("it").checkout.disabled,
  );
  expect(homeCheckoutSummary({ rules, status: "lapsed" }, "en")).toBe(texts("en").checkout.lapsed);
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
  // Mai attivata: non c'è un momento da cui contare.
  expect(reviewIsDue({ ...ready, enabledSince: null }, now)).toBe(false);
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
