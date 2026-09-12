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
    previewCurrentFieldLabel: "Etichetta attuale Shopify",
    previewProposedFieldLabel: "Etichetta proposta",
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
    labelsTitle: "Controlla le etichette del checkout",
    labelsBody:
      "Confronta le etichette di Codice Fiscale e PEC in italiano e inglese; il campo “Interno” ha un controllo separato.",
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
      "CF Ready controlla il Codice Fiscale e la PEC nei campi nativi del checkout italiano secondo le regole che scegli. Verifica la forma dei valori, senza confermare l’identità di chi li inserisce. Non emette fatture e non gestisce Partita IVA o Codice SDI.",
    groups: [
      {
        heading: "Regole e validazione",
        entries: [
          {
            q: "Che cosa fa CF Ready?",
            a: "CF Ready controlla il Codice Fiscale e la PEC nei campi fiscali nativi del checkout italiano di Shopify. Può lasciarli non gestiti, validarli quando sono facoltativi o renderli obbligatori, anche richiedendo la PEC soltanto quando il campo Azienda è compilato. Può inoltre allineare le etichette mostrate ai clienti. Non aggiunge campi al tema, non emette fatture e non gestisce Partita IVA o Codice SDI.",
          },
          {
            q: "In quali checkout si applicano le regole?",
            a: "Le regole si applicano quando almeno una consegna è in Italia e l’indirizzo di fatturazione è italiano o non ancora disponibile. Non si applicano quando l’indirizzo di fatturazione è estero o tutte le consegne indicate sono estere. Se Shopify non fornisce un Paese di consegna, CF Ready controlla soltanto i campi fiscali presenti nel checkout: un campo che Shopify non mostra non può bloccare l’ordine. Sei tu a decidere quando raccogliere questi dati in base alle esigenze della tua attività.",
          },
          {
            q: "Che cosa viene validato?",
            a: "Per il Codice Fiscale ordinario a 16 caratteri CF Ready controlla struttura, data, formato del codice catastale, omocodia e carattere di controllo. Per il codice provvisorio controlla le 11 cifre e la cifra di controllo. Per la PEC controlla soltanto che il valore abbia il formato di un indirizzo email. CF Ready non verifica l’identità del titolare, l’esistenza della casella o la sua iscrizione nei registri PEC.",
          },
          {
            q: "Posso richiedere la PEC soltanto quando il cliente compila Azienda?",
            a: "Sì. Se scegli “Obbligatoria quando il campo Azienda è compilato”, la PEC diventa obbligatoria quando il cliente inserisce un valore nel campo Azienda dell’indirizzo di fatturazione. Negli altri casi resta facoltativa, ma viene comunque validata quando è inserita. Il campo Azienda non determina automaticamente la natura fiscale dell’ordine.",
          },
          {
            q: "Quando compaiono gli errori nel checkout?",
            a: "Un valore compilato ma non valido può essere segnalato mentre il cliente procede nel checkout. Un campo obbligatorio vuoto può essere segnalato prima quando Shopify ha già definito la consegna; il tentativo di completare l’ordine esegue comunque il controllo finale. Puoi personalizzare i messaggi dalla pagina “Messaggi al cliente”.",
          },
        ],
      },
      {
        heading: "Etichette e campo Interno",
        entries: [
          {
            q: "Come devo gestire il campo “Interno”?",
            a: "“Interno” è la seconda riga dell’indirizzo e non deve essere usato per raccogliere il Codice Fiscale. In “Regole checkout” apri “Campo Interno” e indica se in Shopify il campo è obbligatorio, facoltativo o non mostrato. Quando è visibile, CF Ready può controllarne il testo e ripristinare le traduzioni supportate, ma Shopify non comunica automaticamente all’app quale configurazione è attiva.",
          },
          {
            q: "Come vengono gestite le etichette del checkout?",
            a: "Dopo che concedi i permessi, CF Ready confronta le etichette di Codice Fiscale e PEC in italiano e inglese. Aggiorna automaticamente soltanto i testi che Shopify consente all’app di modificare; per gli altri mostra una procedura manuale. Prima di scrivere rilegge i valori correnti, così una modifica effettuata con Translate & Adapt o con un’altra app non viene sovrascritta senza avvisarti.",
          },
          {
            q: "Come completo la verifica manuale delle etichette?",
            a: "In “Regole checkout”, scegli la lingua e apri il caso che richiede attenzione. Segui i passaggi mostrati per controllare il checkout reale e, se necessario, modificare i testi nell’editor Shopify. Dopo aver salvato in Shopify, torna in CF Ready e premi “Rileggi i campi da Shopify”. Quando i valori coincidono, conferma la verifica manuale. “Ultima rilettura riuscita da Shopify” indica quando CF Ready ha riletto i campi; “Ultima conferma manuale nel checkout” indica quando hai confermato il controllo nel checkout reale.",
          },
          {
            q: "Perché Codice Fiscale o PEC hanno ancora un’etichetta diversa?",
            a: "Controlla di aver selezionato la lingua corretta e apri tutti i casi indicati in “Testi del checkout”. Un mercato può ereditare il testo generale oppure avere una personalizzazione propria. Dopo ogni modifica in Shopify premi “Rileggi i campi da Shopify” e verifica infine il checkout reale per la lingua e il mercato interessati.",
          },
          {
            q: "Cosa succede se interrompo la gestione o disinstallo CF Ready?",
            a: "Quando scegli “Ripristina e interrompi la gestione”, CF Ready ripristina soltanto le traduzioni automatiche ancora uguali alla sua ultima scrittura. Se trova una modifica successiva effettuata da te o da un’altra app, la conserva e ti chiede di risolvere il conflitto prima di interrompere la gestione. Prima di disinstallare CF Ready, esegui il ripristino e controlla le lingue e i mercati pubblicati: Shopify può conservare le traduzioni dopo la rimozione dell’app.",
          },
        ],
      },
      {
        heading: "Piano, privacy e assistenza",
        entries: [
          {
            q: "Come funzionano la prova e i pagamenti?",
            a: "La prova gratuita dura 14 giorni, parte soltanto quando la avvii ed è disponibile una sola volta per negozio. Non richiede un metodo di pagamento. Se durante la prova scegli il piano mensile o annuale, i giorni residui vengono aggiunti come giorni di prova della sottoscrizione Shopify. Se scegli il pagamento unico, l’addebito è immediato e rinunci ai giorni di prova rimasti.",
          },
          {
            q: "Quali ordini e canali non sono coperti?",
            a: "CF Ready opera nel checkout online di Shopify, compresi i checkout accelerati supportati da Shopify. Non interviene nel POS, negli ordini creati e completati direttamente dal pannello di amministrazione né nelle generazioni successive degli ordini ricorrenti in abbonamento. La validazione è formale e non consulta registri anagrafici o fiscali.",
          },
          {
            q: "Quali dati conserva CF Ready?",
            a: "CF Ready non riceve né conserva Codici Fiscali, indirizzi PEC, ordini o dati dei clienti. Conserva la configurazione del negozio, lo stato della prova e del piano, eventi tecnici e i testi delle etichette necessari alla sincronizzazione e al ripristino. Shopify può conservare i valori inseriti dai clienti come parte dell’ordine.",
          },
          {
            q: "Cosa faccio se qualcosa non torna?",
            a: "Usa “Aggiorna e verifica” nella sezione “Il controllo non compare?” di questa pagina per controllare regole, attivazione e piano. Usa “Rileggi i campi da Shopify” in Regole checkout per aggiornare le etichette. Verifica poi un checkout reale nella lingua e nel mercato interessati. Se il problema resta, premi “Copia diagnostica” nel box Assistenza e incolla il risultato nella richiesta, senza aggiungere dati dei clienti.",
          },
        ],
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
      labelsAfterSave: "Etichette mostrate dopo il salvataggio delle regole",
      italian: "Italiano",
      english: "English",
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
    labels: {
      heading: "Etichette del checkout (impostazioni avanzate)",
      nativeHeading: "Testi del checkout",
      permissionsHeading: "Controlla le etichette Shopify",
      permissionsBody:
        "Concedi accesso soltanto a traduzioni, lingue e mercati. CF Ready non legge ordini, clienti o dati inseriti nel checkout.",
      requestPermissions: "Concedi i permessi",
      statusManagedByShopify: "Gestito da Shopify",
      statusManualRequired: "Verifica manuale richiesta",
      nativeSummaryNeedsAccess: "Concedi l’accesso per controllare i testi del checkout.",
      nativeSummaryNeedsReview: (count: number) =>
        `${count === 1 ? "Un checkout richiede" : `${count} checkout richiedono`} una verifica.`,
      nativeSummaryNeedsChoice: "Scegli se CF Ready deve gestire questi testi.",
      nativeSummaryError: "CF Ready non ha completato l’ultimo controllo.",
      nativeSummaryKept: "Hai scelto di mantenere i testi attuali.",
      nativeSummaryReady: "I testi sono coerenti con le regole salvate.",
      enable: "Gestisci automaticamente le etichette supportate da Shopify",
      enableGuided: "Mantieni attivo il controllo guidato delle etichette",
      enableConfirm: "Ho confrontato i campi attuali con quelli proposti",
      enableConfirmHeading: "Conferma gestione automatica",
      enableConfirmBody: "CF Ready aggiornerà questi campi tramite Shopify:",
      enableConfirmAction: "Conferma e salva",
      mode: "Modalità",
      modeValues: {
        off: "Disattivata",
        guided: "Guidata",
        automatic: "Automatica",
        partial: "Mista",
      },
      current: "Campo attuale",
      proposed: "Campo dopo il salvataggio",
      language: "Lingua",
      italian: "Italiano",
      english: "Inglese",
      unchanged: "Mantieni il testo attuale",
      noChange: "Nessuna modifica",
      generalText: "Predefinito per questa lingua",
      marketException: (market: string) => `Personalizzazione per il mercato ${market}`,
      unknownMarket: "mercato non identificato",
      allMarketsSame: "Tutti i mercati usano questo testo",
      marketCheckIncluded: (markets: string[]) =>
        `Controlla anche il checkout per ${markets.join(", ")}: Shopify non ne distingue con certezza la configurazione.`,
      primary: "primaria",
      unpublished: "non pubblicata",
      marketAmbiguous:
        "Shopify segnala almeno un mercato con una configurazione ereditata o non univoca. CF Ready accorpa i valori uguali e indica quali checkout aggiuntivi controllare.",
      refresh: "Rileggi i campi da Shopify",
      refreshComplete: "Campi riletti da Shopify.",
      stop: "Ripristina e interrompi la gestione",
      lastSync: (value: string) => `Ultima rilettura riuscita da Shopify: ${value}`,
      neverSynced: "Nessuna rilettura riuscita da Shopify",
      operationalSummary: (automatic: number, manual: number) =>
        `${automatic} ${automatic === 1 ? "etichetta gestita" : "etichette gestite"} da Shopify · ${manual} ${manual === 1 ? "verifica manuale richiesta" : "verifiche manuali richieste"}`,
      manualHeading: "Come completare la verifica manuale",
      manualSteps: (
        language: string,
        market: string | null,
        primary: boolean,
        verificationMarkets: string[],
      ) => [
        market
          ? `Apri il negozio e seleziona ${market} come paese o area geografica e ${language} come lingua.`
          : `Apri il negozio nel mercato predefinito e seleziona ${language} come lingua.`,
        ...(verificationMarkets.length > 0
          ? [
              `Ripeti il controllo selezionando ${verificationMarkets.join(", ")} come paese o area geografica e ${language} come lingua.`,
            ]
          : []),
        "Per ogni caso indicato, aggiungi un prodotto al carrello e raggiungi il checkout.",
        "Confronta le etichette di Codice Fiscale e PEC con “Campo dopo il salvataggio” mostrato qui.",
        "Se differiscono, premi “Apri l’editor dei testi del checkout”. In Shopify, nella sezione Lingua del check-out, premi “Modifica contenuto del check-out”.",
        ...(primary && !market
          ? [
              "Nell’editor premi “Cerca e filtra i risultati”. Per Codice Fiscale cerca il valore indicato come “Campo attuale” e modifica soltanto Checkout localized fields additional information → Tax credential it; ignora B2B locations → Tax id.",
              "Per PEC cerca “PEC”, scorri fino a Checkout localized fields additional information e modifica Tax email it. Inserisci per entrambi il relativo “Campo dopo il salvataggio”, poi premi “Salva”.",
              ...(verificationMarkets.length > 0
                ? [
                    `Se un’etichetta differisce soltanto in ${verificationMarkets.join(", ")}, premi “Traduci” nell’editor, apri il selettore “Traduzione in…”, scegli “Adatta un mercato” → ${verificationMarkets.join(", ")} → ${language}, quindi apri Checkout and system. In “Filtra campi” cerca Tax credential it o Tax email it, inserisci il relativo “Campo dopo il salvataggio” e salva.`,
                  ]
                : []),
            ]
          : [
              "Nell’editor premi “Traduci”. Se Shopify Translate & Adapt mostra la guida iniziale, premi “Successivo” fino all’ultima schermata, poi “Chiudi”.",
              market
                ? `Apri il selettore “Traduzione in…” e scegli “Adatta un mercato” → ${market} → ${language}.`
                : `Controlla che in alto sia selezionato “Traduzione in ${language}”. Se non lo è, apri il selettore “Traduzione in…” e scegli ${language} sotto “Traduci per tutti i mercati”.`,
              "Apri Checkout and system. In “Filtra campi” cerca Tax credential it e Tax email it, inserisci per ciascuno il relativo “Campo dopo il salvataggio”, poi premi “Salva”.",
            ]),
        "Torna in CF Ready e premi “Rileggi i campi da Shopify”. Quando i due valori coincidono, il pulsante di conferma si attiva.",
      ],
      manualMismatch:
        "Shopify restituisce ancora un testo diverso. Modificalo e salvalo con la procedura qui sopra, quindi premi “Rileggi i campi da Shopify”.",
      openStorefront: "Apri il negozio",
      openCheckoutContentEditor: "Apri l’editor dei testi del checkout",
      confirmGuided: "Conferma verifica manuale",
      lastManualVerification: (value: string) => `Ultima conferma manuale nel checkout: ${value}`,
      checkoutCheckRequired: "verifica manuale nel checkout richiesta",
      keepNative: "Mantieni le mie etichette",
      keepNativeAccepted: "Scelta registrata: mantieni le etichette attuali",
      addressHeading: "Campo Interno",
      addressModeLabel: "Configurazione del campo Interno",
      addressModePlaceholder: "Seleziona la configurazione attiva",
      addressModeHelp:
        "Indica l’opzione attiva in Impostazioni → Checkout. Shopify non la espone automaticamente a CF Ready.",
      addressModeSummary: "Indica se il campo Interno è obbligatorio, facoltativo o non mostrato.",
      addressRequired: "Obbligatorio",
      addressOptional: "Facoltativo",
      addressHidden: "Non mostrato",
      addressHiddenSummary: "Il campo Interno non è mostrato nel checkout.",
      addressHiddenHelp: "Non ci sono etichette da controllare finché il campo resta nascosto.",
      addressStatus: {
        unknown: "Da controllare",
        expected: "Nessuna etichetta fiscale rilevata",
        nonstandard: "Testo personalizzato",
        fiscal_conflict: "Possibile doppione",
      },
      addressSummary: {
        unknown: "Concedi l’accesso per controllare il testo del campo Interno.",
        expected: "Nel campo Interno non è stata rilevata un’etichetta fiscale.",
        nonstandard: "Il campo Interno usa un testo personalizzato che non sembra fiscale.",
        fiscal_conflict:
          "Il campo Interno è etichettato come Codice Fiscale e può creare un doppione.",
      },
      addressLimit:
        "CF Ready controlla il testo. Visibilità e obbligatorietà restano nelle impostazioni checkout di Shopify.",
      notAvailable: "Non disponibile",
      standardLabel: "Testo Shopify",
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
