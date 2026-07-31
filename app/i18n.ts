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
    messages: "Messaggi al cliente",
    plan: "Piano e fatturazione",
    guide: "Guida e FAQ",
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
    unsupportedGuide: "La Guida spiega cosa fa l’app e quali sono i suoi limiti.",
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
    helpHeading: "Guida e assistenza",
    helpBody: "Cosa controlla CF Ready, cosa non controlla e cosa succede nei casi particolari.",
    nextAddress2:
      "Smetti di usare il campo “Interno” per il Codice Fiscale: oggi il cliente vede due campi per lo stesso dato. Le istruzioni sono in Regole checkout.",
  },
  messages: {
    heading: "Messaggi al cliente",
    intro:
      "Sono i testi che il cliente legge nel checkout quando un campo manca o non è formalmente valido. Chi ha il checkout in italiano vede quelli italiani, tutti gli altri vedono quelli inglesi.",
    italian: "Italiano",
    english: "English",
    taxCodeRequired: "Codice Fiscale obbligatorio",
    taxCodeInvalid: "Codice Fiscale non valido",
    pecRequired: "PEC obbligatoria",
    pecInvalid: "PEC non valida",
    counter: (used: number) => `${used}/200 caratteri`,
    tooLong: "Massimo 200 caratteri.",
    empty: "Il messaggio non può restare vuoto.",
    reset: "Ripristina testi predefiniti",
    resetConfirm: (language: string) =>
      `I quattro messaggi in ${language} tornano ai testi predefiniti. Gli altri non cambiano, e la modifica vale solo dopo il salvataggio.`,
    appearHeading: "Quali messaggi compaiono",
    appearIntro:
      "Dipende dalle regole attive: i messaggi di un campo non gestito non li legge nessuno.",
    appears: "Compare",
    appearsNot: "Non compare",
  },
  guide: {
    heading: "Guida e FAQ",
    intro:
      "Come si comporta CF Ready nel checkout, cosa controlla e cosa no. Se non trovi la risposta, scrivici.",
    asideBody:
      "CF Ready controlla solo la forma dei dati, non li verifica presso nessun registro e non emette fatture. Dove c’è un limite, in questa pagina è dichiarato.",
    entries: [
      {
        q: "Cos’è CF Ready",
        a: "CF Ready controlla il Codice Fiscale e la PEC nel campo fiscale nativo del checkout italiano di Shopify. Non modifica il tema, non aggiunge campi e non emette fatture: decide soltanto se un ordine può essere completato con i dati inseriti.",
      },
      {
        q: "Quando viene richiesto il Codice Fiscale",
        a: "Quando lo imposti come obbligatorio e il cliente ha consegna e fatturazione in Italia. Sei tu a decidere se serve: CF Ready non stabilisce quando la tua attività deve raccoglierlo.",
      },
      {
        q: "Clienti con fatturazione estera",
        a: "Se la fatturazione è fuori dall’Italia, il cliente completa l’ordine senza controlli, anche quando la consegna è italiana. È una delle eccezioni automatiche e non si può disattivare.",
      },
      {
        q: "Eccezioni automatiche",
        a: "Le regole valgono solo con consegna e fatturazione italiane. Se il campo fiscale non è presente nel checkout, l’ordine passa lo stesso: un errore dell’app non deve bloccare una vendita legittima.",
      },
      {
        q: "Ritiro in negozio",
        a: "Senza indirizzo di consegna non c’è un Paese da confrontare, quindi le regole non si applicano e l’ordine passa. Se raccogli il Codice Fiscale anche per i ritiri, chiedilo fuori dal checkout.",
      },
      {
        q: "Che cosa vuol dire “formalmente valido”",
        a: "Che il codice rispetta le regole di composizione: lunghezza, struttura, data, codice catastale e carattere di controllo. Un Codice Fiscale formalmente valido può comunque non appartenere alla persona che lo inserisce, e CF Ready non lo verifica presso l’Agenzia delle Entrate.",
      },
      {
        q: "Codice Fiscale ordinario e provvisorio",
        a: "Sono accettate sia la forma ordinaria a 16 caratteri, comprese le varianti da omocodia, sia quella provvisoria a 11 cifre. Entrambe sono controllate solo nella composizione.",
      },
      {
        q: "Come viene validata la PEC",
        a: "Come indirizzo email: si controlla il formato. Non verifichiamo che la casella esista, né che sia davvero una casella di posta certificata.",
      },
      {
        q: "Quando il cliente vede gli errori",
        a: "Di norma quando prova a procedere. Se attivi gli avvisi preventivi, gli errori possono comparire già al caricamento del checkout: è la modalità consigliata se tieni attivo il passaggio di conferma dell’ordine di Shopify, perché evita che il cliente arrivi alla revisione bloccato e senza un messaggio. CF Ready non può leggere quell’impostazione del tuo store: la scelta è tua.",
      },
      {
        q: "Checkout accelerati",
        a: "Nei pagamenti rapidi il campo fiscale può non essere presente. In quel caso l’ordine passa senza controlli, per la stessa ragione per cui un campo assente non blocca mai una vendita.",
      },
      {
        q: "Cosa succede se disattivo l’app",
        a: "Il checkout torna a comportarsi come prima e nessun ordine viene più bloccato. Regole e messaggi restano salvati e tornano validi quando riattivi.",
      },
      {
        q: "Uso il campo “Interno” per il Codice Fiscale",
        a: "Il Codice Fiscale va raccolto nel campo fiscale nativo del checkout italiano. Se lo raccogli anche nella seconda riga dell’indirizzo, il cliente vede due campi per lo stesso dato: apri Impostazioni → Checkout e porta quella riga su “Facoltativo” o “Non includere”, poi rimetti l’etichetta originale da “Gestisci la lingua del checkout”. CF Ready non legge e non modifica quell’impostazione: l’avviso che vedi in app si basa sulla tua dichiarazione.",
      },
      {
        q: "Prova e pagamenti",
        a: "La prova dura quattordici giorni, uno solo per store, senza chiedere un metodo di pagamento. Se scegli un piano durante la prova, i giorni che restano non li perdi: Shopify li riceve come giorni di prova della sottoscrizione.",
      },
      {
        q: "Privacy e dati",
        a: "CF Ready non conserva Codici Fiscali, indirizzi PEC, ordini o dati dei tuoi clienti. Il controllo avviene durante il checkout e non lascia traccia dei valori inseriti.",
      },
      {
        q: "CF Ready emette fatture?",
        a: "No. Non emette, non trasmette e non conserva fatture, e non si collega al Sistema di Interscambio.",
      },
      {
        q: "Perché non gestisce Partita IVA e Codice SDI",
        a: "Sono dati che seguono regole diverse e servono a flussi di fatturazione elettronica che CF Ready non copre. Preferiamo fare bene due campi invece che quattro male.",
      },
      {
        q: "Piani Shopify e canali supportati",
        a: "CF Ready funziona sul checkout web di Shopify e richiede uno store con indirizzo in Italia. Gli ordini creati fuori dal checkout, per esempio dal pannello, non passano dai controlli.",
      },
      {
        q: "Limitazioni",
        a: "Il controllo è solo formale, non anagrafico. Le generazioni successive degli ordini ricorrenti in abbonamento non sono coperte, e nei checkout dove il campo fiscale non compare l’ordine passa senza controlli.",
      },
      {
        q: "Qualcosa non torna",
        a: "Riapri la pagina: all’apertura l’app rilegge lo stato da Shopify e ripara le divergenze sicure. Se resta un avviso di sincronizzazione il checkout non viene bloccato, e se il problema persiste scrivici indicando il codice mostrato.",
      },
      {
        q: "Rivedere la configurazione iniziale",
        a: "Puoi cambiare regole e messaggi quando vuoi dalle rispettive pagine, senza rifare la procedura iniziale.",
      },
      {
        q: "Contattare lo sviluppatore",
        a: "Il canale di assistenza sarà indicato qui appena disponibile.",
      },
    ],
  },
  plan: {
    heading: "Piano",
    trial: (date: string) => `Prova attiva fino al ${date}.`,
    oneTime: "Pagamento unico attivo, senza rinnovi.",
    subscription: (date: string) => `Abbonamento attivo fino al ${date}.`,
    trialOver: "Prova terminata: scegli una modalità per riattivare le regole.",
    trialEndsSoon: (date: string) =>
      `La prova finisce il ${date}. Dopo quella data il checkout non blocca più gli ordini senza i dati richiesti, e regole e messaggi restano salvati.`,
    trialLastDay: (date: string) =>
      `Oggi è l’ultimo giorno di prova: finisce il ${date}. Da domani il checkout non blocca più nulla, e regole e messaggi restano salvati.`,
    none: "Nessun piano attivo.",
    monthlyStart: "Attiva il mensile",
    monthlySwitch: "Passa al mensile",
    annualStart: "Attiva l’annuale",
    annualSwitch: "Passa all’annuale",
    oneTimeSwitch: "Passa a un solo pagamento",
    cancelRenewal: "Cancella il rinnovo",
    cancelBody:
      "L’accesso resta fino alla fine del periodo già pagato, senza rimborsi parziali. Regole e messaggi restano salvati.",
    firstCharge: (date: string) =>
      `Se attivi oggi, il primo addebito è il ${date}: i giorni di prova che restano non li perdi.`,
    firstChargeNow: "L’addebito parte alla tua approvazione su Shopify.",
    oneTimeCharge:
      "Addebito unico alla tua approvazione su Shopify. I giorni di prova residui decadono.",
    recommended: "Consigliato",
    generationLaunch: "Prezzo di lancio, acquisito da questo store.",
    generationStandard: "Prezzo standard, acquisito da questo store.",
    nextCharge: (date: string) => `Prossimo addebito il ${date}.`,
    periodEnds: (date: string) => `Il periodo pagato finisce il ${date}.`,
    lastAttempt:
      "L’ultima lettura dello stato commerciale non è riuscita. Il checkout non viene bloccato: riapri la pagina fra qualche minuto.",
    netCost: (amount: string) => `Costo netto stimato oggi: ${amount}.`,
    endingAlready:
      "Il rinnovo è già stato cancellato: l’accesso resta fino alla fine del periodo pagato.",
    monthlyName: "Mensile",
    annualName: "Annuale",
    oneTimeName: "Un solo pagamento",
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
    messages: "Customer messages",
    plan: "Plan and billing",
    guide: "Help and FAQ",
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
    unsupportedGuide: "The Help page explains what the app does and where its limits are.",
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
    helpHeading: "Help and support",
    helpBody: "What CF Ready checks, what it doesn’t, and what happens in the edge cases.",
    nextAddress2:
      "Stop using the “Apartment, suite, etc.” field for the tax code: right now customers see two fields for the same value. The steps are on Checkout rules.",
  },
  messages: {
    heading: "Customer messages",
    intro:
      "These are the texts customers read at checkout when a field is missing or not formally valid. Customers checking out in Italian see the Italian ones, everyone else sees the English ones.",
    italian: "Italiano",
    english: "English",
    taxCodeRequired: "Tax code required",
    taxCodeInvalid: "Tax code invalid",
    pecRequired: "PEC required",
    pecInvalid: "PEC invalid",
    counter: (used: number) => `${used}/200 characters`,
    tooLong: "200 characters maximum.",
    empty: "The message can’t be empty.",
    reset: "Restore default texts",
    resetConfirm: (language: string) =>
      `The four ${language} messages go back to their default texts. The others don’t change, and it only takes effect once you save.`,
    appearHeading: "Which messages appear",
    appearIntro:
      "It depends on your active rules: nobody reads the messages of a field you don’t manage.",
    appears: "Shown",
    appearsNot: "Not shown",
  },
  guide: {
    heading: "Help and FAQ",
    intro:
      "How CF Ready behaves at checkout, what it checks and what it doesn’t. If you can’t find your answer, contact us.",
    asideBody:
      "CF Ready only checks the shape of the data, verifies it against no registry and issues no invoices. Wherever there’s a limit, this page states it.",
    entries: [
      {
        q: "What CF Ready does",
        a: "CF Ready checks the Italian tax code (Codice Fiscale) and the certified email address (PEC) in the native Italian checkout field. It doesn’t change your theme, doesn’t add fields and doesn’t issue invoices: it only decides whether an order can be completed with the values entered.",
      },
      {
        q: "When the tax code is required",
        a: "When you set it as required and the customer has both delivery and billing in Italy. You decide whether you need it: CF Ready doesn’t determine when your business has to collect it.",
      },
      {
        q: "Customers billing outside Italy",
        a: "If billing is outside Italy, the customer completes the order with no checks, even when delivery is Italian. It’s one of the automatic exceptions and can’t be turned off.",
      },
      {
        q: "Automatic exceptions",
        a: "Rules only apply when both delivery and billing are Italian. If the tax field isn’t in the checkout, the order goes through anyway: an app error must never block a legitimate sale.",
      },
      {
        q: "Local pickup",
        a: "With no delivery address there’s no country to compare, so the rules don’t apply and the order goes through. If you collect the tax code for pickups too, ask for it outside the checkout.",
      },
      {
        q: "What “formally valid” means",
        a: "That the code follows the composition rules: length, structure, date, town code and check character. A formally valid tax code may still not belong to the person entering it, and CF Ready doesn’t verify it with the Italian tax authority.",
      },
      {
        q: "Ordinary and provisional tax codes",
        a: "Both the ordinary 16-character form, including omocodia variants, and the provisional 11-digit form are accepted. Both are checked on composition only.",
      },
      {
        q: "How PEC is validated",
        a: "As an email address: the format is checked. We don’t verify that the mailbox exists, nor that it’s really a certified mailbox.",
      },
      {
        q: "When customers see errors",
        a: "Normally when they try to continue. If you turn on early warnings, errors can appear as soon as checkout loads: that’s the recommended mode if you keep Shopify’s order confirmation step, because it stops customers reaching the review page blocked and without a message. CF Ready can’t read that setting on your store: the choice is yours.",
      },
      {
        q: "Accelerated checkouts",
        a: "In express payments the tax field may not be present. In that case the order goes through with no checks, for the same reason a missing field never blocks a sale.",
      },
      {
        q: "What happens if I turn the app off",
        a: "Checkout goes back to how it was and no order is blocked any more. Your rules and messages stay saved and apply again when you turn it back on.",
      },
      {
        q: "I use the “Apartment, suite, etc.” field for the tax code",
        a: "The tax code belongs in the native Italian checkout field. If you also collect it in the second address line, customers see two fields for the same value: open Settings → Checkout and set that line to “Optional” or “Don’t include”, then restore the original label from “Manage checkout language”. CF Ready can’t read or change that setting: the warning you see in the app is based on what you told us.",
      },
      {
        q: "Trial and payments",
        a: "The trial lasts fourteen days, one per store, with no payment method required. If you choose a plan during the trial you don’t lose the days you have left: Shopify receives them as trial days on the subscription.",
      },
      {
        q: "Privacy and data",
        a: "CF Ready doesn’t store tax codes, PEC addresses, orders or any of your customers’ data. The check happens during checkout and leaves no trace of the values entered.",
      },
      {
        q: "Does CF Ready issue invoices?",
        a: "No. It doesn’t issue, transmit or store invoices, and it doesn’t connect to the Italian exchange system.",
      },
      {
        q: "Why it doesn’t handle VAT number and SDI code",
        a: "They follow different rules and serve electronic invoicing flows CF Ready doesn’t cover. We’d rather do two fields well than four badly.",
      },
      {
        q: "Shopify plans and supported channels",
        a: "CF Ready works on Shopify’s web checkout and needs a store based in Italy. Orders created outside the checkout, for example from the admin, don’t go through the checks.",
      },
      {
        q: "Limitations",
        a: "The check is only formal, not against any registry. Later generations of recurring subscription orders aren’t covered, and in checkouts where the tax field doesn’t appear the order goes through unchecked.",
      },
      {
        q: "Something doesn’t look right",
        a: "Reload the page: on opening, the app re-reads its state from Shopify and repairs safe divergences. If a sync warning stays, checkout isn’t blocked, and if the problem persists contact us quoting the code shown.",
      },
      {
        q: "Reviewing your initial setup",
        a: "You can change rules and messages whenever you want from their own pages, without redoing the initial steps.",
      },
      {
        q: "Contacting the developer",
        a: "The support channel will be shown here as soon as it’s available.",
      },
    ],
  },
  plan: {
    heading: "Plan",
    trial: (date: string) => `Trial active until ${date}.`,
    oneTime: "One payment active, no renewals.",
    subscription: (date: string) => `Subscription active until ${date}.`,
    trialOver: "Trial over: choose a plan to apply your rules again.",
    trialEndsSoon: (date: string) =>
      `Your trial ends on ${date}. After that date checkout no longer blocks orders missing the required fields, and your rules and messages stay saved.`,
    trialLastDay: (date: string) =>
      `Today is the last day of your trial: it ends on ${date}. From tomorrow checkout blocks nothing, and your rules and messages stay saved.`,
    none: "No active plan.",
    monthlyStart: "Start monthly",
    monthlySwitch: "Switch to monthly",
    annualStart: "Start annual",
    annualSwitch: "Switch to annual",
    oneTimeSwitch: "Switch to one payment",
    cancelRenewal: "Cancel renewal",
    cancelBody:
      "Access stays until the end of the period you already paid for, with no partial refund. Your rules and messages stay saved.",
    firstCharge: (date: string) =>
      `If you start today, the first charge is on ${date}: you keep the trial days you have left.`,
    firstChargeNow: "The charge starts as soon as you approve it on Shopify.",
    oneTimeCharge:
      "One charge as soon as you approve it on Shopify. Any remaining trial days are given up.",
    recommended: "Recommended",
    generationLaunch: "Launch price, locked in for this store.",
    generationStandard: "Standard price, locked in for this store.",
    nextCharge: (date: string) => `Next charge on ${date}.`,
    periodEnds: (date: string) => `The paid period ends on ${date}.`,
    lastAttempt:
      "The last read of your billing status failed. Checkout isn’t blocked: reload the page in a few minutes.",
    netCost: (amount: string) => `Estimated net cost today: ${amount}.`,
    endingAlready:
      "The renewal is already cancelled: access stays until the end of the period you paid for.",
    monthlyName: "Monthly",
    annualName: "Annual",
    oneTimeName: "One payment",
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

// FR-077: avvisi di prova a sette giorni, tre giorni, ultimo giorno e scadenza. Solo in app,
// nessuna email (FR-078), e mai un conto alla rovescia (§14.3): si dice la data.
export function trialNotice(
  { remaining, endsAt }: { remaining: number; endsAt: string | null },
  locale: Locale,
): { tone: "info" | "warning"; text: string } | null {
  const t = texts(locale).plan;
  if (!endsAt || remaining > 7 || remaining < 1) return null;
  const date = formatDate(endsAt, locale);

  if (remaining === 1) return { tone: "warning", text: t.trialLastDay(date) };
  return { tone: remaining <= 3 ? "warning" : "info", text: t.trialEndsSoon(date) };
}
