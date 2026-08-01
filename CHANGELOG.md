# Changelog

Le versioni seguono SemVer e la cadenza per milestone descritta nel
[Master Plan](docs/plans/2026-07-28-CF-Ready-Master-Plan.md) §19.5. Ogni voce
corrisponde a uno snapshot rilasciato; le note pubbliche IT/EN e il tag Git
restano requisiti delle sole release Production.

## 0.5.9 — 2 agosto 2026

- la Content-Security-Policy consente l'endpoint RUM effettivamente usato dal
  beacon sul dominio `pages.dev`, e Privacy Policy e documentazione riportano
  la destinazione corretta.

## 0.5.8 — 2 agosto 2026

- Cloudflare Web Analytics misura visite aggregate e prestazioni del solo sito
  pubblico, senza cookie, archiviazione locale, fingerprint o query string;
- la Content-Security-Policy consente il beacon Cloudflare e il relativo invio
  RUM allo stesso dominio;
- Privacy Policy italiana e inglese e documentazione operativa descrivono
  metriche, finalità, base giuridica e confini della misurazione.

## 0.5.7 — 2 agosto 2026

- su telefono il menu resta visibile per i primi 240 pixel di scorrimento dalla
  cima, aspetta ancora un istante prima di ritirarsi e usa una transizione più
  morbida; quando si risale ricompare senza ritardo.

## 0.5.6 — 1 agosto 2026

- via il restringimento della testata allo scorrimento;
- su schermo largo il menu resta agganciato; su telefono si ritira mentre si
  scende e torna appena si risale, con `site/menu.js`: due comportamenti, nessuna
  dipendenza, e la Content-Security-Policy passa a `script-src 'self'` invece di
  ammettere codice in linea. Senza JavaScript il sito resta utilizzabile;
- il menu segna dove ci si trova: la sezione in vista sulla Home, la pagina
  aperta altrove, con una sottolineatura spessa che non dipende dal colore;
- le griglie chiudono le righe: sei schede in tre colonne e quattro in due,
  invece di lasciare buchi in fondo. Anche i tre passi stanno su una riga sola;
- i bottoni hanno tutti la stessa altezza, perché `a` e `button` avevano
  metriche diverse;
- il cambio lingua si distingue dalle voci ordinarie del menu;
- nell'esempio del checkout la sedicesima lettera non è più in grassetto: il
  codice si legge già come non valido dal bordo e dal messaggio;
- un test di billing falliva per due ore al giorno, ovunque e anche in CI: si
  aspettava la scadenza dell'abbonamento in UTC, mentre l'app la esprime nel
  fuso dello store. Se la scadenza cadeva fra le 22:00 UTC e la mezzanotte, a
  Roma era già il giorno dopo. Ora il test fissa la scadenza a mezzogiorno UTC,
  fuori dalla finestra ambigua.

## 0.5.5 — 1 agosto 2026

- il menu del sito porta anche alla Home, resta agganciato in alto mentre si
  scorre e si stringe dopo i primi centimetri di scorrimento, senza una riga di
  JavaScript: l'animazione è legata alla posizione, quindi si riavvolge da sé
  risalendo e non obbliga ad allentare la Content-Security-Policy;
- i collegamenti interni scorrono invece di saltare, e chi ha chiesto al sistema
  meno animazioni continua a vedere lo scatto secco;
- i richiami all'installazione non portano più a un 404: sono pulsanti
  disabilitati che dicono di aspettare la pubblicazione. Un collegamento rotto
  promette una destinazione che non esiste, un pulsante spento no;
- i testi del sito sono riscritti in un italiano parlato, con periodi di
  lunghezza diversa e meno costruzioni simmetriche. Nei due documenti legali
  l'intervento riguarda solo le frasi di raccordo: le clausole restano quelle.

## 0.5.4 — 1 agosto 2026

- il sito ha un ritmo verticale unico: ogni sezione porta la stessa mezza
  distanza sopra e sotto, le fasce a fondo pieno respirano di più e i tre punti
  fermi sotto il primo schermo diventano una sezione invece di un blocco fuori
  dal flusso. Spariscono gli stili in linea che davano a ogni blocco uno stacco
  diverso;
- il marchio in testata riporta alla Home e il piè di pagina della Home elenca
  anche sé stessa, come già fanno le altre pagine.

## 0.5.3 — 1 agosto 2026

- il registro delle operazioni di M7 raccoglie i due deployment del sito, lo
  snapshot Development `0.5.2`, l'esito dei gate della milestone e i residui:
  identità del titolare, link alla listing e screenshot dell'app;
- M7 è dichiarata completata nel Master Plan, con la revisione legale ancora
  aperta in carico all'owner.

## 0.5.2 — 1 agosto 2026

- la Home pubblica passa da scheda tecnica a pagina che spiega e convince:
  problema, tre passi, cosa controlla davvero il motore — omocodia e date
  impossibili comprese — casi in cui non blocca, dati, prova e domande di chi
  deve ancora installare. Le illustrazioni sono forme del sistema, non
  fotografie, e lo schema del checkout è dichiarato tale invece di imitare la UI
  di Shopify;
- i richiami all'installazione puntano a un URL provvisorio della listing, che
  non esiste ancora: il segnaposto è registrato in §27 con la milestone che lo
  sostituisce;
- la direzione di brand §9.1 registra la decisione: cambia la densità della
  Home, non il registro, e restano fermi i divieti su prove sociali, logo wall e
  finte schermate.

## 0.5.1 — 1 agosto 2026

- la riconciliazione conserva lo stato attivo quando Shopify lascia una
  Validation CF Ready duplicata in esecuzione;
- la lease viene rinnovata durante le operazioni condivise e la disattivazione
  prosegue in best effort sugli altri duplicati dopo un errore per risorsa;
- i contratti tecnici includono i codici operativi delle Validation duplicate.

## 0.5.0 — 1 agosto 2026

- sito pubblico bilingue in `site/`, statico e senza framework: Home, Privacy
  Policy, Termini e Assistenza in italiano e in inglese, con i token di brand e
  nessuna richiesta di rete verso terzi;
- il sito non ripete quello che l'app già dice: la FAQ operativa resta in Guida
  e FAQ e i prezzi restano nell'app e nell'App Store, che sono le fonti che
  restano aggiornate da sole;
- `SECURITY.md` completa la policy di §21.9 con recapito alternativo, regole di
  disclosure coordinata e perimetro delle segnalazioni: fail-open e validazione
  formale sono comportamenti voluti, non vulnerabilità;
- registrato in §22 l'esito della verifica sull'Email binding Cloudflare, che
  invia soltanto da un dominio proprio onboardato: senza dominio vale il
  fallback `mailto:`, quindi niente numero richiesta e niente tabella
  `support_requests` nella 1.0;
- la Guida non promette più un canale «appena disponibile»: indica la casella di
  assistenza e offre un collegamento che prepara il messaggio con i soli dati
  dell'allowlist di §22, che il merchant legge e può cancellare prima di
  inviare; lo stesso contatto compare nella schermata Store non supportato, dove
  serve di più perché l'app non è utilizzabile;
- allineate le fonti canoniche: FR-090, §12.1, §12.2, §14.11, §18.3, §19.1 e §22.

## 0.4.39 — 1 agosto 2026

- la scelta di un piano apre nuovamente l'approvazione Shopify fuori dall'iframe;
- la Home offre la riparazione esplicita della configurazione e segnala le
  Validation CF Ready duplicate, disattivandole in fail-open senza sceglierne o
  cancellarne una.

## 0.4.38 — 1 agosto 2026

- regole e onboarding riusano lo stesso parser degli enum di configurazione,
  eliminando due implementazioni duplicate senza cambiare il comportamento.

## 0.4.37 — 1 agosto 2026

- la riconciliazione percorre tutti gli acquisti una tantum prima di dedurre un
  rimborso e impedisce duplicati mentre un acquisto attende approvazione;
- sottoscrizioni, conversioni e cancellazioni condividono la lease per store,
  così una cancellazione ordinaria non può sottrarre la proratazione a una
  conversione una tantum;
- la generazione tariffaria resta acquisita durante la prova e la continuità
  commerciale, ma una nuova sottoscrizione dopo cessazione completa usa il
  listino corrente;
- il runner Workers risolve direttamente gli entrypoint React, evitando gli
  errori dovuti agli spazi nel percorso locale del repository.

## 0.4.36 — 1 agosto 2026

- i checkout con consegna italiana bloccano i campi fiscali obbligatori omessi
  da Shopify con un errore generale; senza consegna osservabile restano
  fail-open;
- contratti, copy merchant, audit e Master Plan descrivono lo stesso confine e
  mantengono la verifica wallet reale nel gate M10.

## 0.4.35 — 1 agosto 2026

- il session adapter restituisce tutte le sessioni dello store senza troncarle
  dopo le prime 25.

## 0.4.34 — 1 agosto 2026

- anche l’anteprima di Regole checkout usa l’entitlement autorevole e segnala
  una Validation attiva con piano non attivo.

## 0.4.33 — 1 agosto 2026

- onboarding e Home derivano dallo stesso punto lo stato operativo della
  Validation e dichiarano quando è attiva ma il piano non lo è.

## 0.4.32 — 1 agosto 2026

- riaprendo una configurazione completata, l’onboarding descrive lo stato reale
  della Validation e, se è già attiva, termina con una sola azione di revisione;
- una revisione non riscrive regole invariate né persiste nuovamente i passaggi,
  e l’evento finale registra lo stato effettivo della Validation.

## 0.4.31 — 1 agosto 2026

- onboarding rifiuta passi non interi o fuori intervallo e una scrittura
  tardiva non può spostare una procedura già completata dal passo iniziale;
- checkbox e istruzioni condividono lo stesso stato React;
- la Setup guide mostra spunte solo sui passi conclusi e usa una griglia CSS
  nativa che riduce le colonne con lo spazio disponibile.

## 0.4.30 — 1 agosto 2026

- la cancellazione del rinnovo richiede una conferma Polaris esplicita prima
  di inviare la mutation Shopify e mantiene visibile lo stato di caricamento.

## 0.4.29 — 1 agosto 2026

- login e relativi errori seguono la locale comune italiana/inglese;
- Regole e Messaggi nascondono le rispettive conferme alla prima modifica
  successiva, anche se la bozza torna poi ai valori salvati;
- Home e onboarding mostrano il caricamento della sola azione fetcher in corso
  e la Home descrive lo stato reale della Validation.

## 0.4.28 — 1 agosto 2026

- la dichiarazione merchant sul campo “Interno” viene persistita in D1 soltanto
  dopo che Shopify ha accettato il salvataggio o l'attivazione associata.

## 0.4.27 — 1 agosto 2026

- ogni scrittura Validation riconcilia prima il billing autorevole Shopify,
  conservando lo stato D1 noto soltanto se il readback non è disponibile e
  interrompendosi se la successiva sincronizzazione locale fallisce;
- il readback confronta l'intera configurazione canonica, inclusi messaggi e
  diritto, e attivazione/disattivazione conservano la config letta nella lease;
- una Validation spenta non può essere attivata senza prova o piano valido e le
  azioni merchant restano disabilitate finché manca il diritto.

## 0.4.26 — 1 agosto 2026

- errori di trasporto o parsing Shopify restano nei risultati tipizzati di
  billing e Validation, così le action mostrano il feedback contestuale;
- il ritorno billing usa sempre lo shop autenticato e conserva soltanto un
  `host` coerente con il contesto Admin corrente;
- il server rifiuta un piano ricorrente uguale a quello già attivo prima di
  creare una nuova approvazione Shopify.

## 0.4.25 — 1 agosto 2026

- conto operativo ed evento billing vengono scritti atomicamente e l'evento
  usa prezzo e valuta della risorsa Shopify effettiva;
- due primi accessi concorrenti registrano un solo evento di avvio prova;
- il ledger è descritto come pseudonimizzato, senza attribuire a SHA-256
  proprietà di anonimizzazione.

## 0.4.24 — 1 agosto 2026

- il test delle migrazioni copre l'upgrade `0001`–`0006` → `0007` → `0008` con
  dati preesistenti e il vincolo di unicità degli eventi webhook;
- le ricevute storiche distinguono le opzioni allora sicure dal rollback
  corrente con Worker compatibile e migrazione forward-fix;
- commento e retention di `shop/redact` mantengono Shopify autorevole per gli
  acquisti una tantum e limitano il ledger alla prova fruita.

## 0.4.23 — 1 agosto 2026

- un errore, timeout o annullamento dopo lo snapshot iniziale avvia un job di
  rollback indipendente, ripristina lo snapshot Development coordinato
  precedente e ne verifica il commit su Worker e Shopify;
- un webhook interrotto mentre era `processing` può essere riacquisito dopo
  cinque minuti; un heartbeat impedisce handler paralleli ancora vivi, solo il
  claim corrente può chiudere la ricevuta e la disinstallazione applica stato,
  sessioni ed evento nello stesso batch senza confondere un rinnovo di sessione
  o un claim precedente alla migrazione con una reinstallazione; gli eventi
  sono deduplicati per webhook e `shop_redacted` nasce nello stesso batch della
  cancellazione, anonimizzando anche ricevute pre-migrazione già parzialmente
  elaborate e le altre ricevute dello stesso dominio.

## 0.4.22 — 1 agosto 2026

- il deploy Development applica le migrazioni D1, pubblica e rilegge il Worker
  dello stesso commit, esegue lo smoke e soltanto dopo pubblica Shopify; prima
  di ogni scrittura accetta come rollback solo Worker e Shopify già coordinati;
- il preflight verifica ogni target Development nella chiave e nel file che lo
  possiedono, così un nome Worker errato non può passare grazie all'URL corretto.

## 0.4.21 — 31 luglio 2026

- al quarto passo `Attiva nel checkout` sembrava non fare nulla: la validazione
  veniva attivata e la procedura conclusa, ma la schermata finale dipendeva dal
  passo locale, che dopo l'attivazione resta il quarto, quindi non compariva
  mai. La chiusura viene ora riconosciuta esplicitamente.

## 0.4.20 — 31 luglio 2026

- riaprendo la procedura guidata si torna dove si era rimasti: il passo veniva
  ricordato solo al salvataggio delle regole, quindi si ripartiva da un valore
  vecchio. Ora ogni transizione lo scrive, su un canale che non viene mai
  riletto — è la rilettura, non la scrittura, che faceva rimbalzare la pagina;
- nella procedura, spuntare la dichiarazione sul campo “Interno” mostra i due
  passaggi da fare in Shopify, come già in Regole checkout;
- la guida di configurazione dispone i passi in riga invece che incolonnati:
  tre righe corte lasciavano vuota tutta la larghezza della card. La
  spiegazione riguarda solo il passo in corso e sta sotto, e l'azione torna in
  fondo;
- il marchio in fondo alla colonna laterale è centrato.

## 0.4.19 — 31 luglio 2026

- la procedura guidata non salta più passi e non si blocca: il passo vive
  soltanto nello stato della pagina, mentre prima lo stato locale e quello del
  server si contendevano lo stesso valore. Il server lo riceve quando la
  procedura si chiude;
- i radio del secondo passo non sono più controllati: riscriverli a ogni render
  faceva sfarfallare la sezione PEC e poteva far fallire il gestore
  dell'evento, lasciando `Continua` senza risposta. I valori si leggono dal
  modulo al salvataggio, come in Regole checkout;
- la guida di configurazione mette l'azione sulla riga del titolo invece che in
  fondo: il blocco era corto e largo, con una colonna vuota a destra;
- il marchio compare in fondo alla colonna laterale della Home, come firma, e
  nel primo passo della procedura. A-16 è estesa di conseguenza.

## 0.4.18 — 31 luglio 2026

- nella procedura guidata il terzo passo non andava né avanti né indietro:
  `Continua` aveva il numero del passo scritto a mano, e `Indietro` veniva
  annullato dall'avanzamento automatico che seguiva il salvataggio delle
  regole, perché guardava se l'ultima azione era riuscita invece di quale
  azione fosse;
- la guida di configurazione era tutta cornici e vuoti: via i riquadri per
  passo, che erano riquadri dentro un riquadro con il fianco vuoto, e resta
  aperto solo il primo passo ancora da fare. I passi conclusi si riducono a
  una riga con la spunta.

## 0.4.17 — 31 luglio 2026

- la procedura guidata si apre come finestra a schermo intero sopra la Home
  invece di cambiare pagina, usando il componente che Shopify prevede per i
  flussi multi-passo. Il codice della procedura resta uno solo;
- spuntare “Uso il campo Interno per il Codice Fiscale” non salvava nulla: la
  spunta veniva letta dalla proprietà dell'elemento, che nello shadow DOM può
  non esserci, invece che dal modulo;
- compariva un “Passo 0 di 4” con la schermata vuota: la colonna del passo
  nasce a zero e il valore predefinito non scattava su una riga già esistente;
- avanti e indietro non fanno più rimbalzare l'altezza del riquadro: il passo
  vive nello stato della pagina e la scrittura viaggia in sottofondo, senza il
  giro sul server a ogni transizione. Il secondo passo resta l'eccezione,
  perché scrive su Shopify e deve aspettare l'esito.

## 0.4.16 — 31 luglio 2026

- la Home apre con la guida di configurazione, la composizione `Setup guide`
  che Polaris pubblica: passi con stato reale, spunta di completamento,
  contatore di avanzamento e il proprio collegamento. Sparisce per sempre a
  onboarding concluso (D-063), mentre `Prossimo passo` resta indipendente;
- i passi hanno un completamento oggettivo. “Fai un ordine di prova” resta
  fuori: CF Ready non legge gli ordini e non è nel suo perimetro;
- la procedura guidata mostra i passi già fatti con la spunta, non solo il
  contatore;
- via i collegamenti dalle righe di configurazione in Home: restano dati.

## 0.4.15 — 31 luglio 2026

Difetti trovati rileggendo M6 per intero.

- riaprendo l'onboarding non si passava oltre il primo passo: il contatore
  arrivava da D1 ma veniva forzato a uno finché lo stato risultava concluso,
  quindi `Continua` scriveva e la pagina tornava indietro;
- la riga dei messaggi era sparita dal primo blocco della Home e le etichette
  della configurazione non erano più collegamenti: entrambe erano andate perse
  riscrivendo la Home per assorbire il Piano;
- il banner di errore aveva perso la distinzione fra una lettura commerciale
  fallita e una divergenza di sincronizzazione, che era stata introdotta con la
  `0.4.9`.

## 0.4.14 — 31 luglio 2026

Chiusura di M6: onboarding, prompt recensioni e registro delle operazioni.

- procedura guidata in quattro passi: perimetro e limiti, scelta delle regole,
  cosa succede nel checkout con i messaggi in revisione, riepilogo con
  l'avviso sul campo “Interno” e le due azioni finali. Si torna indietro, le
  regole scelte si salvano subito e attivare resta separato dal salvare;
- completare senza attivare conserva la configurazione, la checklist della Home
  non ricompare più e la procedura resta riapribile dalla Guida senza azzerare
  nulla;
- la richiesta di recensione usa la modale nativa di Shopify e parte solo a
  onboarding concluso, con la validazione attiva da almeno sette giorni e
  nessun errore aperto — mai da un'azione del merchant;
- `docs/evidence/2026-07-31-m6-ui-completa.md` registra i quattordici snapshot
  della milestone, la migrazione, i gate live e i residui dichiarati;
- la navigazione passa a quattro voci: `Piano e fatturazione` è assorbita dalla
  Home, con lo stato commerciale nella colonna laterale e la scelta della
  modalità in quella principale;
- la Home porta dove si agisce: il prossimo passo ha il suo collegamento, le
  regole e i messaggi si raggiungono dalle righe di configurazione, e una riga
  nuova dice se i testi per il cliente sono ancora quelli predefiniti;
- l'automazione degli E2E di §23.10 è rimandata a M8, dove è registrata come
  decisione di dipendenza con il perimetro proposto.

## 0.4.13 — 31 luglio 2026

- i titoli delle voci tornano in grassetto con `strong`, l'elemento nativo:
  è inline, quindi il segnalino di apertura resta sulla riga del titolo;
- l'aside della Guida porta ai tre punti in cui si configura ciò di cui le
  voci parlano;
- l'introduzione ha una misura di lettura contenuta invece di attraversare
  tutto lo schermo;
- la sezione delle voci ha un titolo e il comando di apertura sta alla sua
  destra, dove l'Admin colloca le azioni di sezione.

## 0.4.12 — 31 luglio 2026

- il marchio non è più circondato da spazio vuoto: senza un rapporto
  dichiarato l'immagine assumeva un riquadro quadrato e la lockup, larga più
  di cinque volte la sua altezza, restava centrata in mezzo al nulla;
- il segnalino di apertura delle voci resta sulla riga del titolo:
  un'intestazione dentro `summary` è un elemento di blocco e lo mandava a capo.
  Il titolo è ora un testo forte, inline e comunque in grassetto;
- con i titoli su una riga sola la spaziatura fra le voci si stringe.

## 0.4.11 — 31 luglio 2026

Revisione della Guida dopo la lettura dei contenuti.

- le voci passano da ventuno a quindici, accorpando invece di tagliare:
  fatturazione estera, eccezioni automatiche, ritiro in negozio e checkout
  accelerati rispondevano tutte alla stessa domanda reale, cioè perché un
  ordine sia passato senza i dati richiesti, e ora sono una voce sola;
- l'ordine segue l'importanza per il merchant: funzionamento, casi limite,
  commerciale, operativo;
- la voce su Partita IVA e Codice SDI dichiara i limiti tecnici invece di una
  preferenza di prodotto;
- il titolo di ogni voce è un'intestazione, non testo forte: pesa di più ed è
  la struttura corretta per chi naviga con uno screen reader;
- un solo comando apre e chiude tutte le voci;
- dove compare il marchio ora c'è la lockup completa con la scritta, in Guida
  e nella schermata di store non supportato;
- in Home `Guida e assistenza` torna dopo `Prossimo passo`, che è l'ordine
  di §15.3.

## 0.4.10 — 31 luglio 2026

Pagina `Guida e FAQ`, glossario canonico e completamento di `Store non
supportato`.

- ventuno voci espandibili con le risposte previste da §15.7, bilingui: cosa
  controlla l'app e cosa no, eccezioni automatiche, ritiro in negozio,
  significato di “formalmente valido”, PEC, modalità di visualizzazione degli
  errori, checkout accelerati, campo “Interno”, prova e pagamenti, privacy,
  limitazioni;
- `docs/glossario.md`: termini e traduzioni IT/EN per interfaccia, checkout,
  assistenza e documenti pubblici, come chiede §16.5;
- la Home ha il blocco `Guida e assistenza` di §15.3, che finora non aveva una
  destinazione, e `Store non supportato` rimanda alla Guida;
- la Guida porta l'illustrazione del marchio ammessa da A-16: è documentazione,
  non una superficie operativa.

## 0.4.9 — 31 luglio 2026

Correzioni dalla rilettura di `Piano e fatturazione`.

- il passaggio a pagamento unico mostra anche il costo netto stimato, non solo
  il credito: FR-081 chiede prezzo, periodo residuo, credito e costo netto
  prima di creare l'acquisto;
- un rinnovo già cancellato non propone più di cancellarlo una seconda volta:
  dichiara che l'accesso resta fino a fine periodo pagato;
- il banner di errore distingue una lettura commerciale fallita da una
  divergenza di sincronizzazione: prima mostrava il testo commerciale per
  qualunque codice;
- rimosse quattro voci di dizionario rimaste senza lettore quando il Piano ha
  lasciato la Home.

## 0.4.8 — 31 luglio 2026

Pagina `Piano e fatturazione`, con i due residui che M5 aveva lasciato a M6.

- il blocco Piano lascia la Home e diventa una pagina, che riconcilia con
  Shopify a ogni apertura come chiede §11.6;
- la data del primo addebito compare accanto a ogni modalità, non in un
  riepilogo: è il giorno dopo la fine dei giorni di prova ceduti a Shopify
  (§14.6);
- avvisi di prova a sette giorni, tre giorni e all'ultimo giorno, in app e
  senza conto alla rovescia: si dice la data (FR-077, §14.3). Compaiono sia in
  Home sia nella pagina Piano;
- l'annuale è etichettato `Consigliato`, senza percentuali di risparmio
  (D-070);
- periodo corrente, prossimo addebito e generazione tariffaria acquisita sono
  dichiarati; la cancellazione ordinaria spiega che l'accesso resta fino a fine
  periodo pagato, senza rimborsi parziali.

## 0.4.7 — 31 luglio 2026

Rifiniture di `Messaggi al cliente` dai gate live.

- l'introduzione era incollata al primo box: `s-page` spazia le sezioni, non un
  paragrafo sciolto, quindi la distanza va dichiarata;
- i campi crescono con il testo. Polaris non ha un campo che si ridimensiona da
  solo, e a 200 caratteri il messaggio finiva in uno scroll interno proprio nel
  momento in cui serve vederlo tutto per decidere cosa tagliare;
- il riquadro laterale non ripete più le stesse frasi che stanno nei campi
  accanto: dice quali messaggi il cliente può davvero incontrare con le regole
  attive. Con un campo non gestito i suoi due messaggi non li legge nessuno, e
  da questa pagina non si poteva sapere.

## 0.4.6 — 31 luglio 2026

Pagina `Messaggi al cliente` e spaziatura uniforme fra le colonne.

- nuova pagina `Messaggi al cliente`: otto testi, quattro per lingua, con
  contatore, limite di 200 caratteri, divieto di valore vuoto e ripristino dei
  testi predefiniti separato per lingua con conferma. Il salvataggio conserva
  regole e stato della Validation e passa dallo stesso controllo ottimistico
  delle altre pagine;
- le due lingue sono due sezioni entrambe visibili invece di due schede:
  Polaris non ha un componente tab e costruirlo a mano significherebbe
  reimplementarne l'accessibilità. Annotato in §15.5 del Master Plan;
- la spaziatura fra i box è ora la stessa nelle due colonne di tutte le
  pagine: la colonna principale usava uno stack esplicito e quella laterale la
  spaziatura della pagina, che non coincidono. Ora la dà `s-page` per entrambe.

## 0.4.5 — 31 luglio 2026

- etichetta e modalità tornano vicine: una griglia `1fr auto` le spingeva ai
  due bordi opposti della card, e su schermo largo si leggevano come due cose
  scollegate;
- la distanza fra i box della seconda colonna è ora uguale a quella di tutti
  gli altri: la colonna laterale aveva un contenitore in più della principale e
  ne sommava la spaziatura. Stessa correzione in Regole checkout, dove il
  difetto non si notava ma la costruzione era identica.

## 0.4.4 — 31 luglio 2026

- le azioni della Home non venivano rese: dopo le regole attive restava uno
  spazio vuoto al posto di `Modifica regole` e `Disattiva nel checkout`. Il
  gruppo di bottoni è sostituito dallo stack in linea che nella stessa card
  funziona;
- `Prossimo passo` passa nella seconda colonna sotto il Piano: sono le due cose
  che il merchant può fare adesso, e la colonna principale resta stato e
  riferimento;
- tolto il filetto fra le regole attive e le azioni, che non separava nulla di
  utile.

## 0.4.3 — 31 luglio 2026

Terzo giro di correzioni dai gate live, tutte sull'aspetto e sulla reattività.

- via gli sfondi grigi: il fondo pagina dell'Admin è già grigio, quindi un
  riquadro `subdued` era grigio su grigio e per di più in Polaris legge come
  “disattivato”. Tutti i blocchi sono ora card bianche uniformi, e la gerarchia
  la fanno struttura e tipografia;
- la distanza fra i blocchi della Home è dichiarata invece di essere lasciata
  alle regole implicite della pagina: `Prossimo passo` restava attaccato al
  blocco sopra;
- ogni navigazione accende l'indicatore di caricamento nativo dell'Admin: App
  Bridge cambia l'URL al clic mentre React Router aspetta il loader, e senza
  segnale il clic sembrava ignorato;
- il primo blocco della Home non è più una riga sola. Ha un titolo che
  dichiara lo stato — compreso il caso “attiva ma piano non attivo”, che prima
  non aveva un nome — la conseguenza per il cliente, le due regole attive e le
  azioni. `Configurazione corrente` era un blocco a sé magro quanto quello:
  ora è dentro, e la Home ha un riquadro in meno.

## 0.4.2 — 31 luglio 2026

Secondo giro di correzioni dai gate live, con la revisione visiva delle due
pagine.

- i bottoni non sono più fratelli nudi: stanno in `s-button-group`, e le azioni
  non passano più da un `<form>` per bottone, che li isolava dalla spaziatura e
  mandava a capo quello di attivazione;
- il Save Bar è pilotato dalla pagina invece che dal confronto automatico, che
  non si spegneva quando il merchant tornava sui suoi passi: lo stato “da
  salvare” ora si calcola sui valori salvati e correnti;
- Stato e anteprima rientrano nel limite di tre frasi per blocco di §7.7, con
  un test che percorre le combinazioni più affollate. La Home riassume in una
  riga, Regole spiega;
- le due pagine non sono più pile di contenitori uguali: la frase di esito è il
  titolo della schermata, i blocchi di riferimento diventano riquadri leggeri e
  Regole mette l'anteprima nell'aside, accanto alle decisioni invece che sotto;
- il titolo dell'app nella barra laterale riporta alla Home invece che al form
  di accesso: la rotta di casa non era dichiarata ad App Bridge. La voce `Home`
  resta comunque visibile nel menu;
- il blocco Piano era rimasto in italiano: ora è nel dizionario come il resto,
  e importi e date seguono la lingua di chi guarda invece di essere sempre
  all'italiana. La valuta dei piani ha una sola definizione.

## 0.4.1 — 31 luglio 2026

Correzioni dai gate live sul dev store.

- la conferma di `Disattiva nel checkout` non aveva alcun pulsante: il modulo
  era nello slot dove Polaris si aspetta un bottone, quindi la modale mostrava
  il testo e non permetteva di disattivare nulla;
- le sezioni di `Regole checkout` erano attaccate fra loro: il modulo che le
  racchiude sta fuori dal layout della pagina e ora le impila con la
  spaziatura Polaris;
- i valori del modulo tornano al DOM: riscriverli a ogni render faceva vedere
  al Save Bar una modifica anche quando il merchant era tornato sui suoi
  passi, per esempio togliendo una spunta appena messa;
- le istruzioni sul campo “Interno” erano sbagliate. I passaggi reali sono
  due: portare la seconda riga dell'indirizzo su “Facoltativo” o “Non
  includere” in Impostazioni → Checkout, e rimettere l'etichetta originale da
  “Gestisci la lingua del checkout” o da Impostazioni → Lingue se la lingua è
  tradotta.

## 0.4.0 — 31 luglio 2026

M6, primo strato: interfaccia bilingue, Home riscritta e pagina Regole
checkout.

- la lingua dell'interfaccia segue l'amministratore Shopify corrente, letta dal
  parametro `locale` e dall'header impostato da App Bridge, senza librerie e
  senza preferenze salvate;
- nuova pagina `Regole checkout`: tre modalità per Codice Fiscale e PEC,
  eccezioni automatiche non modificabili, avvisi preventivi, Save Bar nativa e
  anteprima testuale che dice cosa vedrà il cliente;
- il contratto di configurazione di §11.1 esce da `validation.server.ts` e vive
  in `app/config.ts`, con lettura tollerante che torna ai default invece di
  propagare valori fuori contratto;
- salvataggio e attivazione passano da un percorso unico con lease, scrittura
  intera e readback: il primo salvataggio crea la Validation disattivata, e
  salvare non attiva mai (FR-051);
- i default di prima installazione sono quelli di FR-050: entrambi i campi non
  gestiti, non più regole fisse di sviluppo;
- il limite di Validation attive di Shopify ha ora un codice stabile
  `validation_limit_reached` e un'istruzione operativa, al posto del messaggio
  grezzo di Shopify (FR-098);
- Home riscritta: stato come conseguenza per il cliente, eccezioni automatiche,
  un solo prossimo passo e la dichiarazione FR-058 sul campo “Interno”, con la
  migrazione `0007` che aggiunge le colonne di stato UI;
- il diritto scritto nel metafield viene ricalcolato a ogni scrittura anche dal
  conto commerciale: prima l'attivazione poteva scriverlo guardando la sola
  prova;
- il salvataggio delle regole ha il controllo ottimistico di §11.4: se un'altra
  sessione ha cambiato la configurazione nel frattempo, la scrittura non parte
  e il merchant lo legge invece di sovrascrivere il lavoro altrui;
- la dichiarazione sul campo “Interno” non si revoca più da sola quando il
  Codice Fiscale torna “Non gestito” e il blocco esce dallo schermo;
- una Validation attiva senza piano non viene più descritta come disattivata:
  è un terzo stato e dice la causa vera;
- la schermata `Store non supportato` indica dove correggere l'indirizzo dello
  store e porta l'illustrazione del marchio ammessa dalla nuova decisione di
  brand A-16, che apre il colore alle sole illustrazioni su superfici senza
  azioni operative.

## 0.3.6 — 30 luglio 2026

- la conversione a pagamento unico è serializzata dalla lease per store: due
  riconciliazioni simultanee chiedevano entrambe la cancellazione
  dell'abbonamento e registravano l'evento due volte;
- la contesa sulla lease non viene più mostrata al merchant come errore: se
  un'altra riconciliazione sta già scrivendo, si esce senza segnalare nulla.

## 0.3.5 — 30 luglio 2026

- registrato il topic `app_purchases_one_time/update`: senza, un rimborso che
  revoca il diritto veniva recepito solo alla successiva apertura dell'app. Il
  gestore dei due topic billing è ora un endpoint unico.

## 0.3.4 — 30 luglio 2026

- il piano già attivo non viene più riproposto: premerlo creava un addebito che
  sostituiva sé stesso, senza alcun effetto utile per il merchant;
- nessuna rivalidazione mentre la pagina esce verso l'approvazione Shopify,
  nemmeno sulla rotta padre: la richiesta interrotta a metà faceva comparire un
  errore per il tempo del redirect.

## 0.3.3 — 30 luglio 2026

- l'app Development si installa solo sullo store di sviluppo: la distribuzione
  pubblica, necessaria alla Billing API, la renderebbe installabile da chiunque
  conosca il `client_id`, che è nel repository pubblico;
- il ritorno dall'approvazione riporta il merchant dentro l'admin, con `shop` e
  `host`: senza, atterrava sul Worker fuori da Shopify;
- nessuna rivalidazione quando la pagina sta per essere sostituita
  dall'approvazione Shopify.

## 0.3.2 — 30 luglio 2026

- un rifiuto di Shopify sulla creazione dell'addebito viene registrato con il
  messaggio originale: senza, resta indistinguibile da un guasto di rete.

## 0.3.1 — 30 luglio 2026

- l'addebito viene creato con le mutation Billing dell'Admin API e l'URL di
  conferma viene aperto a livello superiore: il redirect gestito dalla libreria
  non sopravviveva alla richiesta dentro l'iframe embedded e faceva fallire
  l'intera pagina dell'app.

## 0.3.0 — 30 luglio 2026

Milestone M5, billing. Rilasciata in Development.

- prova comune di quattordici giorni, avviata da sola quando uno store italiano
  diventa idoneo, con scadenza calcolata come data locale dello store;
- generazione tariffaria acquisita all'idoneità e mantenuta fra le modalità;
- sottoscrizione mensile e annuale con i soli giorni di prova residui, cambi con
  il comportamento nativo Shopify e cancellazione ordinaria che lascia l'accesso
  fino a fine periodo pagato;
- acquisto una tantum con conversione dall'abbonamento nell'ordine sicuro e
  credito stimato sul solo ciclo corrente;
- rimborso totale che revoca il diritto, parziale che lo conserva;
- diritto commerciale scritto nel metafield della Validation: alla scadenza la
  Function smette di bloccare senza bisogno di job periodici;
- registro pseudonimizzato delle prove già fruite, per impedire una seconda
  prova dopo la cancellazione dei dati.

## 0.2.1 — 30 luglio 2026

Correzioni emerse dai gate live di M4 sul dev store.

- `shop/redact` cancella i dati solo se lo store risulta ancora disinstallato:
  Shopify invia il topic 48 ore dopo la disinstallazione e non annulla l'invio
  se lo store reinstalla nel frattempo. Con un'installazione attiva la richiesta
  viene presa in carico e registrata, senza toccare dati né ricevute;
- l'installazione è registrata una volta per ciclo di vita: con la managed
  installation il rinnovo del token completa un'autenticazione e rieseguiva
  l'evento. La riconciliazione resta a ogni autenticazione.

## 0.2.0 — 30 luglio 2026

Milestone M4, dati, auth e lifecycle. Rilasciata in Development.

- stato tecnico in D1: `app_state`, `webhook_events` e `app_events`;
- webhook idempotenti per ID, con rielaborazione dei soli retry dopo errore;
- topic `shop/update` e i tre topic di compliance su endpoint dedicato;
- gate geografico fail-open: fuori Italia la Validation viene disattivata e lo
  store marcato, il ritorno in Italia non riattiva nulla da solo;
- riconciliazione Shopify/D1 a installazione, apertura della Home,
  `shop/update` e dopo un errore di scrittura;
- installazione, disinstallazione e cancellazione dati registrate;
- eventi e log sanitizzati con codici errore stabili per auth, webhook e
  lifecycle;
- il percorso proof of concept diventa il lifecycle definitivo;
- una chiave di cifratura ruotata invalida le sessioni invece di bloccare
  l'app, con procedura di rotazione documentata.

Nota: lo snapshot intermedio `0.1.0-dev.ff878ab` è stato sostituito da questa
release e resta solo nella cronologia Shopify.

## 0.1.0 — 29 luglio 2026

Milestone M3, motore di validazione. Primo snapshot Development fisso.

- Function di validazione con Codice Fiscale a 16 e 11 cifre, omocodia,
  checksum, PEC, geografia e fail-open;
- contratto di configurazione schema v2 nel metafield della Validation;
- backend Development minimo sull'URL persistente del Worker.
