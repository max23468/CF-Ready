export const it = {
  nav: {
    home: "Home",
    rules: "Regole checkout",
    messages: "Messaggi al cliente",
    guide: "Guida e FAQ",
  },
  common: {
    save: "Salva",
    cancel: "Annulla",
  },
  errors: {
    validation_locked: "Un’altra operazione sul controllo è in corso. Riprova fra poco.",
    validation_write_failed:
      "Non è stato possibile salvare. Shopify non ha accettato la scrittura. Riprova; se l’errore si ripete, scrivici.",
    validation_readback_failed:
      "Non è stato possibile salvare. Shopify non ha confermato la scrittura. Riapri la pagina per vedere lo stato reale.",
    validation_limit_reached:
      "Questo store ha già il numero massimo di controlli al checkout consentito da Shopify. Le tue regole restano salvate. Disattiva il controllo di un’altra app da Impostazioni → Checkout, poi riprova: CF Ready non tocca le risorse di altre app.",
    country_not_eligible:
      "CF Ready funziona solo con store che hanno l’indirizzo in Italia. Le regole restano salvate.",
    entitlement_required:
      "Inizia prima la prova o scegli come pagare: senza, il controllo resterebbe attivo ma senza effetto nel checkout.",
    config_conflict:
      "Le regole sono cambiate da un’altra scheda o da un altro membro dello staff mentre modificavi. Riapri la pagina per vedere quelle correnti, poi rifai la tua modifica: non sovrascriviamo il lavoro di qualcun altro.",
    duplicate_validations:
      "Shopify restituisce più controlli CF Ready. Sono stati disattivati per lasciare il checkout aperto, ma non possiamo scegliere quale conservare senza rischiare di perdere configurazione: nessuno viene eliminato automaticamente.",
    duplicate_validations_active:
      "Shopify restituisce più controlli CF Ready e non ha confermato la loro disattivazione. Riprova la riparazione: nessun controllo viene eliminato automaticamente.",
    billing_read_failed:
      "Le informazioni sul piano non sono aggiornate. Il checkout non viene bloccato: riapri la pagina fra qualche minuto.",
    one_time_already_active:
      "Questo store ha già il pagamento unico: un altro addebito non aggiungerebbe nulla.",
    charge_pending:
      "Un pagamento unico è già in attesa di approvazione. Completalo o attendi la sua scadenza prima di riprovare.",
    charge_failed: "Non è stato possibile avviare il pagamento. Riprova fra poco.",
    trial_unavailable:
      "La prova di questo store è già stata usata. Scegli come pagare per riattivare il controllo nel checkout.",
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
      "CF Ready funziona solo con store che hanno l’indirizzo in Italia. Nessuna prova è iniziata, nessun controllo è stato creato e nessun pagamento è stato richiesto.",
    unsupportedCheckAddress:
      "Se lo store è italiano, controlla l’indirizzo in Impostazioni → Dettagli negozio: CF Ready legge il Paese da lì.",
    unsupportedGuide: "La Guida spiega cosa fa l’app e quali sono i suoi limiti.",
    noEntitlement:
      "Senza un piano attivo il checkout non blocca più nulla. Regole e messaggi restano salvati e tornano validi con il pagamento.",
    syncNeeded:
      "Lo stato mostrato qui potrebbe non coincidere con Shopify. Il checkout non viene bloccato. Riapri la pagina fra qualche minuto.",
    repair: "Ripara configurazione",
    messagesLabel: "Messaggi al cliente",
    messagesDefault: "Predefiniti",
    messagesCustom: "Personalizzati",
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
    saved: "Messaggi salvati.",
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
  setup: {
    heading: "Prepara CF Ready",
    // Il merchant ha appena installato: la prima cosa che legge dice dove si trova e
    // quanto ci vuole, non un contatore di passi.
    welcome:
      "Benvenuto. Da qui decidi quali dati chiedere ai tuoi clienti italiani nel checkout e quando far valere le regole. Bastano pochi minuti e puoi fermarti a metà: quello che salvi resta.",
    progress: (done: number, total: number) => `${done} di ${total} completati`,
    rulesTitle: "Scegli cosa controllare",
    rulesBody: "Decidi se Codice Fiscale e PEC sono non gestiti, facoltativi o obbligatori.",
    activateTitle: "Attiva nel checkout",
    activateBody: "Finché non attivi, le regole restano salvate ma non valgono per i clienti.",
    planTitle: "Inizia la prova o scegli come pagare",
    planBody:
      "La prova dura 14 giorni, è gratuita e non chiede una carta: finché non la inizi non si consuma. Senza prova né pagamento le regole restano salvate ma non valgono nel checkout.",
    planBodyEntitled:
      "Quando la prova finisce serve una modalità di pagamento, altrimenti il checkout smette di controllare.",
    startTrial: "Inizia la prova",
    address2Title: "Smetti di usare il campo “Interno”",
    guided: "Apri la procedura guidata",
  },
  onboarding: {
    heading: "Configura CF Ready",
    stepOf: (current: number, total: number) => `Passo ${current} di ${total}`,
    stepNames: ["Introduzione", "Regole", "Checkout", "Riepilogo"],
    back: "Indietro",
    next: "Continua",
    welcomeHeading: "Benvenuto in CF Ready",
    welcomeBody:
      "Quattro passi, cinque minuti. Alla fine decidi tu se iniziare la prova o pagare subito: niente parte da solo.",
    step1Heading: "Cosa fa e cosa non fa",
    step1Body:
      "CF Ready controlla il Codice Fiscale e la PEC nel campo fiscale nativo del checkout italiano. Non modifica il tema, non aggiunge campi e non emette fatture.",
    step1Limits: [
      "Il controllo è formale: verifica la composizione del dato, non a chi appartiene.",
      "Le regole valgono solo con consegna e fatturazione in Italia.",
      "Se Shopify mostra una consegna italiana ma omette un campo obbligatorio, CF Ready blocca con un avviso generale; senza consegna osservabile resta fail-open.",
    ],
    step2Heading: "Scegli cosa controllare",
    step2Body: "Puoi cambiare queste scelte quando vuoi da Regole checkout.",
    step3Heading: "Cosa succede nel checkout",
    step3Messages: "I testi che il cliente legge",
    step3MessagesBody:
      "Sono già pronti in italiano e inglese. Puoi riscriverli quando vuoi da Messaggi al cliente.",
    step4Heading: "Riepilogo",
    step4Body: "Da qui puoi attivare subito le regole oppure salvarle e attivarle più tardi.",
    step4TrialHeading: "Prova o pagamento",
    step4TrialBody:
      "Le regole valgono nel checkout solo con una prova o un pagamento attivo. La prova dura 14 giorni, è gratuita e non chiede una carta: finché non la inizi, non si consuma.",
    step4StartTrial: "Inizia la prova di 14 giorni",
    step4SeePlans: "Vedi come pagare",
    step4TrialActive: "Prova già attiva: non serve fare altro.",
    reviewStep4Body:
      "Il controllo è già attivo nel checkout. Completa la revisione per tornare alla Home.",
    activate: "Attiva nel checkout",
    finishWithout: "Completa senza attivare",
    completeReview: "Completa revisione",
    doneHeading: "Configurazione completata",
    doneBody:
      "Le regole sono salvate. Puoi cambiarle quando vuoi, e questa procedura resta disponibile dalla Guida.",
    reopen: "Rivedi la configurazione iniziale",
  },
  support: {
    heading: "Assistenza",
    body: "Le richieste arrivano a chi sviluppa l’app e ricevono una risposta scritta a mano. Il collegamento apre il tuo programma di posta con un messaggio già compilato: puoi leggerlo e modificarlo prima di inviarlo.",
    privacyNote:
      "Nel messaggio finiscono solo dominio dello store, versione, lingua e stato tecnico dell’app. Non allegare Codici Fiscali, PEC, ordini o dati dei tuoi clienti: per capire un problema non servono.",
    subject: "Assistenza CF Ready",
    chooseCategory: "Scegli l’argomento:",
    categories: {
      checkout: "Checkout e regole",
      billing: "Piano e pagamento",
      other: "Altro",
    },
    technicalHeading: "--- Dati tecnici, puoi cancellarli ---",
    fieldShop: "Store",
    fieldVersion: "Versione app",
    fieldLanguage: "Lingua",
    fieldCountry: "Paese rilevato",
    fieldEntitlement: "Prova o piano attivo",
    fieldValidation: "Controllo attivo nel checkout",
    fieldErrorCode: "Ultimo codice di errore",
    yes: "sì",
    no: "no",
  },
  guide: {
    heading: "Guida e FAQ",
    intro:
      "Come si comporta CF Ready nel checkout, cosa controlla e cosa no. Se non trovi la risposta, scrivici.",
    faqHeading: "Domande frequenti",
    expandAll: "Espandi tutte",
    collapseAll: "Comprimi tutte",
    asideHeading: "Cosa fa e cosa non fa CF Ready",
    asideLinks: "Dove si configura",
    asideBody:
      "CF Ready serve a non ricevere ordini italiani da fatturare senza Codice Fiscale: lo rende obbligatorio nel campo nativo del checkout e ne controlla la forma. Non verifica che il codice appartenga a chi lo inserisce, non emette fatture e non gestisce Partita IVA e Codice SDI.",
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
        q: "Perché un ordine è passato senza i dati richiesti",
        a: "Le regole non si applicano con fatturazione estera o con sole consegne estere. Nei pagamenti rapidi, se Shopify espone una consegna italiana ma omette un campo obbligatorio, CF Ready mostra un errore generale e blocca il completamento; senza una consegna osservabile il campo assente resta fail-open, perché il cliente potrebbe non avere nulla da compilare.",
      },
      {
        q: "Che cosa viene controllato sul Codice Fiscale",
        a: "La composizione: lunghezza, struttura, data, codice catastale e carattere di controllo. Sono accettate la forma ordinaria a 16 caratteri, comprese le varianti da omocodia, e quella provvisoria a 11 cifre. Un Codice Fiscale formalmente valido può comunque non appartenere alla persona che lo inserisce, e non viene verificato presso l’Agenzia delle Entrate.",
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
        q: "Uso il campo “Interno” per il Codice Fiscale",
        a: "Il Codice Fiscale va raccolto nel campo fiscale nativo del checkout italiano. Se lo raccogli anche nella seconda riga dell’indirizzo, il cliente vede due campi per lo stesso dato: apri Impostazioni → Checkout e porta quella riga su “Facoltativo” o “Non includere”, poi rimetti l’etichetta originale da “Gestisci la lingua del checkout”. CF Ready non legge e non modifica quell’impostazione: l’avviso che vedi in app si basa sulla tua dichiarazione.",
      },
      {
        q: "Prova e pagamenti",
        a: "La prova dura quattordici giorni, uno solo per store, senza chiedere un metodo di pagamento. Se scegli un piano durante la prova, i giorni che restano non li perdi: Shopify li riceve come giorni di prova della sottoscrizione.",
      },
      {
        q: "Limitazioni e canali supportati",
        a: "CF Ready funziona sul checkout web di Shopify e richiede uno store con indirizzo in Italia. Il controllo è solo formale, non anagrafico, e gli ordini creati fuori dal checkout, per esempio dal pannello, non ci passano. Le generazioni successive degli ordini ricorrenti in abbonamento non sono coperte.",
      },
      {
        q: "Fatturazione elettronica, Partita IVA e Codice SDI",
        a: "CF Ready non emette, non trasmette e non conserva fatture, e non si collega al Sistema di Interscambio. Partita IVA e Codice SDI hanno regole di validazione e flussi diversi da quelli dei due campi che gestiamo, e i localized fields del checkout non li espongono allo stesso modo: oggi non rientrano in ciò su cui stiamo lavorando.",
      },
      {
        q: "Privacy e dati",
        a: "CF Ready non conserva Codici Fiscali, indirizzi PEC, ordini o dati dei tuoi clienti. Il controllo avviene durante il checkout e non lascia traccia dei valori inseriti.",
      },
      {
        q: "Cosa succede se disattivo l’app",
        a: "Il checkout torna a comportarsi come prima e nessun ordine viene più bloccato. Regole e messaggi restano salvati e tornano validi quando riattivi.",
      },
      {
        q: "Qualcosa non torna",
        a: "Riapri la pagina: all’apertura l’app rilegge lo stato da Shopify e ripara le divergenze sicure. Se resta un avviso di sincronizzazione il checkout non viene bloccato, e se il problema persiste scrivici indicando il codice mostrato.",
      },
      {
        q: "Rivedere la configurazione iniziale",
        a: "Puoi cambiare regole e messaggi quando vuoi dalle rispettive pagine. La procedura guidata resta disponibile e ripercorrerla non azzera nulla: le tue scelte restano quelle salvate.",
      },
      {
        q: "Contattare lo sviluppatore",
        a: "Scrivi a cfready@icloud.com, oppure usa il collegamento nella colonna a fianco: prepara il messaggio con i dati tecnici dello store già compilati. Rispondiamo a mano, di solito entro uno o due giorni lavorativi. Se il problema blocca il checkout, scrivilo nell’oggetto.",
      },
    ],
  },
  plan: {
    heading: "Piano",
    trial: (date: string) => `Prova attiva fino al ${date}.`,
    oneTime: "Pagamento unico attivo, senza rinnovi.",
    subscription: (date: string) => `Abbonamento attivo fino al ${date}.`,
    trialOver: "Prova terminata: scegli come continuare per riattivare le regole.",
    trialEndsSoon: (date: string) =>
      `La prova finisce il ${date}. Dopo quella data il checkout non blocca più gli ordini senza i dati richiesti, e regole e messaggi restano salvati.`,
    trialLastDay: (date: string) =>
      `Oggi è l’ultimo giorno di prova: finisce il ${date}. Da domani il checkout non blocca più nulla, e regole e messaggi restano salvati.`,
    none: "Nessun piano attivo.",
    // Prima scelta: la prova non parte da sola, la avvia il merchant quando vuole.
    notStartedHeading: "Prima di attivare il controllo",
    notStartedBody:
      "Per far valere le regole nel checkout serve una prova o un pagamento attivo. La prova dura 14 giorni, è gratuita e non chiede una carta: puoi iniziarla adesso o più tardi, e finché non lo fai non si consuma.",
    startTrial: "Inizia la prova di 14 giorni",
    startTrialDone: "Prova avviata.",
    orChoose: "Oppure scegli subito come pagare, saltando la prova.",
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
    chooseHeading: "Come vuoi continuare",
    chooseBody:
      "Le tre modalità hanno le stesse funzioni: cambia solo quando e quanto paghi. I pagamenti li gestisce Shopify e finiscono sulla fattura del tuo store, non su una carta lasciata a noi.",
    // §14.11: formulazione approvata. §7.2 vieta “a vita”, “per sempre”, “illimitato” e
    // “senza limiti di tempo”: si dice cosa il pagamento include, senza promettere una durata.
    oneTimeSettled:
      "Un solo pagamento per questo store, senza rinnovi. Include gli aggiornamenti dell’app e l’assistenza, senza costi aggiuntivi. Non c’è altro da scegliere.",
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
    saved: "Regole salvate.",
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
      "Se Shopify mostra una consegna italiana ma omette un campo obbligatorio, CF Ready blocca con un avviso generale; senza consegna osservabile resta fail-open.",
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
    disabled: "Il controllo non è attivo: queste regole non valgono ancora per i tuoi clienti.",
    lapsed:
      "Il controllo è attivo ma il piano non lo è: finché resta così il checkout non blocca nulla.",
  },
};
