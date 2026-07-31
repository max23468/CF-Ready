import { CURRENCY } from "./config";
import type { ErrorDisplay, Rules } from "./config";

const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// §16.1: la lingua è quella dell'amministratore Shopify corrente, non quella dello store e non
// una preferenza salvata. Il caricamento iniziale porta `locale` nell'URL; sulle richieste
// successive App Bridge imposta `Accept-Language` verso il dominio dell'app. Tutto ciò che non
// è `it*` è inglese.
export function resolveLocale(request: Request): Locale {
  const tag =
    new URL(request.url).searchParams.get("locale") ?? request.headers.get("accept-language") ?? "";
  return tag.trim().toLowerCase().startsWith("it") ? "it" : "en";
}

const it = {
  nav: {
    home: "Home",
    rules: "Regole checkout",
  },
  common: {
    saved: "Regole salvate. Valgono dal prossimo ordine.",
    save: "Salva",
    cancel: "Annulla",
  },
  errors: {
    validation_locked: "Un’altra operazione su questa Validation è in corso. Riprova fra poco.",
    validation_write_failed:
      "Non è stato possibile salvare. Shopify non ha accettato la scrittura. Riprova; se l’errore si ripete, scrivici.",
    validation_readback_failed:
      "Non è stato possibile salvare. Shopify non ha confermato la scrittura. Riapri la pagina per vedere lo stato reale.",
    validation_limit_reached:
      "Questo store ha già il numero massimo di Validation attive consentito da Shopify. Le tue regole restano salvate. Disattiva la Validation di un’altra app da Impostazioni → Checkout, poi riprova: CF Ready non tocca le risorse di altre app.",
    country_not_eligible:
      "CF Ready funziona solo con store che hanno l’indirizzo in Italia. Le regole restano salvate.",
    config_conflict:
      "Le regole sono cambiate da un’altra scheda o da un altro membro dello staff mentre modificavi. Riapri la pagina per vedere quelle correnti, poi rifai la tua modifica: non sovrascriviamo il lavoro di qualcun altro.",
    billing_read_failed:
      "Le informazioni sul piano non sono aggiornate. Il checkout non viene bloccato: riapri la pagina fra qualche minuto.",
    one_time_already_active:
      "Questo store ha già il pagamento unico: un altro addebito non aggiungerebbe nulla.",
    charge_failed: "Non è stato possibile avviare il pagamento. Riprova fra poco.",
    no_subscription: "Non risulta alcun abbonamento da cancellare.",
    cancel_failed: "La cancellazione non è riuscita. Riprova fra poco.",
    generic: "Qualcosa non ha funzionato. Riprova; se l’errore si ripete, scrivici.",
  },
  home: {
    heading: "CF Ready",
    howHeading: "Come si applicano le regole",
    nextHeading: "Prossimo passo",
    badgeActive: "Attiva",
    badgeInactive: "Disattivata",
    titleActive: "Validazione attiva nel checkout",
    titleDisabled: "Validazione disattivata",
    titleLapsed: "Validazione attiva, piano non attivo",
    unsupported: "Store non supportato",
    unsupportedBody:
      "CF Ready funziona solo con store che hanno l’indirizzo in Italia. Nessuna prova è iniziata, nessuna Validation è stata creata e nessun pagamento è stato richiesto.",
    unsupportedCheckAddress:
      "Se lo store è italiano, controlla l’indirizzo in Impostazioni → Dettagli negozio: CF Ready legge il Paese da lì.",
    noEntitlement:
      "Senza un piano attivo il checkout non blocca più nulla. Regole e messaggi restano salvati e tornano validi con il pagamento.",
    syncNeeded:
      "Lo stato mostrato qui potrebbe non coincidere con Shopify. Il checkout non viene bloccato. Riapri la pagina fra qualche minuto.",
    editRules: "Modifica regole",
    activate: "Attiva nel checkout",
    deactivate: "Disattiva nel checkout",
    deactivateConfirm:
      "Da questo momento il checkout smette di controllare i campi. Regole e messaggi restano salvati e puoi riattivarli quando vuoi.",
    nextConfigure: "Scegli quali campi controllare nel checkout.",
    nextActivate: "Le regole sono pronte. Attivale per farle valere nel checkout.",
    nextTestOrder: "Fai un ordine di prova per vedere le regole all’opera.",
    nextChoosePlan: "Scegli una modalità per riattivare le regole nel checkout.",
    nextAddress2:
      "Smetti di usare il campo “Interno” per il Codice Fiscale: oggi il cliente vede due campi per lo stesso dato. Le istruzioni sono in Regole checkout.",
  },
  plan: {
    heading: "Piano",
    trial: (date: string) => `Prova attiva fino al ${date}.`,
    oneTime: "Pagamento unico attivo, senza rinnovi.",
    subscription: (date: string) => `Abbonamento attivo fino al ${date}.`,
    trialOver: "Prova terminata: scegli una modalità per riattivare le regole.",
    none: "Nessun piano attivo.",
    pricesLaunch: (monthly: string, annual: string) =>
      `Prezzo di lancio: ${monthly} ogni 30 giorni oppure ${annual} all’anno.`,
    pricesStandard: (monthly: string, annual: string) =>
      `Prezzo: ${monthly} ogni 30 giorni oppure ${annual} all’anno.`,
    monthlyStart: "Attiva il mensile",
    monthlySwitch: "Passa al mensile",
    annualStart: "Attiva l’annuale",
    annualSwitch: "Passa all’annuale",
    oneTimeBuy: (price: string) => `Un solo pagamento: ${price}`,
    oneTimeSwitch: "Passa a un solo pagamento",
    cancelRenewal: "Cancella il rinnovo",
    creditEstimate: (amount: string) =>
      `Credito stimato sul periodo non usufruito: ${amount}. È una stima: nella fattura Shopify l’acquisto può comparire a prezzo pieno e il credito separatamente, e l’importo effettivo è quello calcolato da Shopify.`,
  },
  rules: {
    heading: "Regole checkout",
    taxCodeLabel: "Codice Fiscale",
    pecLabel: "PEC",
    taxCode: {
      unmanaged: "Non gestito",
      unmanagedHelp: "CF Ready non controlla il campo. Il checkout resta come è oggi.",
      optional_validated: "Facoltativo e validato",
      optional_validatedHelp:
        "Il cliente può lasciarlo vuoto. Se lo compila, deve essere formalmente valido.",
      required_validated: "Obbligatorio e validato",
      required_validatedHelp:
        "Il cliente non completa l’ordine senza un Codice Fiscale formalmente valido.",
    },
    pec: {
      unmanaged: "Non gestita",
      unmanagedHelp: "CF Ready non controlla il campo. Il checkout resta come è oggi.",
      optional_validated: "Facoltativa e validata",
      optional_validatedHelp:
        "Il cliente può lasciarla vuota. Se la compila, deve avere un formato email valido.",
      required_validated: "Obbligatoria e validata",
      required_validatedHelp:
        "Il cliente non completa l’ordine senza un indirizzo con formato email valido.",
    },
    exceptionsHeading: "Eccezioni automatiche",
    exceptions: [
      "Le regole valgono solo quando consegna e fatturazione sono in Italia.",
      "Un cliente con fatturazione estera completa l’ordine senza controlli.",
      "Se il campo non è presente nel checkout, l’ordine passa: un errore dell’app non blocca una vendita.",
    ],
    preventiveLabel: "Mostra avvisi preventivi nel checkout",
    preventiveHelp:
      "Gli errori possono comparire già al caricamento del checkout, prima che il cliente abbia compilato i campi. Consigliato se usi la conferma ordine di Shopify, perché evita che il cliente arrivi alla revisione con un blocco senza messaggio.",
    previewHeading: "Come funzionerà il checkout",
    address2Heading: "Il campo “Interno” non va usato per il Codice Fiscale",
    address2Body:
      "Il Codice Fiscale va raccolto nel campo fiscale nativo del checkout italiano. Se lo raccogli anche in “Interno”, il cliente vede due campi per lo stesso dato. CF Ready non legge e non modifica quell’impostazione: qui contiamo sulla tua dichiarazione.",
    address2Checkbox: "Uso il campo “Interno” per il Codice Fiscale",
    address2Instructions:
      "Servono due passaggi. In Impostazioni → Checkout, sezione “Opzioni del modulo”, porta la seconda riga dell’indirizzo su “Facoltativo” o “Non includere”; poi, se ne hai cambiato l’etichetta, rimettila com’era da “Gestisci la lingua del checkout”, o da Impostazioni → Lingue, scheda “Checkout e sistema”, se la lingua è tradotta.",
  },
  checkout: {
    nothing: "Nessuna regola attiva: il checkout si comporta come oggi.",
    taxCodeRequired:
      "Un cliente con consegna e fatturazione in Italia non completa l’ordine senza un Codice Fiscale formalmente valido.",
    taxCodeOptional:
      "Un cliente con consegna e fatturazione in Italia può lasciare vuoto il Codice Fiscale, ma se lo compila deve essere formalmente valido.",
    pecRequired: "Lo stesso cliente deve inserire una PEC con formato email valido.",
    pecOptional: "La PEC può restare vuota, ma se compilata deve avere un formato email valido.",
    summaryBlocking: "Un cliente italiano non completa l’ordine senza i dati richiesti.",
    summaryChecking:
      "I dati che i clienti italiani inseriscono vengono controllati, ma nessuno è obbligatorio.",
    preventive:
      "Gli avvisi compaiono già al caricamento del checkout, non solo quando il cliente prova a procedere.",
    disabled: "La Validation è disattivata: queste regole non valgono ancora per i clienti.",
    lapsed:
      "La Validation è attiva ma il piano non lo è: finché resta così il checkout non blocca nulla.",
  },
};

const en: typeof it = {
  nav: {
    home: "Home",
    rules: "Checkout rules",
  },
  common: {
    saved: "Rules saved. They apply from the next order.",
    save: "Save",
    cancel: "Cancel",
  },
  errors: {
    validation_locked: "Another operation on this validation is running. Try again shortly.",
    validation_write_failed:
      "Couldn’t save. Shopify didn’t accept the write. Try again; if it keeps failing, contact us.",
    validation_readback_failed:
      "Couldn’t save. Shopify didn’t confirm the write. Reload the page to see the real state.",
    validation_limit_reached:
      "This store already has the maximum number of active validations Shopify allows. Your rules are still saved. Turn off another app’s validation in Settings → Checkout, then try again: CF Ready never touches other apps’ resources.",
    country_not_eligible:
      "CF Ready only works with stores based in Italy. Your rules are still saved.",
    config_conflict:
      "The rules changed in another tab or from another staff member while you were editing. Reload the page to see the current ones, then redo your change: we don’t overwrite someone else’s work.",
    billing_read_failed:
      "Plan information isn’t up to date. Checkout isn’t blocked: reload the page in a few minutes.",
    one_time_already_active:
      "This store already has the one-time payment: another charge wouldn’t add anything.",
    charge_failed: "Couldn’t start the payment. Try again shortly.",
    no_subscription: "There’s no subscription to cancel.",
    cancel_failed: "The cancellation didn’t go through. Try again shortly.",
    generic: "Something went wrong. Try again; if it keeps failing, contact us.",
  },
  home: {
    heading: "CF Ready",
    howHeading: "How the rules apply",
    nextHeading: "Next step",
    badgeActive: "Active",
    badgeInactive: "Turned off",
    titleActive: "Validation active in checkout",
    titleDisabled: "Validation turned off",
    titleLapsed: "Validation on, plan not active",
    unsupported: "Store not supported",
    unsupportedBody:
      "CF Ready only works with stores based in Italy. No trial has started, no validation has been created and no payment has been requested.",
    unsupportedCheckAddress:
      "If your store is Italian, check the address in Settings → Store details: that’s where CF Ready reads the country from.",
    noEntitlement:
      "Without an active plan, checkout no longer blocks anything. Rules and messages stay saved and apply again once you pay.",
    syncNeeded:
      "What you see here may not match Shopify. Checkout isn’t blocked. Reload the page in a few minutes.",
    editRules: "Edit rules",
    activate: "Turn on in checkout",
    deactivate: "Turn off in checkout",
    deactivateConfirm:
      "From now on checkout stops checking the fields. Rules and messages stay saved and you can turn them back on whenever you want.",
    nextConfigure: "Choose which fields to check in checkout.",
    nextActivate: "Your rules are ready. Turn them on to apply them in checkout.",
    nextTestOrder: "Place a test order to see the rules at work.",
    nextChoosePlan: "Choose a plan to apply your rules in checkout again.",
    nextAddress2:
      "Stop using the “Apartment, suite, etc.” field for the tax code: right now customers see two fields for the same value. The steps are on Checkout rules.",
  },
  plan: {
    heading: "Plan",
    trial: (date: string) => `Trial active until ${date}.`,
    oneTime: "One payment active, no renewals.",
    subscription: (date: string) => `Subscription active until ${date}.`,
    trialOver: "Trial over: choose a plan to apply your rules again.",
    none: "No active plan.",
    pricesLaunch: (monthly: string, annual: string) =>
      `Launch price: ${monthly} every 30 days, or ${annual} a year.`,
    pricesStandard: (monthly: string, annual: string) =>
      `Price: ${monthly} every 30 days, or ${annual} a year.`,
    monthlyStart: "Start monthly",
    monthlySwitch: "Switch to monthly",
    annualStart: "Start annual",
    annualSwitch: "Switch to annual",
    oneTimeBuy: (price: string) => `One payment: ${price}`,
    oneTimeSwitch: "Switch to one payment",
    cancelRenewal: "Cancel renewal",
    creditEstimate: (amount: string) =>
      `Estimated credit for the unused period: ${amount}. It’s an estimate: on the Shopify invoice the purchase can appear at full price with the credit listed separately, and the actual amount is the one Shopify calculates.`,
  },
  rules: {
    heading: "Checkout rules",
    taxCodeLabel: "Italian tax code (Codice Fiscale)",
    pecLabel: "Certified email address (PEC)",
    taxCode: {
      unmanaged: "Not managed",
      unmanagedHelp: "CF Ready doesn’t check the field. Checkout stays as it is today.",
      optional_validated: "Optional and validated",
      optional_validatedHelp:
        "Customers can leave it empty. If they fill it in, it must be formally valid.",
      required_validated: "Required and validated",
      required_validatedHelp:
        "Customers can’t complete the order without a formally valid tax code.",
    },
    pec: {
      unmanaged: "Not managed",
      unmanagedHelp: "CF Ready doesn’t check the field. Checkout stays as it is today.",
      optional_validated: "Optional and validated",
      optional_validatedHelp:
        "Customers can leave it empty. If they fill it in, it must be a valid email format.",
      required_validated: "Required and validated",
      required_validatedHelp:
        "Customers can’t complete the order without an address in a valid email format.",
    },
    exceptionsHeading: "Automatic exceptions",
    exceptions: [
      "Rules only apply when both delivery and billing are in Italy.",
      "A customer billing outside Italy completes the order with no checks.",
      "If the field isn’t in the checkout, the order goes through: an app error never blocks a sale.",
    ],
    preventiveLabel: "Show warnings early in checkout",
    preventiveHelp:
      "Errors can appear as soon as checkout loads, before the customer has filled the fields in. Recommended if you use Shopify’s order confirmation step, because it stops customers reaching the review page blocked without a message.",
    previewHeading: "What customers will see",
    address2Heading: "Don’t use the “Apartment, suite, etc.” field for the tax code",
    address2Body:
      "The tax code belongs in the native Italian checkout field. If you also collect it in “Apartment, suite, etc.”, customers see two fields for the same value. CF Ready can’t read or change that setting: this relies on what you tell us.",
    address2Checkbox: "I use the “Apartment, suite, etc.” field for the tax code",
    address2Instructions:
      "Two steps. In Settings → Checkout, under “Form options”, set the second address line to “Optional” or “Don’t include”; then, if you changed its label, restore it from “Manage checkout language”, or from Settings → Languages, “Checkout and system” tab, for a translated language.",
  },
  checkout: {
    nothing: "No rules active: checkout behaves exactly as it does today.",
    taxCodeRequired:
      "A customer with delivery and billing in Italy can’t complete the order without a formally valid tax code.",
    taxCodeOptional:
      "A customer with delivery and billing in Italy can leave the tax code empty, but if they fill it in it must be formally valid.",
    pecRequired: "The same customer must enter a PEC address in a valid email format.",
    pecOptional: "PEC can stay empty, but if filled in it must be a valid email format.",
    summaryBlocking: "An Italian customer can’t complete the order without the required fields.",
    summaryChecking: "What Italian customers enter is checked, but nothing is required.",
    preventive:
      "Warnings appear as soon as checkout loads, not only when the customer tries to continue.",
    disabled: "The validation is turned off: these rules don’t apply to customers yet.",
    lapsed:
      "The validation is on but your plan isn’t: while that’s the case, checkout blocks nothing.",
  },
};

const dictionaries = { it, en };

// Importi e date seguono la locale di chi guarda: “2,99 €” dentro un'interfaccia inglese è
// sbagliato quanto una frase non tradotta. `Intl` è nella piattaforma, nessuna dipendenza.
// I formatter restano in cache come in `billing.server.ts`: costruirli è caro e le locale sono due.
const moneyFormatters = new Map<Locale, Intl.NumberFormat>();
const dateFormatters = new Map<Locale, Intl.DateTimeFormat>();

export function formatMoney(amount: number, locale: Locale) {
  let formatter = moneyFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY });
    moneyFormatters.set(locale, formatter);
  }
  return formatter.format(amount);
}

// La data arriva come giorno locale dello store, senza orario: si formatta in UTC per non
// spostarla di un giorno nel fuso di chi legge.
export function formatDate(iso: string | null, locale: Locale) {
  if (!iso) return "";
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(`${iso}T00:00:00Z`));
}

export function texts(locale: Locale) {
  return dictionaries[locale];
}

// L'anteprima di §15.4 e lo stato della Home dicono la stessa cosa e devono dirla con le stesse
// parole: una frase per conseguenza, mai un elenco di stati. Nessuna simulazione grafica del
// checkout (D-068), solo testo.
export type CheckoutStatus = "active" | "disabled" | "lapsed";

export function describeCheckout(
  {
    rules,
    errorDisplay,
    status,
  }: { rules: Rules; errorDisplay: ErrorDisplay; status: CheckoutStatus },
  locale: Locale,
) {
  const t = texts(locale).checkout;
  const lines: string[] = [];

  if (rules.taxCode === "required_validated") lines.push(t.taxCodeRequired);
  else if (rules.taxCode === "optional_validated") lines.push(t.taxCodeOptional);

  if (rules.pec === "required_validated") lines.push(t.pecRequired);
  else if (rules.pec === "optional_validated") lines.push(t.pecOptional);

  if (!lines.length) return [t.nothing];

  // §7.7: massimo tre frasi per blocco. L'eccezione estera non si ripete qui, perché il
  // riquadro `Eccezioni automatiche` la dichiara nella stessa schermata; fra le due avvertenze
  // vince quella che decide se le regole valgono davvero.
  if (status !== "active") lines.push(status === "lapsed" ? t.lapsed : t.disabled);
  else if (errorDisplay === "preventive") lines.push(t.preventive);
  return lines;
}

// In Home lo stato dice l'esito in una riga: le regole per campo stanno nel blocco
// `Configurazione corrente` e non vanno ripetute in prosa due sezioni più sopra.
export function summariseCheckout(
  { rules, status }: { rules: Rules; status: CheckoutStatus },
  locale: Locale,
) {
  const t = texts(locale).checkout;
  const modes = [rules.taxCode, rules.pec];
  const lines: string[] = [];

  if (modes.includes("required_validated")) lines.push(t.summaryBlocking);
  else if (modes.includes("optional_validated")) lines.push(t.summaryChecking);
  else return [t.nothing];

  if (status !== "active") lines.push(status === "lapsed" ? t.lapsed : t.disabled);
  return lines;
}
