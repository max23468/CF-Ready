export const it = {
  nav: {
    home: "Home",
    rules: "Regole checkout",
    messages: "Messaggi al cliente",
    guide: "Guida e FAQ",
  },
  common: {
    yes: "Sì",
    no: "No",
    save: "Salva",
    cancel: "Annulla",
  },
  conflict: {
    heading: "La configurazione è cambiata",
    body: "Confronta la configurazione attuale con la tua bozza. Riapplica conserva solo i campi che hai modificato: controlla il risultato e premi Salva.",
    current: "Attuale",
    draft: "La tua bozza",
    reapply: "Riapplica le mie modifiche",
    discard: "Usa la configurazione attuale",
  },
  errors: {
    validation_locked: "Un’altra operazione sul controllo è in corso. Riprova fra poco.",
    validation_write_failed:
      "Non è stato possibile salvare. Shopify non ha accettato la scrittura. Riprova; se l’errore si ripete, scrivici.",
    validation_readback_failed:
      "Non è stato possibile salvare. Shopify non ha confermato la scrittura. Riapri la pagina per vedere lo stato reale.",
    checkout_labels_scope_required:
      "Per leggere e sincronizzare le etichette devi concedere i permessi facoltativi Shopify.",
    checkout_labels_resource_missing:
      "Shopify non espone una delle etichette attese. Le regole continuano a funzionare; usa la procedura guidata.",
    checkout_labels_resource_ambiguous:
      "Shopify espone più risorse per la stessa etichetta. Nessun testo è stato modificato.",
    checkout_labels_locale_missing:
      "Italiano o inglese non sono disponibili nello store. Pubblica la lingua oppure continua con quelle disponibili.",
    checkout_labels_conflict:
      "Un’etichetta è cambiata dopo l’ultima lettura. Rileggi Shopify prima di decidere quale testo mantenere.",
    checkout_labels_confirmation_required:
      "Conferma il confronto prima della prima scrittura automatica delle etichette.",
    checkout_labels_stale_digest:
      "Shopify ha aggiornato il contenuto durante il salvataggio. Rileggi le etichette e riprova.",
    checkout_labels_partial_sync:
      "Le regole sono salvate, ma alcune etichette richiedono un nuovo tentativo.",
    checkout_labels_readback_failed:
      "Shopify non ha confermato tutte le etichette. Rileggi lo stato prima di modificarle ancora.",
    address2_restore_conflict:
      "Il testo di Interno è cambiato dopo il confronto. Rileggi Shopify prima del ripristino.",
    validation_limit_reached:
      "Questo store ha già il numero massimo di controlli al checkout consentito da Shopify. Le tue regole restano salvate. Disattiva il controllo di un’altra app da Impostazioni → Checkout, poi riprova: CF Ready non tocca le risorse di altre app.",
    entitlement_required:
      "Inizia prima la prova o scegli come pagare: senza, il controllo resterebbe attivo ma senza effetto nel checkout.",
    config_conflict:
      "La configurazione è cambiata in un’altra finestra. Confronta i valori e scegli se riapplicare le tue modifiche o usare la configurazione attuale.",
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
    nextHeading: "Prossimo passo",
    badgeActive: "Attiva",
    badgeInactive: "Disattivata",
    badgeNotStarted: "Non ancora attiva",
    titleActive: "Validazione attiva nel checkout",
    titleDisabled: "Validazione disattivata",
    titleNotStarted: "Controllo non ancora attivo",
    titleLapsed: "Validazione attiva, piano non attivo",
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
    nextTestOrder:
      "Controlla i prossimi ordini per verificare che le regole siano applicate come previsto.",
    nextStartTrial:
      "Le regole sono pronte. Avvia la prova gratuita quando vuoi oppure scegli subito un piano.",
    nextChoosePlan: "Scegli una modalità per riattivare le regole nel checkout.",
    helpHeading: "Guida e assistenza",
    helpBody: "Cosa controlla CF Ready, cosa non controlla e cosa succede nei casi particolari.",
    checkInHeading: "Grazie per aver scelto CF Ready",
    checkInBody:
      "Il controllo nel checkout è attivo. Se hai feedback sulla configurazione o hai bisogno di aiuto, scrivi direttamente allo sviluppatore.",
    checkInContact: "Scrivimi",
    checkInDismiss: "Non mostrare più",
    nextAddress2:
      "Smetti di usare il campo “Interno” per il Codice Fiscale: oggi il cliente vede due campi per lo stesso dato. Le istruzioni sono in Regole checkout.",
    checkoutLabelsScopeRequired:
      "I permessi per leggere e sincronizzare le etichette del checkout non sono più disponibili.",
    checkoutLabelsActionRequired:
      "Le etichette del checkout o il campo “Interno” richiedono un controllo.",
    checkoutLabelsOpen: "Controlla le etichette",
  },
  messages: {
    heading: "Messaggi al cliente",
    saved: "Messaggi salvati.",
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
    appearHeading: "Messaggi collegati alle regole",
    appearIntro:
      "Questi indicatori dipendono dalle regole scelte, non dallo stato del controllo. Un messaggio può comparire nel checkout solo quando il controllo è attivo.",
    appears: "Previsto",
    appearsNot: "Non previsto",
    languageSelector: "Lingua dei messaggi",
    previewHeading: "Anteprima nel checkout",
    previewContext: "Quando il cliente prova a completare l’ordine",
    previewErrorHeading: "Ordine non completato",
    previewSelected: "Messaggio selezionato",
    previewFieldLabel: "Etichetta del campo",
    labelsNote:
      "Le etichette identificano i campi; questi messaggi spiegano al cliente cosa correggere.",
    manageLabels: "Gestisci le etichette da Regole checkout",
  },
  setup: {
    heading: "Prepara CF Ready",
    welcome: "Scegli cosa controllare e quando attivare le regole nel checkout.",
    progress: (done: number, total: number) => `${done} di ${total} completati`,
    rulesTitle: "Scegli cosa controllare",
    rulesBody: "Decidi se Codice Fiscale e PEC sono non gestiti, facoltativi o obbligatori.",
    activateTitle: "Attiva nel checkout",
    activateBody: "Finché non attivi, le regole restano salvate ma non valgono per i clienti.",
    planTitle: "Avvia la prova",
    planTitleLapsed: "Scegli un piano",
    planTitleActive: "Accesso attivo",
    planBody:
      "La prova gratuita dura 14 giorni, non richiede una carta e inizia solo quando la avvii.",
    planBodyLapsed:
      "La prova è terminata. Scegli un piano per far valere di nuovo le regole nel checkout; configurazione e messaggi restano salvati.",
    startTrial: "Avvia la prova gratuita",
    address2Title: "Smetti di usare il campo “Interno”",
    labelsTitle: "Controlla le etichette del checkout",
    labelsBody:
      "Confronta Codice Fiscale, PEC e “Interno” in italiano e inglese, poi scegli come gestirli.",
    guided: "Apri la procedura guidata",
  },
  onboarding: {
    heading: "Configura CF Ready",
    stepOf: (current: number, total: number) => `Passo ${current} di ${total}`,
    back: "Indietro",
    next: "Continua",
    welcomeHeading: "Benvenuto in CF Ready",
    welcomeBody:
      "Configura Codice Fiscale e PEC, controlla i messaggi mostrati al cliente e scegli quando attivare le regole.",
    step1Heading: "Cosa fa e cosa non fa",
    step1Body:
      "CF Ready controlla Codice Fiscale e PEC nel checkout Shopify. Non modifica il tema, non aggiunge campi e non emette fatture.",
    step1Limits: [
      "Verifica solo il formato dei dati: non conferma l’identità del cliente né che un indirizzo sia davvero una PEC.",
      "Le regole si applicano alle consegne in Italia. Non si applicano se l’indirizzo di fatturazione è estero. Se manca il Paese di consegna, i campi obbligatori non mostrati da Shopify non bloccano l’ordine.",
    ],
    step2Heading: "Scegli cosa controllare",
    step2Body: "Puoi cambiare queste scelte quando vuoi da Regole checkout.",
    labelsPreviewHeading: "Etichette proposte in italiano e inglese",
    labelsPermissionsGranted: "I permessi per confrontare le etichette sono disponibili.",
    labelsPermissionsOptional:
      "Puoi concedere ora i permessi per confrontare le etichette con Shopify oppure continuare senza attivarli.",
    step3Heading: "Anteprima delle regole",
    step3Body: "Con le regole che hai scelto:",
    step3Messages: "Messaggi configurati",
    step3MessagesBody:
      "Questi sono i quattro messaggi già configurati. Sono disponibili in italiano e inglese e puoi modificarli da Messaggi al cliente.",
    step4Heading: "Riepilogo",
    labelsSummary: "Gestione etichette",
    address2Summary: "Controllo di “Interno”",
    step4BodyReady: "Le regole sono salvate ma non ancora attive.",
    step4BodyNeedsEntitlement: "Le regole sono salvate ma non ancora attive.",
    step4TrialHeading: "Prova e piano",
    step4TrialBody: "Avvia la prova gratuita o scegli un piano per poterle attivare.",
    step4StartTrial: "Avvia la prova gratuita",
    step4SeePlans: "Confronta i piani",
    step4TrialActive: "La prova è attiva: puoi attivare il controllo.",
    step4PlanActive: "Il piano è attivo: puoi attivare il controllo.",
    reviewStep4Body:
      "Il controllo è già attivo nel checkout. Completa la revisione per tornare alla Home.",
    activate: "Attiva nel checkout",
    finishWithout: "Torna alla Home senza attivare",
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
    requestSupport: "Richiedi assistenza",
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
    fieldEntitlementKind: "Tipo di diritto",
    fieldValidation: "Controllo attivo nel checkout",
    fieldErrorCode: "Ultimo codice di errore",
    fieldConfigSchema: "Versione schema configurazione",
    fieldConfigHash: "Hash configurazione",
    fieldStateRevision: "Revisione stato",
    fieldLastSync: "Ultima sincronizzazione",
    fieldDiagnosticId: "ID diagnostica",
    copyDiagnostics: "Copia diagnostica",
    diagnosticsCopied: "Diagnostica copiata. Incollala nella richiesta di assistenza.",
    diagnosticsCopyFailed: "Non è stato possibile copiare la diagnostica.",
    entitlementKinds: {
      annual: "annuale",
      complimentary: "omaggio",
      monthly: "mensile",
      none: "nessuno",
      one_time: "una tantum",
      trial: "prova",
    },
    yes: "sì",
    no: "no",
  },
  guide: {
    diagnosis: {
      heading: "Il controllo non compare?",
      body: "Aggiorna e verifica regole, attivazione e piano usando la stessa sincronizzazione della Home. Eventuali incoerenze vengono gestite dal normale recupero dell’app. Questa verifica non prova un checkout reale.",
      refresh: "Aggiorna e verifica",
      failed:
        "Shopify non è raggiungibile o lo stato è ambiguo. Riprova dalla Home; nessun esito precedente vale come verifica aggiornata.",
      checkedAt: "Regole e attivazione verificate il",
      enabled: "La Validation è attiva su Shopify.",
      disabled: "La Validation è disattivata o assente. Apri la Home per gestire l’attivazione.",
      configured: "Almeno un campo è configurato per essere controllato.",
      unconfigured: "Entrambi i campi sono non gestiti: scegli le regole da applicare.",
      notChecked: "Regole e attivazione non ancora verificate in questa sessione.",
      openPlan: "Verifica il piano",
      lastSync: "Ultima sincronizzazione memorizzata",
      unknown: "Non disponibile",
      manualHeading: "Da verificare nel checkout",
      manualBody:
        "Conferma Paese di fatturazione e consegna, presenza dei campi fiscali nativi e momento in cui completi il checkout. Il campo “Interno” non è il campo Codice Fiscale. Queste condizioni richiedono una verifica manuale.",
      simulate: "Riproduci il caso nel simulatore",
      entitled: "Prova o piano validi nello stato appena sincronizzato.",
      notEntitled: "Nessuna prova o piano validi nello stato appena sincronizzato.",
      checkoutLabels: "Etichette del checkout",
      address2: "Campo “Interno”",
    },
    heading: "Guida e FAQ",
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
        a: "Quando lo imposti come obbligatorio, la fatturazione è italiana o non ancora disponibile e almeno una consegna è italiana. Se non è disponibile alcun Paese di consegna, come può accadere per prodotti digitali o ritiro, il controllo si applica solo se il campo Codice Fiscale è presente. Sei tu a decidere se serve: CF Ready non stabilisce quando la tua attività deve raccoglierlo.",
      },
      {
        q: "Perché un ordine è passato senza i dati richiesti",
        a: "Le regole non si applicano con fatturazione estera o con sole consegne estere. Con fatturazione italiana o non ancora disponibile e almeno una consegna italiana, un campo obbligatorio assente produce un errore generale. Se non è disponibile alcun Paese di consegna, vengono controllati soltanto i campi fiscali italiani presenti e un campo assente resta fail-open.",
      },
      {
        q: "Che cosa viene controllato sul Codice Fiscale",
        a: "Per la forma ordinaria a 16 caratteri controlliamo struttura, data, codice catastale, omocodia e carattere finale. Per la forma provvisoria controlliamo le 11 cifre e il relativo carattere di controllo. Un Codice Fiscale formalmente valido può comunque non appartenere alla persona che lo inserisce, e non viene verificato presso l’Agenzia delle Entrate.",
      },
      {
        q: "Come viene validata la PEC",
        a: "Come indirizzo email: si controlla il formato. Non verifichiamo che la casella esista, né che sia davvero una casella di posta certificata.",
      },
      {
        q: "Posso richiedere la PEC solo agli acquisti aziendali",
        a: "Puoi rendere la PEC obbligatoria quando il cliente compila il campo Azienda dell’indirizzo di fatturazione. Se Azienda resta vuoto, la PEC è facoltativa; quando viene inserita, CF Ready ne controlla comunque il formato. La regola usa il campo Azienda del checkout e non identifica automaticamente la natura fiscale dell’ordine.",
      },
      {
        q: "Quando il cliente vede gli errori",
        a: "CF Ready controlla i dati durante il checkout. Se un dato inserito non è valido, il cliente vede cosa correggere; i campi obbligatori vengono controllati prima che l’ordine possa essere completato.",
      },
      {
        q: "Uso il campo “Interno” per il Codice Fiscale",
        a: "Il Codice Fiscale va raccolto nel campo fiscale nativo del checkout italiano. CF Ready legge le etichette di “Interno” e segnala un possibile conflitto fiscale; può ripristinare le traduzioni che gestisce, mentre il testo sorgente della lingua primaria richiede la procedura mostrata in Regole checkout.",
      },
      {
        q: "Come funzionano le etichette automatiche",
        a: "Dopo il tuo consenso, CF Ready confronta le etichette native di Codice Fiscale e PEC in italiano e inglese e sincronizza soltanto locale, mercato e chiave già provati come scrivibili. Le regole salvate determinano se il testo indica un campo facoltativo o obbligatorio.",
      },
      {
        q: "Perché vedo ancora “facoltativo”",
        a: "Controlla i permessi, le lingue pubblicate e gli eventuali override di mercato da Regole checkout. Una nuova lingua, una modifica esterna o una sincronizzazione parziale richiedono un nuovo confronto e un checkout reale resta la verifica conclusiva.",
      },
      {
        q: "CF Ready può sapere se “Interno” è facoltativo o nascosto?",
        a: "No. Shopify espone i testi della seconda riga dell’indirizzo, ma non l’opzione del modulo che la rende obbligatoria, facoltativa o nascosta. Controlla quell’opzione in Impostazioni → Checkout.",
      },
      {
        q: "Cosa succede se uso Translate & Adapt o un’altra app",
        a: "CF Ready rilegge le etichette prima di scrivere. Se trova una modifica esterna, la conserva e chiede una decisione invece di sovrascriverla automaticamente.",
      },
      {
        q: "Cosa succede quando disattivo la gestione delle etichette",
        a: "CF Ready ripristina soltanto traduzioni ancora uguali all’ultima propria scrittura. Se un testo è cambiato nel frattempo, lo lascia invariato e mostra l’azione necessaria.",
      },
      {
        q: "Cosa succede alle etichette quando disinstallo CF Ready",
        a: "Le traduzioni Shopify possono restare dopo la disinstallazione. Prima di rimuovere l’app, usa Regole checkout per ripristinare le traduzioni gestite e verifica il checkout nelle lingue e nei mercati pubblicati.",
      },
      {
        q: "Prova e pagamenti",
        a: "La prova dura quattordici giorni ed è disponibile una sola volta per store, senza chiedere un metodo di pagamento. Se scegli un piano durante la prova, i giorni che restano non li perdi: Shopify li riceve come giorni di prova della sottoscrizione.",
      },
      {
        q: "Limitazioni e canali supportati",
        a: "CF Ready è disponibile per store di qualunque Paese e funziona sul checkout web di Shopify. Le regole si applicano con fatturazione italiana o non ancora disponibile e almeno una consegna italiana; senza un Paese di consegna, solo ai campi fiscali italiani presenti. Non si applicano con fatturazione estera o sole consegne estere. Il controllo è solo formale, non anagrafico, e gli ordini creati fuori dal checkout, per esempio dal pannello, non ci passano. Le generazioni successive degli ordini ricorrenti in abbonamento non sono coperte.",
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
        q: "Cosa succede se disattivo il controllo",
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
        a: "Scrivi a cfready@icloud.com, oppure usa il collegamento nella colonna a fianco: prepara il messaggio con i dati tecnici dello store già compilati. Rispondiamo a mano, di solito entro un giorno lavorativo. Se il problema blocca il checkout, scrivilo nell’oggetto.",
      },
    ],
  },
  plan: {
    heading: "Piano",
    trial: (date: string) => `Prova attiva fino al ${date}.`,
    oneTime: "Pagamento unico attivo, senza rinnovi.",
    complimentary: "Piano omaggio permanente attivo, senza rinnovi.",
    subscription: (date: string) => `Abbonamento attivo fino al ${date}.`,
    trialOver: "Prova terminata: scegli come continuare per riattivare le regole.",
    trialEndsSoon: (date: string) =>
      `La prova finisce il ${date}. Dopo quella data il checkout non blocca più gli ordini senza i dati richiesti, e regole e messaggi restano salvati.`,
    trialLastDay: (date: string) =>
      `Oggi è l’ultimo giorno di prova: finisce il ${date}. Da domani il checkout non blocca più nulla, e regole e messaggi restano salvati.`,
    none: "Nessun piano attivo.",
    notStartedStatus: "La prova gratuita non è ancora iniziata.",
    // Prima scelta: la prova non parte da sola, la avvia il merchant quando vuole.
    notStartedHeading: "Prima di attivare il controllo",
    notStartedBody:
      "Avvia la prova gratuita di 14 giorni per attivare le regole. Non richiede una carta e inizia solo quando la avvii.",
    startTrial: "Inizia la prova di 14 giorni",
    orChoose: "Oppure scegli direttamente un piano.",
    monthlyStart: "Attiva il mensile",
    monthlySwitch: "Passa al mensile",
    annualStart: "Attiva l’annuale",
    annualSwitch: "Passa all’annuale",
    oneTimeSwitch: "Passa a un solo pagamento",
    oneTimeStart: "Scegli un solo pagamento",
    cancelRenewal: "Cancella il rinnovo",
    cancelBody:
      "L’accesso resta fino alla fine del periodo già pagato, senza rimborsi parziali. Regole e messaggi restano salvati.",
    firstCharge: (date: string) =>
      `Se attivi oggi, il primo addebito è il ${date}: i giorni di prova che restano non li perdi.`,
    firstChargeNow: "L’addebito parte alla tua approvazione su Shopify.",
    oneTimeCharge:
      "Addebito unico alla tua approvazione su Shopify. I giorni di prova residui decadono.",
    oneTimeChargeNotStarted:
      "Addebito unico alla tua approvazione su Shopify. La prova gratuita non verrà avviata.",
    chooseNowHeading: "Scegli subito un piano",
    chooseHeading: "Come vuoi continuare",
    chooseBody:
      "Le funzioni sono le stesse per ogni piano. Shopify gestisce gli addebiti nella fattura dello store.",
    // §14.11: formulazione approvata. §7.2 vieta “a vita”, “per sempre”, “illimitato” e
    // “senza limiti di tempo”: si dice cosa il pagamento include, senza promettere una durata.
    oneTimeSettled:
      "Un solo pagamento per questo store, senza rinnovi. Include gli aggiornamenti dell’app e l’assistenza, senza costi aggiuntivi. Non c’è altro da scegliere.",
    complimentarySettled:
      "Il piano omaggio è attivo per questo store. Include gli aggiornamenti dell’app e l’assistenza, senza addebiti.",
    recommended: "Consigliato",
    generationLaunch: "A questo store sono riservati i prezzi di lancio.",
    generationStandard: "A questo store si applicano i prezzi standard.",
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
    labelsSaved: "Regole salvate. Le etichette richiedono attenzione.",
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
      required_when_company: "Obbligatoria quando il campo Azienda è compilato",
      required_when_companyHelp:
        "Richiede la PEC quando il campo Azienda dell’indirizzo di fatturazione è compilato. Negli altri casi la PEC resta facoltativa e viene validata se inserita.",
    },
    exceptionsHeading: "Quando si applicano",
    exceptions: [
      "Le regole si applicano alle consegne in Italia. Non si applicano se l’indirizzo di fatturazione è estero. Se manca il Paese di consegna, i campi obbligatori non mostrati da Shopify non bloccano l’ordine.",
    ],
    previewHeading: "Come funzionerà il checkout",
    simulator: {
      unknownCountry: "Non indicato",
      eyebrow: "CF Ready · simulazione checkout",
      heading: "Checkout di prova",
      privatePreview: "Anteprima interattiva",
      previewLanguage: "Lingua dell’anteprima",
      italian: "Italiano",
      english: "English",
      address2: "Interno",
      realCheckout: "Conferma il testo finale in un checkout reale.",
      orderContext: "Destinazione dell’ordine",
      customerData: "Dati fiscali del cliente",
      company: "Azienda",
      deliveryCountry: "Paese di consegna",
      billingCountry: "Paese di fatturazione",
      countries: { IT: "Italia", FR: "Francia", DE: "Germania" },
      scenarioLabel: "Prova uno scenario",
      scenarioHelp: "Scegli un esempio: il simulatore compila i campi e mostra il risultato.",
      scenarioPlaceholder: "Scegli un esempio",
      scenarios: {
        valid: "Dati validi",
        invalidTaxCode: "Codice Fiscale non valido",
        invalidPec: "PEC non valida",
        companyWithoutPec: "Azienda compilata senza PEC",
        empty: "Campi vuoti",
      },
      clear: "Svuota",
      continue: "Continua",
      outcomes: {
        notApplied: "Regole non applicate",
        noChecks: "Nessun controllo",
        editing: "Compilazione in corso",
        blocked: "Checkout bloccato",
        ready: "Checkout pronto",
      },
    },
    address2Heading: "Il campo “Interno” non va usato per il Codice Fiscale",
    address2Body:
      "Usi anche il campo “Interno” per il Codice Fiscale? Il cliente vedrà due campi. Seleziona la casella per vedere come rimuoverlo.",
    address2Checkbox: "Sì, uso “Interno” per il Codice Fiscale",
    address2Instructions:
      "Servono due passaggi. In Impostazioni → Checkout, sezione “Opzioni del modulo”, porta la seconda riga dell’indirizzo su “Facoltativo” o “Non includere”; poi, se ne hai cambiato l’etichetta, rimettila com’era da “Gestisci la lingua del checkout”, o da Impostazioni → Lingue, scheda “Checkout e sistema”, se la lingua è tradotta.",
    labels: {
      heading: "Campi del checkout",
      intro:
        "CF Ready mantiene coerenti i campi fiscali nativi e controlla che il campo Interno non li duplichi.",
      nativeHeading: "Campi nativi: Codice Fiscale e PEC",
      nativeBody:
        "Le regole stabiliscono il controllo. Le etichette spiegano al cliente cosa vede e possono essere gestite separatamente.",
      permissionsHeading: "Controlla le etichette Shopify",
      permissionsBody:
        "Concedi accesso soltanto a traduzioni, lingue e mercati. CF Ready non legge ordini, clienti o dati inseriti nel checkout.",
      requestPermissions: "Concedi i permessi",
      permissionsGranted: "Permessi concessi",
      enable: "Gestisci automaticamente le etichette supportate",
      enableGuided: "Mantieni attivo il controllo guidato delle etichette",
      enableConfirm:
        "Hai confrontato i testi attuali e quelli proposti? CF Ready scriverà soltanto gli slot indicati come automatici.",
      mode: "Modalità",
      modeValues: {
        off: "Disattivata",
        guided: "Guidata",
        automatic: "Automatica",
        partial: "Mista",
      },
      current: "Attuale",
      proposed: "Dopo il salvataggio",
      language: "Lingua",
      italian: "Italiano",
      english: "English",
      unchanged: "Mantieni il testo attuale",
      primary: "primaria",
      unpublished: "non pubblicata",
      automatic: "automatica",
      guided: "da verificare",
      marketOverride: "override di mercato",
      refresh: "Rileggi da Shopify",
      stop: "Ripristina e interrompi la gestione",
      lastSync: (value: string) => `Ultima sincronizzazione: ${value}`,
      neverSynced: "Non ancora sincronizzate",
      realCheckout:
        "L’API mostra i valori registrati. Verifica il testo reso con un checkout reale nella stessa lingua e nello stesso mercato.",
      addressHeading: "Controllo del campo Interno",
      addressRegular: "Variante ordinaria",
      addressOptional: "Variante facoltativa",
      addressBody:
        "CF Ready legge le due etichette di Interno. Shopify non espone se il campo è nascosto, facoltativo oppure obbligatorio.",
      addressStatus: {
        unknown: "Da verificare",
        expected: "Testi attesi",
        nonstandard: "Testi diversi da quelli attesi",
        fiscal_conflict: "Probabile duplicazione del Codice Fiscale",
      },
      restoreAddress: "Ripristina le traduzioni gestibili",
      restoreAddressConfirm:
        "Confermi il confronto? CF Ready ripristinerà soltanto le traduzioni e gli override mostrati, poi rileggerà Shopify.",
      keepAddress: "Mantieni questa personalizzazione",
      openCheckout: "Apri le impostazioni checkout",
      sourceManual:
        "Il testo sorgente della lingua primaria si ripristina dall’editor del contenuto checkout Shopify.",
      noSnapshot: "Concedi i permessi per confrontare i testi correnti dello store.",
    },
  },
  checkout: {
    nothing: "Nessun campo è configurato: il checkout resta invariato.",
    taxCodeRequired: "Il Codice Fiscale è obbligatorio e deve essere formalmente valido.",
    taxCodeOptional:
      "Il Codice Fiscale può restare vuoto; se inserito, deve essere formalmente valido.",
    pecRequired: "La PEC è obbligatoria e deve avere un formato email valido.",
    pecRequiredWhenCompany:
      "La PEC è obbligatoria quando è compilato il campo Azienda; negli altri casi resta facoltativa e viene validata se inserita.",
    pecOptional: "La PEC può restare vuota; se inserita, deve avere un formato email valido.",
    summaryBlocking: "Un cliente italiano non completa l’ordine senza i dati richiesti.",
    summaryConditional:
      "La PEC è obbligatoria per gli ordini italiani con il campo Azienda compilato.",
    summaryChecking:
      "I dati che i clienti italiani inseriscono vengono controllati, ma nessuno è obbligatorio.",
    disabled: "Il controllo non è attivo: queste regole non valgono ancora per i tuoi clienti.",
    lapsed:
      "Il controllo è attivo ma il piano non lo è: finché resta così il checkout non blocca nulla.",
  },
};
