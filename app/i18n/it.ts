export const it = {
  nav: {
    home: "Home",
    rules: "Regole checkout",
    messages: "Messaggi al cliente",
    guide: "Guida e FAQ",
  },
  errorPage: {
    reload: "Ricarica la pagina",
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
      "Shopify restituisce più testi per la stessa etichetta, quindi CF Ready non ha modificato nulla. Controlla le etichette nell’editor dei testi del checkout; se il problema resta, scrivici.",
    checkout_labels_locale_missing:
      "Italiano o inglese non sono disponibili nello store. Pubblica la lingua oppure continua con quelle disponibili.",
    checkout_labels_conflict:
      "Un’etichetta è cambiata dopo l’ultima lettura. Premi “Rileggi i campi da Shopify” prima di decidere quale testo mantenere.",
    checkout_labels_confirmation_required:
      "Conferma il confronto prima della prima scrittura automatica delle etichette.",
    checkout_labels_confirmation_pending:
      "Le regole sono salvate. Aggiorna in Shopify le etichette indicate, poi confermale in CF Ready.",
    checkout_labels_stale_digest:
      "Shopify ha aggiornato il contenuto durante il salvataggio. Premi “Rileggi i campi da Shopify” e riprova.",
    checkout_labels_partial_sync:
      "Le regole sono salvate, ma alcune etichette richiedono un nuovo tentativo.",
    checkout_labels_readback_failed:
      "Shopify non ha confermato tutte le etichette. Premi “Rileggi i campi da Shopify” prima di modificarle ancora.",
    address2_restore_conflict:
      "Il testo del campo “Interno” è cambiato dopo il confronto. Premi “Rileggi i campi da Shopify” prima del ripristino.",
    validation_limit_reached:
      "Questo store ha già il numero massimo di controlli al checkout consentito da Shopify. Le tue regole restano salvate. Disattiva il controllo di un’altra app da Impostazioni → Checkout, poi riprova.",
    entitlement_required: "Per attivare il controllo, avvia la prova o scegli un piano.",
    config_conflict:
      "La configurazione è cambiata in un’altra finestra. Confronta i valori e scegli se riapplicare le tue modifiche o usare la configurazione attuale.",
    duplicate_validations:
      "Shopify restituisce più controlli CF Ready, quindi li abbiamo disattivati senza eliminarne nessuno. Scrivici e ti aiutiamo a scegliere quale tenere.",
    duplicate_validations_active:
      "Shopify restituisce più controlli CF Ready e non ha confermato la loro disattivazione. Riprova la riparazione.",
    billing_read_failed:
      "Le informazioni sul piano non sono aggiornate. Riapri la pagina fra qualche minuto.",
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
    validationHeading: "Validazione nel checkout",
    titleLapsed: "Validazione attiva, piano non attivo",
    noEntitlement:
      "Senza un piano attivo le regole non valgono nel checkout. Regole e messaggi restano salvati e tornano validi con il pagamento.",
    syncNeeded:
      "Lo stato mostrato qui potrebbe non coincidere con Shopify. Riapri la pagina fra qualche minuto.",
    verifying: "Verifica in corso…",
    verified: "Stato confermato da Shopify",
    verificationUnavailable: "Stato Shopify da verificare",
    verificationFailed: "Non è stato possibile verificare lo stato con Shopify.",
    verificationRetry: "Riprova",
    repair: "Ripara configurazione",
    messagesLabel: "Messaggi al cliente",
    messagesDefault: "Predefiniti",
    messagesCustom: "Personalizzati",
    pecRequiredForCompanies: "Obbligatoria per aziende",
    editRules: "Modifica regole",
    activate: "Attiva nel checkout",
    deactivate: "Disattiva nel checkout",
    activated: "Validazione attivata nel checkout.",
    deactivated: "Validazione disattivata.",
    openOrders: "Apri gli ordini",
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
    english: "Inglese",
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
    appears: "Può comparire",
    appearsNot: "Non compare",
    fieldNames: { taxCode: "Codice Fiscale", pec: "PEC" },
    shortLabels: {
      taxCodeRequired: "Obbligatorio",
      taxCodeInvalid: "Non valido",
      pecRequired: "Obbligatoria",
      pecInvalid: "Non valida",
    },
    languageSelector: "Lingua dei messaggi",
    previewHeading: "Anteprima nel checkout",
    previewContext: "Quando il cliente prova a completare l’ordine",
    previewErrorHeading: "Ordine non completato",
    previewSelected: "Messaggio selezionato",
    previewHint: "L’anteprima mostra il messaggio che stai modificando.",
    previewNotShown: "Con le regole attuali questo messaggio non compare nel checkout.",
    editorHeading: "Messaggi di errore",
    previewFieldLabel: "Etichetta del campo",
    previewCurrentFieldLabel: "Etichetta attuale Shopify",
    previewProposedFieldLabel: "Etichetta proposta",
    labelsNote:
      "Personalizza gli errori di Codice Fiscale e PEC. Per i nomi dei campi, apri Regole checkout.",
    manageLabels: "Apri Regole checkout",
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
      "CF Ready controlla Codice Fiscale e PEC nei campi nativi del checkout Shopify, senza modificare il tema.",
    step1Limits: [
      "Verifica solo il formato dei dati: non conferma l’identità del cliente né che un indirizzo sia davvero una PEC.",
      "Le regole si applicano alle consegne in Italia. Non si applicano se l’indirizzo di fatturazione è estero. Se manca il Paese di consegna, i campi obbligatori non mostrati da Shopify non bloccano l’ordine.",
    ],
    step2Heading: "Scegli cosa controllare",
    step2Body: "Puoi cambiare queste scelte quando vuoi da Regole checkout.",
    labelsPreviewHeading: "Etichette proposte in italiano e inglese",
    labelsPermissionsOptional:
      "Puoi concedere ora i permessi per confrontare le etichette con Shopify oppure continuare senza attivarli.",
    step3Heading: "Anteprima delle regole",
    labelsMixedDescription:
      "La modalità Mista supporta aggiornamenti automatici e verifiche manuali. “Regole checkout” mostra eventuali verifiche ancora da completare.",
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
    step4TrialActive: "La prova è attiva.",
    step4PlanActive: "Il piano è attivo.",
    reviewStep4Body: "Il controllo è già attivo nel checkout.",
    activate: "Attiva nel checkout",
    finishWithout: "Torna alla Home senza attivare",
    goHome: "Torna alla Home",
    doneHeading: "Configurazione completata",
    doneBody:
      "Le regole sono salvate. Puoi cambiarle quando vuoi, e questa procedura resta disponibile dalla Guida.",
    reopen: "Rivedi la configurazione iniziale",
  },
  support: {
    heading: "Assistenza",
    body: "Ti risponde direttamente chi sviluppa l’app. Il collegamento apre il tuo programma di posta con un messaggio già compilato.",
    privacyNote:
      "Il messaggio contiene dominio dello store, versione, lingua e stato tecnico dell’app: di solito basta questo per capire il problema.",
    subject: "Assistenza CF Ready",
    chooseCategory: "Scegli l’argomento",
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
      body: "Rilegge da Shopify regole, attivazione e piano. Per vedere il comportamento reale, prova poi un ordine nel checkout.",
      refresh: "Aggiorna e verifica",
      failed:
        "Non è stato possibile leggere lo stato da Shopify. Riprova fra poco con “Aggiorna e verifica”.",
      enabled: "La validazione è attiva su Shopify.",
      disabled: "La validazione è disattivata o assente. Apri la Home per gestire l’attivazione.",
      configured: "Almeno un campo è configurato per essere controllato.",
      unconfigured: "Entrambi i campi sono non gestiti: scegli le regole da applicare.",
      notChecked:
        "Diagnostica non ancora eseguita in questa sessione. Questo non indica che il controllo sia disattivato.",
      openPlan: "Verifica il piano",
      lastSync: "Ultima verifica di regole e attivazione",
      unknown: "Non disponibile",
      manualHeading: "Da verificare nel checkout",
      manualBody:
        "Conferma Paese di fatturazione e consegna, presenza dei campi fiscali nativi e momento in cui completi il checkout. Il campo “Interno” non è il campo Codice Fiscale. Queste condizioni richiedono una verifica manuale.",
      simulate: "Riproduci il caso nel simulatore",
      entitled: "Prova o piano attivi.",
      notEntitled: "Nessuna prova o piano attivi.",
      labelsStatus: {
        synced: "Etichette del checkout aggiornate.",
        action_required: "Le etichette del checkout richiedono attenzione.",
        scope_required: "Concedi i permessi per controllare le etichette.",
        unknown: "Etichette del checkout non ancora verificate.",
      },
      address2Decision: {
        accepted: "Hai scelto di mantenere la personalizzazione.",
        manual_restore_required: "Ripristino manuale richiesto.",
      },
    },
    complimentaryBillingAnswer:
      "Il tuo negozio ha un piano omaggio permanente: non ci sono prove né pagamenti da gestire.",
    heading: "Guida e FAQ",
    faqHeading: "Domande frequenti",
    expandAll: "Espandi tutte",
    collapseAll: "Comprimi tutte",
    asideHeading: "Cosa fa e cosa non fa CF Ready",
    asideLinks: "Dove si configura",
    asideBody:
      "CF Ready controlla il Codice Fiscale e la PEC nei campi nativi del checkout italiano secondo le regole che scegli. Controlla la forma dei valori, non l’identità di chi li inserisce. Non emette fatture e non gestisce Partita IVA o Codice SDI.",
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
            a: "Le regole si applicano quando almeno una consegna è in Italia e l’indirizzo di fatturazione è italiano o non ancora disponibile. Non si applicano quando l’indirizzo di fatturazione è estero o tutte le consegne indicate sono estere. Se Shopify non fornisce un Paese di consegna, CF Ready controlla soltanto i campi fiscali presenti nel checkout: un campo che Shopify non mostra non può bloccare l’ordine.",
          },
          {
            q: "Che cosa viene validato?",
            a: "Per il Codice Fiscale ordinario a 16 caratteri CF Ready controlla struttura, data, formato del codice catastale, omocodia e carattere di controllo. Per il codice provvisorio controlla le 11 cifre e la cifra di controllo. Per la PEC controlla soltanto che il valore abbia il formato di un indirizzo email. CF Ready non verifica l’identità del titolare, l’esistenza della casella o la sua iscrizione nei registri PEC.",
          },
          {
            q: "Posso richiedere la PEC soltanto quando il cliente compila Azienda?",
            a: "Sì. Se scegli “Obbligatoria quando il campo Azienda è compilato”, la PEC diventa obbligatoria quando il cliente inserisce un valore nel campo Azienda dell’indirizzo di fatturazione. Negli altri casi resta facoltativa, ma viene comunque validata quando è inserita.",
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
            a: "In “Regole checkout”, scegli la lingua e apri il caso che richiede attenzione. Segui i passaggi mostrati per controllare il checkout reale e, se necessario, modificare i testi nell’editor Shopify. Dopo aver salvato in Shopify, torna in CF Ready e premi “Rileggi i campi da Shopify”. Quando i valori coincidono, conferma la verifica manuale. “Ultima lettura delle etichette da Shopify” indica quando CF Ready ha riletto i campi; “Ultima conferma manuale nel checkout” indica quando hai confermato il controllo nel checkout reale.",
          },
          {
            q: "Perché Codice Fiscale o PEC hanno ancora un’etichetta diversa?",
            a: "Controlla di aver selezionato la lingua corretta e apri tutti i casi indicati in “Testi del checkout”. Un mercato può ereditare il testo generale oppure avere una personalizzazione propria. Dopo ogni modifica in Shopify premi “Rileggi i campi da Shopify” e verifica infine il checkout reale per la lingua e il mercato interessati.",
          },
          {
            q: "Cosa succede se interrompo la gestione o disinstallo CF Ready?",
            a: "Se interrompi la gestione, CF Ready smette di controllare e aggiornare le etichette del checkout, mentre le regole di validazione di Codice Fiscale e PEC restano attive. Prima di interrompersi, ripristina le traduzioni automatiche ancora uguali alla sua ultima scrittura. Se trova una modifica successiva effettuata da te o da un’altra app, la conserva e ti chiede di risolvere il conflitto. Se disinstalli CF Ready, anche la validazione smette di funzionare e l’app non può più gestire o ripristinare le etichette. Shopify può conservare le traduzioni già presenti: prima di disinstallare, esegui “Ripristina e interrompi la gestione” e controlla le lingue e i mercati pubblicati.",
          },
        ],
      },
      {
        heading: "Piano, privacy e assistenza",
        entries: [
          {
            id: "billing",
            q: "Come funzionano la prova e i pagamenti?",
            a: "La prova gratuita dura 14 giorni, parte soltanto quando la avvii ed è disponibile una sola volta per negozio. Non richiede un metodo di pagamento. Se durante la prova scegli il piano mensile o annuale, i giorni residui vengono aggiunti come giorni di prova della sottoscrizione Shopify. Se scegli il pagamento unico, l’addebito è immediato e rinunci ai giorni di prova rimasti.",
          },
          {
            q: "Quali ordini e canali non sono coperti?",
            a: "CF Ready opera nel checkout online di Shopify, compresi i checkout accelerati supportati da Shopify. Non interviene nel POS, negli ordini creati e completati direttamente dal pannello di amministrazione né nelle generazioni successive degli ordini ricorrenti in abbonamento.",
          },
          {
            q: "Quali dati conserva CF Ready?",
            a: "CF Ready non riceve né conserva Codici Fiscali, indirizzi PEC, ordini o dati dei clienti. Conserva la configurazione del negozio, lo stato della prova e del piano, eventi tecnici e i testi delle etichette necessari alla sincronizzazione e al ripristino. Shopify può conservare i valori inseriti dai clienti come parte dell’ordine.",
          },
          {
            q: "Cosa faccio se qualcosa non torna?",
            a: "Usa “Aggiorna e verifica” nella sezione “Il controllo non compare?” di questa pagina per controllare regole, attivazione e piano. Usa “Rileggi i campi da Shopify” in Regole checkout per aggiornare le etichette. Verifica poi un checkout reale nella lingua e nel mercato interessati. Se il problema resta, premi “Copia diagnostica” nel box Assistenza e incolla il risultato nella richiesta.",
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
      `La prova finisce il ${date}. Scegli un piano per continuare a controllare Codice Fiscale e PEC nel checkout; regole e messaggi restano salvati.`,
    trialLastDay: (date: string) =>
      `Oggi è l’ultimo giorno di prova: finisce il ${date}. Scegli un piano per mantenere attive le regole da domani; regole e messaggi restano salvati.`,
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
      "L’accesso resta fino alla fine del periodo corrente, senza credito per i giorni non usati. Regole e messaggi restano salvati.",
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
    oneTimeSettled: "Include gli aggiornamenti dell’app e l’assistenza, senza costi aggiuntivi.",
    complimentarySettled: "Include gli aggiornamenti dell’app e l’assistenza, senza addebiti.",
    includedHeading: "Cosa include il piano",
    recommended: "Consigliato",
    generationLaunch: "A questo store sono riservati i prezzi di lancio.",
    generationStandard: "A questo store si applicano i prezzi standard.",
    nextCharge: (date: string) => `Prossimo addebito il ${date}.`,
    periodEnds: (date: string) => `Il periodo contrattuale corrente finisce il ${date}.`,
    lastAttempt:
      "Non è stato possibile leggere lo stato del piano. Riapri la pagina fra qualche minuto.",
    endingAlready: "Il rinnovo è cancellato: l’accesso resta fino alla fine del periodo corrente.",
    monthlyName: "Mensile",
    annualName: "Annuale",
    oneTimeName: "Un solo pagamento",
    creditExpected:
      "Shopify applicherà separatamente l’eventuale credito per il periodo non usato.",
    creditProcessing: "Stiamo verificando l’eventuale credito. Non devi fare nulla.",
    creditComplete: "Shopify ha registrato il credito.",
  },
  rules: {
    heading: "Regole checkout",
    saved: "Regole salvate.",
    labelsSaved: "Regole salvate. Le etichette richiedono attenzione.",
    showLabels: "Mostra le etichette",
    labelsConflict:
      "Le etichette su Shopify sono cambiate dopo l’ultima lettura. CF Ready le ha rilette e le tue modifiche sono ancora qui: premi di nuovo Salva.",
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
      heading: "Simulatore del checkout",
      previewLanguage: "Lingua dell’anteprima",
      labelsAfterSave:
        "Le etichette seguono le regole selezionate qui; nel checkout cambiano dopo il salvataggio.",
      italian: "Italiano",
      english: "Inglese",
      orderContext: "Destinazione dell’ordine",
      customerData: "Dati fiscali del cliente",
      company: "Azienda",
      deliveryCountry: "Paese di consegna",
      billingCountry: "Paese di fatturazione",
      countries: { IT: "Italia", FR: "Francia", DE: "Germania" },
      advanced: "Opzioni avanzate",
      checkoutStep: "Fase del checkout",
      interaction: "Compilazione",
      completion: "Completamento ordine",
      shippingSelected: "Metodo di spedizione selezionato",
      mixedDelivery: "Aggiungi una consegna estera",
      taxCodePresent: "Shopify mostra il campo Codice Fiscale",
      pecPresent: "Shopify mostra il campo PEC",
      missingRequiredField: (label: string) =>
        `Il campo “${label}” è obbligatorio, ma Shopify non lo mostra in questo scenario. Con una consegna italiana, l’ordine viene bloccato al completamento.`,
      showMissingFields:
        "Per provare la compilazione, apri “Opzioni avanzate” e seleziona “Shopify mostra il campo” per il campo mancante.",
      scenarioLabel: "Prova uno scenario",
      scenarioHelp: "Scegli uno scenario: il simulatore compila i campi e mostra il risultato.",
      scenarioPlaceholder: "Scegli uno scenario",
      scenarios: {
        valid: "Dati validi",
        invalidTaxCode: "Codice Fiscale non valido",
        invalidPec: "PEC non valida",
        numericTaxCode: "Codice provvisorio numerico valido",
        omocodiaTaxCode: "Codice Fiscale con omocodia valido",
        companyWithoutPec: "Azienda compilata senza PEC",
        empty: "Campi vuoti",
      },
      clear: "Svuota",
      continue: "Continua",
      diagnostics: {
        pec: {
          valid: "Il formato email è valido.",
          email_format: "Controlla @, parte locale, dominio e spazi.",
        },
      },
      outcomes: {
        notApplied: "Regole non applicate",
        noChecks: "Nessun controllo",
        editing: "Compilazione in corso",
        blocked: "Checkout bloccato",
        ready: "Checkout pronto",
      },
    },
    labels: {
      heading: "Etichette del checkout",
      loading: "Rilettura delle etichette Shopify in corso…",
      nativeHeading: "Testi del checkout",
      permissionsHeading: "Controlla le etichette Shopify",
      permissionsBody:
        "Per confrontare le etichette, CF Ready ha bisogno di accedere a traduzioni, lingue e mercati.",
      requestPermissions: "Concedi i permessi",
      statusUpToDate: "Aggiornati",
      statusKept: "Gestiti da te",
      statusManualRequired: "Verifica manuale richiesta",
      statusError: "Controllo non completato",
      nativeSummaryNeedsAccess: "Concedi l’accesso per controllare i testi del checkout.",
      nativeSummaryNeedsReview: (count: number, languages: string[]) =>
        `${count === 1 ? "Un checkout" : `${count} checkout`} in ${languages.join(" e ")} ${count === 1 ? "richiede" : "richiedono"} una verifica.`,
      languageNames: { it: "italiano", en: "inglese" },
      nativeSummaryNeedsChoice: "Scegli se CF Ready deve gestire questi testi.",
      nativeSummaryError: "CF Ready non ha completato l’ultimo controllo.",
      nativeSummaryKept: "Hai scelto di mantenere i testi attuali.",
      nativeSummaryReady: "I testi sono coerenti con le regole salvate.",
      enable: "Gestisci automaticamente le etichette supportate da Shopify",
      enableGuided: "Mantieni attivo il controllo guidato delle etichette",
      disableWarning:
        "Salvando, CF Ready ripristina le etichette che aveva scritto e smette di aggiornarle. Le etichette modificate da te o da altre app restano come sono.",
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
      language: "Lingua delle etichette",
      italian: "Italiano",
      english: "Inglese",
      unchanged: "Mantieni il testo attuale",
      noChange: "Nessuna modifica",
      generalText: "Predefinito per questa lingua",
      marketException: (market: string) => `Personalizzazione per il mercato ${market}`,
      unknownMarket: "mercato non identificato",
      allMarketsSame: "Tutti i mercati usano questo testo.",
      marketCheckIncluded: (markets: string[]) =>
        `Controlla anche il checkout per ${markets.join(", ")}: Shopify non ne distingue con certezza la configurazione.`,
      primary: "Lingua primaria.",
      unpublished: "Lingua non pubblicata.",
      marketAmbiguous:
        "Shopify segnala almeno un mercato con una configurazione ereditata o non univoca. CF Ready accorpa i valori uguali e indica quali checkout aggiuntivi controllare.",
      refresh: "Rileggi i campi da Shopify",
      refreshComplete: "Campi riletti da Shopify.",
      stop: "Ripristina e interrompi la gestione",
      lastSync: (value: string) => `Ultima lettura delle etichette da Shopify: ${value}`,
      neverSynced: "Nessuna rilettura riuscita da Shopify",
      operationalSummary: (automatic: number, manual: number) =>
        `${automatic} ${automatic === 1 ? "etichetta aggiornata" : "etichette aggiornate"} automaticamente. ${manual} ${manual === 1 ? "verifica manuale richiesta" : "verifiche manuali richieste"}.`,
      manualHeading: "Come completare la verifica manuale",
      manualSteps: (
        language: string,
        market: string | null,
        primary: boolean,
        verificationMarkets: string[],
      ) => [
        market
          ? `Apri il negozio e nel selettore “Paese/area geografica” scegli un paese disponibile del mercato ${market}. Seleziona ${language} come lingua.`
          : `Apri il negozio nel mercato predefinito e seleziona ${language} come lingua.`,
        ...(verificationMarkets.length > 0
          ? [
              `Ripeti il controllo per ${verificationMarkets.join(", ")}: nel selettore “Paese/area geografica” scegli un paese disponibile di ciascun mercato e mantieni ${language} come lingua.`,
            ]
          : []),
        "Per ogni caso indicato, aggiungi un prodotto al carrello e raggiungi il checkout. Imposta Italia come paese di consegna e seleziona un indirizzo italiano riconosciuto da Shopify: Codice Fiscale e PEC compaiono dopo che l’indirizzo è stato acquisito.",
        "Confronta le etichette di Codice Fiscale e PEC con “Campo dopo il salvataggio” mostrato qui.",
        "Se differiscono, premi “Apri l’editor dei testi del checkout”. In Shopify, nella sezione “Lingua del check-out”, premi “Modifica contenuto del check-out”.",
        ...(primary && !market
          ? [
              "Nell’editor premi “Cerca e filtra i risultati”. Per Codice Fiscale cerca il valore indicato come “Campo attuale” e modifica soltanto “Checkout localized fields additional information → Tax credential it”; ignora “B2B locations → Tax id”.",
              "Per PEC cerca “PEC”, scorri fino a “Checkout localized fields additional information” e modifica “Tax email it”. Inserisci per entrambi il relativo “Campo dopo il salvataggio”, poi premi “Salva”.",
              ...(verificationMarkets.length > 0
                ? [
                    `Se un’etichetta differisce soltanto in ${verificationMarkets.join(", ")}, premi “Traduci” nell’editor, apri il selettore “Traduzione in…” e scegli “Adatta un mercato”. Apri uno alla volta ${verificationMarkets.join(", ")} con lingua ${language}, quindi in “Checkout and system” usa “Filtra campi” per cercare “Tax credential it” o “Tax email it”, inserisci il relativo “Campo dopo il salvataggio” e salva.`,
                  ]
                : []),
            ]
          : [
              "Nell’editor premi “Traduci”. Se Shopify Translate & Adapt mostra la guida iniziale, premi “Successivo” fino all’ultima schermata, poi “Chiudi”.",
              market
                ? `Apri il selettore “Traduzione in…” e scegli “Adatta un mercato” → ${market} → ${language}.`
                : `Controlla che in alto sia selezionato “Traduzione in ${language}”. Se non lo è, apri il selettore “Traduzione in…” e scegli ${language} sotto “Traduci per tutti i mercati”.`,
              "Apri “Checkout and system”. In “Filtra campi” cerca “Tax credential it” e “Tax email it”, inserisci per ciascuno il relativo “Campo dopo il salvataggio”, poi premi “Salva”.",
            ]),
        "Torna in CF Ready e premi “Rileggi i campi da Shopify”. Quando i due valori coincidono, il pulsante di conferma si attiva.",
      ],
      manualMismatch:
        "Shopify restituisce ancora un testo diverso. Modificalo e salvalo con la procedura qui sopra, quindi premi “Rileggi i campi da Shopify”.",
      openStorefront: "Apri il negozio",
      openCheckoutContentEditor: "Apri l’editor dei testi del checkout",
      confirmGuided: "Conferma verifica manuale",
      lastManualVerification: (value: string) => `Ultima conferma manuale nel checkout: ${value}`,
      checkoutCheckRequired: "Verifica manuale nel checkout richiesta.",
      keepNative: "Mantieni le mie etichette",
      keepNativeAccepted: "Scelta registrata: mantieni le etichette attuali",
      addressHeading: "Campo Interno",
      addressModeLabel: "Configurazione del campo Interno",
      addressModeSaved: "Configurazione del campo Interno salvata.",
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
        unknown: "Concedi l’accesso per controllare il testo del campo “Interno”.",
        expected: "Nel campo “Interno” non è stata rilevata un’etichetta fiscale.",
        nonstandard: "Il campo “Interno” usa un testo personalizzato che non sembra fiscale.",
        fiscal_conflict:
          "Il campo “Interno” è etichettato come Codice Fiscale e può creare un doppione.",
      },
      addressLimit:
        "CF Ready controlla il testo. Visibilità e obbligatorietà restano nelle impostazioni checkout di Shopify.",
      notAvailable: "Non disponibile",
      standardLabel: "Testo Shopify",
      restoreAddress: "Ripristina le traduzioni gestibili",
      restoreAddressConfirm: "CF Ready ripristina le traduzioni mostrate qui, poi rilegge Shopify.",
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
    disabled: "Il controllo non è attivo: queste regole non valgono per i tuoi clienti.",
    lapsed:
      "Il controllo è attivo ma il piano non lo è: finché resta così il checkout non blocca nulla.",
  },
};
