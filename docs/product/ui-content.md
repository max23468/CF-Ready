# Interfaccia e contenuti

Pagine, onboarding, lingue, assistenza e recensioni. I termini canonici stanno
nel [glossario](glossario.md); tono e identità nella
[Brand Foundation](../brand/brand-foundation.md).

## Requisiti

**FR-060** — Otto messaggi modificabili:

| Chiave | Italiano | Inglese |
|---|---|---|
| `taxCodeRequired` | sì | sì |
| `taxCodeInvalid` | sì | sì |
| `pecRequired` | sì | sì |
| `pecInvalid` | sì | sì |

Per un Codice Fiscale o una PEC non validi il checkout aggiunge dopo
`taxCodeInvalid` o `pecInvalid` una frase fissa IT/EN sulla causa formale
(D-161 e D-177); non è un messaggio modificabile. Il simulatore mostra lo
stesso testo.

**FR-061** — Nessun messaggio può essere vuoto dopo trim.

**FR-062** — Limite: 200 caratteri per messaggio.

**FR-063** — Reset separato per italiano e inglese, con conferma.

**FR-064** — Default:

Italiano:

- CF obbligatorio: “Inserisci il Codice Fiscale per completare l’ordine.”
- CF non valido: “Il Codice Fiscale inserito non è formalmente valido. Controllalo e riprova.”
- PEC obbligatoria: “Inserisci l’indirizzo PEC per completare l’ordine.”
- PEC non valida: “L’indirizzo PEC inserito non ha un formato email valido.”

English:

- CF required: “Enter your Italian tax code to complete the order.”
- CF invalid: “The Italian tax code entered is not formally valid. Check it and try again.”
- PEC required: “Enter your certified email address (PEC) to complete the order.”
- PEC invalid: “The certified email address (PEC) does not have a valid email format.”

**FR-065** — D1 conserva per store soltanto l’ultima configurazione confermata
da Shopify, per il primo paint della Home (D-167, D-174). Lo snapshot include
soltanto regole e otto messaggi; non include entitlement, billing, attivazione,
identità staff o dati checkout.

**FR-066** — Ritirato da D-174: l’app non ripristina configurazioni precedenti.

**FR-090** — Chat tawk.to espandibile dal pulsante fisso in basso a destra su
tutte le pagine dell’app, con caricamento alla prima apertura (D-176). Rimane
disponibile il percorso email minimale, raggiungibile anche
dal Support Link nativo **Richiedi assistenza / Get support**, che prepara un
messaggio già compilato verso la casella sviluppatore con:

- categoria scelta dal merchant, riportata nell’oggetto;
- corpo modificabile prima dell’invio;
- metadati tecnici non sensibili dell’allowlist in “Assistenza”, visibili nel messaggio.

Il recapito avviene tramite un collegamento `mailto:` verso
`supporto@cfready.it` (D-153); il fornitore del servizio email è
dichiarato per categoria nella Privacy Policy (D-200) tra i fornitori che trattano indirizzo del
mittente, contenuto e metadati tecnici delle email. Non esiste quindi un numero
richiesta, che senza un sistema ricevente non avrebbe riscontro.

Su uno store reale con diritto pagato e Validation attiva, la Home mostra una
sola volta un check-in neutro: conferma che il controllo è attivo, offre il
`mailto:` di assistenza e può essere chiuso definitivamente. Non cerca né
raccoglie recapiti del merchant e non chiede una recensione.

**FR-091** — Nessuna copia automatica al merchant.

**FR-092** — Nessun CF, PEC, ordine o dato buyer negli allegati o log.

**FR-093** — Prompt recensione nativo su store non partner-development dopo almeno 7 giorni di Validation attiva, onboarding completato e nessun errore aperto. Il tipo di store deriva da `Shop.plan.partnerDevelopment`, fonte autorevole Shopify; sul development store la modale non può inviare recensioni e non viene richiesta. CF Ready registra soltanto il codice di esito allowlistato restituito dalla Reviews API, senza testo o identificatori merchant.

**FR-094** — Azioni, frequenza e idoneità della modale restano controllate dalla Reviews API nativa Shopify; CF Ready non costruisce controlli paralleli né aggira cooldown e limiti della piattaforma.

**FR-095** — Nessun incentivo o richiesta di recensione positiva.

## Principi UI

- interfaccia embedded;
- quasi esclusivamente Polaris Web Components e App Bridge;
- niente dashboard artificiale;
- Home come centro operativo guidato;
- niente design system esterno;
- il simulatore checkout usa soltanto Polaris Web Components, resta locale al
  browser e dichiara esplicitamente che non salva i valori di prova;
- CSS custom minimo;
- Polaris 2 dal canale stabile `polaris-2.js` (`app/shopify-ui.ts`), con tipi
  `@shopify/polaris-types`; script e preload usano lo stesso URL. Fondo e spazi
  restano nativi. Assistenza somma `--shopify-safe-area-inset-bottom` di App
  Bridge alla propria posizione e antepone `ShopifyInter` a Inter;
- convenzioni condivise:
  - **layout:** Home, Messaggi e Guida usano `s-page` base con la colonna
    laterale nello slot `aside`. Regole affianca al 50% regole e simulatore, così una scelta e il suo
    effetto restano in vista insieme, e mette «Etichette del checkout» a tutta
    larghezza sotto. L'esito del simulatore sta in alto a destra della sua
    intestazione, senza una riga propria. Regole ha la stessa larghezza complessiva delle pagine con
    colonna laterale: `s-page` senza aside è larga 966 px contro i
    1088 px della griglia con aside, quindi il contenitore di Regole, banner
    compresi, si allarga in modo simmetrico fino a quella misura
    (`RulesLayout.css`); `inlineSize="large"` non sostituisce questo calcolo. L'onboarding resta `inlineSize="small"` come flusso
    guidato. Nessun altro CSS sposta o allarga la pagina. Il titolo di
    pagina sta nella barra dell'Admin, quindi la colonna laterale non si
    allinea a un titolo nel contenuto: è un comportamento dell'host e non si
    corregge;
  - **titoli:** sezione con `s-section heading`, sempre fuori dalla card;
    gruppo con controlli dentro una card o sottogruppo laterale con
    `s-heading`; etichetta di riga con `s-text type="strong"`; il nome di un
    campo lo dà la `label` del componente;
  - **badge:** `success` solo per un esito raggiunto, `info` per uno stato in
    corso e per l'opzione consigliata del piano, nel tono del banner della
    prova, `warning` quando serve un'azione del merchant, `critical` per un
    blocco o un errore, `neutral` per valori di configurazione e stati
    descrittivi (regole, messaggi predefiniti, «Può comparire»);
  - **logo e brand:** lockup a 128 px allineato a sinistra nelle colonne
    laterali, marchio positivo senza fondo in un box da 32 px accanto a un
    titolo (`app/ui/ui-brand.tsx`); mai `s-avatar` per il marchio. Il simulatore
    del checkout è l'unico accento di brand: fondo panna e «Continua» verde
    bottiglia (Brand Foundation, palette);
  - **densità:** il banner della prova sta subito dopo la card della
    validazione, non dentro, equidistante dalla card e dal titolo successivo,
    con l'azione nello slot nativo del banner; un
    solo badge di stato per pannello; un confronto senza modifiche sta su una
    riga;
  - **disclosure:** `details` tramite `app/ui/ui-disclosure.tsx`, con chevron
    `s-icon` al bordo finale del summary, uguale a ogni livello di annidamento;
  - **componenti nativi:** l'esempio di un messaggio è un `s-text-field` in sola
    lettura con l'etichetta del campo come `label` e il messaggio come `error`;
    il confronto tra etichetta attuale e nuova è una `s-table` con colonne
    Campo, Campo attuale e Campo dopo il salvataggio (o Testo Shopify per
    «Interno»), che su mobile diventa un elenco;
  - **spaziature:** dentro un gruppo `small-200` o meno, tra gruppi della stessa
    card `base`, tra blocchi con titolo proprio `large`; le righe
    etichetta-valore usano `app/ui/ui-status-list.tsx`;
  - **testi:** ogni testo nuovo o cambiato entra in italiano e inglese nello
    stesso commit; citazioni «» in italiano e “” in inglese; «Codice Fiscale» e
    «PEC», in inglese «Italian tax code (Codice Fiscale)» da solo e «Italian tax
    code» nei nomi composti; ogni informazione compare una volta per vista, una
    nota per gruppo e nessuna frase che ripete lo stato di un badge;
- accessibile, responsive e coerente con Shopify Admin;
- azioni ad alto impatto con conferma;
- Save Bar nativa per modifiche non salvate.


## Navigazione permanente

1. Home
2. Regole checkout
3. Messaggi al cliente
4. Guida e FAQ

L’onboarding non è una quinta pagina permanente.

Piano e fatturazione non ha una pagina propria: stato commerciale e scelta della
modalità vivono in Home, lo stato nella colonna laterale e la scelta in quella
principale, così il merchant vede se la prova sta finendo senza cambiare pagina.

Home resta una voce visibile del menu e `/app` vi compare una volta sola, senza
`rel="home"`. Il titolo dell’app usa la rotta predefinita `/`, che dopo la
rimozione della pagina di accesso inoltra a `/app` conservando i parametri della
richiesta. Dichiarare invece `/app` due volte, una visibile e una nascosta con
`rel="home"`, rompeva il menu dell’Admin (D-128, D-130).


## Home

Ordine dei contenuti:

1. **Stato principale**
   - attiva;
   - disattivata;
   - prova in corso;
   - prova scaduta;
   - pagamento da approvare;
   - sincronizzazione necessaria.
2. **Configurazione corrente**
   - Codice Fiscale;
   - PEC.
3. **Ambito delle regole nella configurazione corrente**
   - la condizione su consegna e fatturazione italiane è integrata nella card
     principale, accanto a Codice Fiscale, PEC e messaggi;
   - fatturazione estera esclusa;
   - campi obbligatori assenti bloccati solo con consegna italiana osservabile;
   - campi assenti senza consegna osservabile fail-open, salvo la spunta D-192
     con fatturazione italiana.
4. **Prossimo passo consigliato**
   - completare onboarding;
   - attivare;
   - osservare passivamente i prossimi ordini autentici;
   - scegliere piano;
   - risolvere sincronizzazione.
5. **Guida e assistenza**.

Finché risulta un uso del campo “Interno” per il Codice Fiscale (FR-058), il blocco `Prossimo passo
consigliato` include il promemoria di rimuovere il Codice Fiscale dal campo
“Interno”.

Con Validation attiva:

- azione primaria `Modifica regole`;
- azione secondaria `Disattiva nel checkout`, terziaria con tono critico;
- conferma per la disattivazione.

In ogni stato il primario è il primo bottone della card: da disattivata con un
diritto attivo è `Attiva nel checkout`, seguito da `Modifica regole`. Il badge
`Attiva` è verde solo con almeno un campo configurato. `Prossimo passo
consigliato` ha sempre un testo e un'azione. Con il banner della prova visibile
la data della prova compare solo nel banner.

La checklist iniziale scompare definitivamente dopo il completamento dell’onboarding.


## Regole checkout

Due sezioni con tutte le alternative sempre visibili.

**Codice Fiscale**

- Non gestito
- Facoltativo e validato
- Obbligatorio e validato

**PEC**

- Non gestita
- Facoltativa e validata
- Obbligatoria e validata
- Obbligatoria quando il campo Azienda è compilato

Ogni opzione ha una spiegazione concreta. Dopo le regole:

- riepilogo dinamico `Come funzionerà il checkout`, seguito dal simulatore
  interattivo che usa gli stessi controlli formali e messaggi configurati;
- menu `Prova uno scenario` con esempi validi, Codice Fiscale non valido, PEC non
  valida, CF numerico a 11 cifre, omocodia, Azienda compilata senza PEC e campi
  vuoti; per i primi due il campo mostra sotto il valore la nota che il campo
  nativo di Shopify oggi lo rifiuta (FR-103); le opzioni non pertinenti
  alle regole correnti non sono mostrate; una breve istruzione chiarisce che la
  scelta compila i campi e aggiorna il risultato del simulatore;
- spiegazione diagnostica locale per lunghezza, caratteri, struttura o data,
  carattere di controllo e formato email, mantenendo separati i messaggi che il
  cliente vede nel checkout;
- opzioni avanzate richiudibili per fase del checkout, selezione della spedizione,
  consegne miste e campi Shopify presenti o assenti;
- condizioni geografiche D-143 non modificabili, spiegate in modo sintetico
  accanto ai due selettori Paese del simulatore;
- sotto `Etichette del checkout`, il merchant dichiara se la seconda riga
  dell'indirizzo è `Facoltativo`, `Obbligatorio` o `Non mostrato` (FR-058); la
  scelta decide quale testo mostrare e ripristinare e segue la Save Bar;
- sezione `Codice Fiscale e PEC uniformati negli ordini` con l'unica spunta
  `Salva negli ordini il Codice Fiscale in maiuscolo e la PEC in minuscolo`
  (D-206), sopra la spunta D-192, disattivata di default e visibile solo con almeno un campo
  gestito; spuntarla chiede gli scope ordini e, se il merchant li nega, resta
  spenta; con scope revocati un avviso offre `Concedi accesso`;
- spunta `Blocca anche quando Shopify non mostra il campo` (D-192), disattivata
  di default e visibile solo con almeno un campo obbligatorio;
- Save Bar `Salva` / `Annulla`;
- salvataggio non attiva implicitamente una Validation disattivata;
- nessuna cronologia né ripristino di configurazioni precedenti (D-174).


## Messaggi al cliente

Un selettore Polaris `s-select` cambia la lingua modificata:

- Italiano
- English

Il selettore conserva un'etichetta accessibile e non reimplementa la semantica
dei controlli Polaris. Se il salvataggio trova un
errore nella lingua non visibile, quella lingua e il messaggio coinvolto vengono
selezionati automaticamente. Il ripristino resta separato per lingua.

Quattro campi per lingua:

- CF obbligatorio;
- CF non valido;
- PEC obbligatoria;
- PEC non valida.

Comportamenti:

- massimo 200 caratteri;
- trim;
- nessun valore vuoto;
- contatore sempre visibile, senza spostamenti al focus;
- anteprima testuale Polaris aggiornata durante la scrittura, senza simulare
  l’intero checkout: sopra i 560 px della colonna mostra il messaggio selezionato;
  fino a 560 px mostra gli esempi accanto ai campi e nasconde l'anteprima principale;
- disponibilità dei messaggi raccolta nel riepilogo laterale su desktop, con la
  condizione che il controllo sia attivo; sotto i 784 px il riepilogo è nascosto
  e solo gli editor non previsti dalle regole mostrano una nota contestuale;
  una sola nota distingue l'anteprima
  dall'aspetto del checkout reale e un link porta alla modifica delle etichette;
- Save Bar comune;
- `Ripristina testi predefiniti` separato per lingua;
- conferma prima del ripristino.

Titoli e descrizioni non ripetono ciò che il layout o l'azione mostrano già;
restano le spiegazioni necessarie per salvare, attivare, autorizzare e
ripristinare. Fino a 600 px il pulsante Assistenza mostra soltanto l'icona in un
bersaglio di 48 px, con nome accessibile IT/EN, e le pagine conservano spazio in
fondo per portare le ultime azioni sopra il pulsante flottante.

## Piano e fatturazione

Questi contenuti vivono in Home.

Durante la prova:

- data esatta di scadenza;
- avvisi interni a 7, 3 e 1 giorno;
- tre modalità;
- annuale evidenziato come `Consigliato`;
- una tantum come `Pagamento unico`;
- nessuna email promemoria.

Dopo l’acquisto:

- piano attuale;
- periodo corrente e prossimo addebito se disponibile;
- pricing generation acquisita;
- alternative consentite;
- flusso separato per passaggio una tantum;
- spiegazione del credito pro rata;
- stato dell’ultimo tentativo;
- link alla gestione nativa Shopify quando pertinente.


## Guida e FAQ

Pagina unica con sezioni espandibili, chiuse per default e accompagnate dal
comando unico `Espandi tutte` / `Comprimi tutte`. Le voci sono raccolte in tre
gruppi visivi:

- regole e validazione: perimetro di CF Ready, applicazione delle regole,
  controlli formali, PEC condizionata al campo Azienda ed errori nel checkout;
- etichette e campo “Interno”: configurazione della seconda riga dell’indirizzo,
  gestione automatica, verifica manuale, personalizzazioni di mercato e
  ripristino prima della disinstallazione;
- piano, privacy e assistenza: prova e pagamenti, ordini e canali esclusi, dati
  non conservati e risoluzione dei problemi.

La Guida e FAQ descrive il risultato per il cliente: i valori invalidi vengono
segnalati durante la compilazione e i campi obbligatori sono controllati prima
che l’ordine possa essere completato. Non espone step tecnici, euristiche o
impostazioni di rendering.

La voce sul campo “Interno” spiega che il Codice Fiscale va raccolto nel campo
fiscale nativo e che il merchant deve dichiarare se in Shopify ha attivato la
variante obbligatoria, facoltativa o non mostrata. CF Ready non può leggere automaticamente
quell’impostazione e si basa sulla dichiarazione del merchant (D-125).


## Disponibilità geografica

Non esiste una schermata di blocco basata sul Paese dello store. Home, onboarding,
prova, billing e gestione della Validation restano disponibili ovunque. La UI
spiega che CF Ready non crea i campi fiscali. Le regole si applicano con
fatturazione italiana o non ancora disponibile e almeno una consegna italiana;
senza un Paese di consegna, soltanto ai campi fiscali italiani presenti, salvo la
spunta D-192 che con fatturazione italiana blocca anche i campi obbligatori
assenti. Non si applicano con fatturazione estera o sole consegne estere.


## Onboarding

Quattro passaggi:

1. introduzione, perimetro e limitazioni;
2. scelta delle sole regole CF e PEC; anteprima e gestione delle etichette,
   richiesta dei relativi permessi e configurazione del campo “Interno”
   restano nella pagina Regole checkout. Salvare dall'onboarding conserva
   lo stato di gestione delle etichette già configurato, senza attivarlo o
   disattivarlo;
3. anteprima delle regole e dei soli messaggi che possono comparire con la
   configurazione scelta al passo 2; se entrambi i campi sono non gestiti,
   spiega che non sono previsti messaggi di errore;
4. riepilogo e attivazione.

Regole:

- si può tornare indietro;
- ogni cambio di passo porta focus e scorrimento all'inizio del contenuto;
- il riepilogo mantiene vicine etichette e valori, spiega la gestione mista
  delle etichette; l’anteprima mostra soltanto i messaggi previsti;
- il riepilogo finale va visualizzato;
- azioni finali:
  - `Attiva nel checkout`;
  - `Completa senza attivare`;
- completamento senza attivazione conserva la configurazione;
- onboarding riapribile dalla Guida senza reset;
- se la Validation è già attiva, il riepilogo offre `Torna alla Home`: ritorno
  diretto, senza un nuovo completamento o una schermata intermedia;
- checklist iniziale non ricompare;
- `Vedi piani` non completa da solo l'onboarding: il merchant può ancora
  abbandonare l'acquisto;
- almeno una regola gestita, accesso attivo, Validation attiva e assenza di
  errori completano invece immediatamente lo stato operativo, anche quando
  acquisto e attivazione avvengono nella Home; l'evento resta distinto da
  `onboarding_completed` manuale.


## Recensioni

Usare Reviews API nativa Shopify solo quando:

- Validation attiva da almeno 7 giorni;
- onboarding completato;
- nessun errore tecnico aperto;
- non durante un task o errore;
- Shopify considera il merchant idoneo.

Azioni:

- usare la sola modale della Reviews API;
- rispettare esito, cooldown, frequenza e idoneità restituiti da Shopify;
- registrare soltanto il codice di esito allowlistato o `unknown`.

Nessun incentivo e nessuna richiesta di recensione positiva.

---


## Lingua amministrativa

- locale letta dall’amministratore Shopify corrente;
- `it*` → italiano;
- `en*` → inglese;
- tutte le altre → inglese;
- nessun selettore manuale;
- staff diversi possono vedere lingue diverse;
- dizionari TypeScript/JSON tipizzati;
- nessuna libreria i18n. `resolveLocale(request)` in `app/i18n.ts` è l'unico
  punto che decide la lingua; l'inglese ha le stesse chiavi dell'italiano, con un
  test che lo verifica.


## Lingua checkout

- italiano → messaggi italiani;
- inglese → messaggi inglesi;
- tutte le altre → inglese;
- fallback a default inglese se il testo configurato è invalido.


## Microcopy fiscale

Non affermare:

- che tutti gli e-commerce italiani debbano sempre raccogliere il CF;
- che il CF sia verificato presso l’Agenzia delle Entrate;
- che una PEC sia certificata come tale;
- che l’app emetta o invii fatture;
- che l’app sostituisca consulenza fiscale o legale.

Formulazione consigliata:

> Per i merchant che devono emettere fattura elettronica per gli ordini B2C, CF Ready impedisce che un cliente completi un ordine italiano senza aver compilato un Codice Fiscale formalmente valido.

Promessa breve:

> Mai più ordini da fatturare senza Codice Fiscale.


## Contenuti pubblici

Italiano principale e inglese completo per:

- sito;
- App Store listing;
- Privacy Policy;
- Termini;
- Support;
- screenshot e didascalie;
- onboarding;
- FAQ.

Le versioni devono restare semanticamente allineate; niente traduzioni automatiche parziali.

Il sito risponde alle ricerche informative, la listing conserva prezzo autorevole,
recensioni e installazione (D-140). Il sito usa soltanto schermate reali dell'app e non
introduce testimonianze, contatori, prezzi duplicati o markup per offerte e rating non
visibili. `Organization`, `WebSite` e `BreadcrumbList` sono ammessi quando il contenuto
li sostiene.

Ogni limite si dichiara una volta, dove cambia una decisione del merchant o del cliente
(D-172). Nell'interfaccia si dice «controllo nel checkout», mai «Validation» (D-127).
Gli orari mostrati usano il fuso dello store con la sigla (D-173).


## Assistenza

Il percorso di assistenza comprende:

- supporto nativo Shopify e Support Link verso `/app/guide`;
- Guida e FAQ dentro l'app;
- chat tawk.to su tutte le pagine (D-176);
- messaggio email precompilato verso `supporto@cfready.it`;
- diagnostica tecnica copiabile, generata dal solo stato D1 riconciliato;
- diagnosi guidata su richiesta (D-144), con la stessa riconciliazione della
  Home.

Le risposte sono manuali. L'obiettivo dichiarato è un giorno lavorativo: è un
obiettivo operativo, non uno SLA.

La chat si apre dal pulsante fisso in basso a destra, resta aperta durante la
navigazione interna e ridurla non ricarica la conversazione. L'iframe si carica
solo alla prima apertura, usa `referrerPolicy="no-referrer"` e non riceve
parametri su store, utente o sessione. Il provider riceve la connessione del
browser e i messaggi inviati volontariamente; non accede al DOM autenticato.

L'email usa `mailto:`. Non esiste un sistema ricevente, quindi non ci sono numero
richiesta né tabella delle richieste, e il merchant può ispezionare e modificare
tutto prima dell'invio. Privacy Policy, Termini e `SECURITY.md` usano invece
`info@cfready.it` (D-153). L'Email binding di Cloudflare invia solo da un dominio
onboardato: un eventuale invio server-side richiede una decisione nuova.

La Guida non rilegge Shopify per comporre il messaggio: allega il solo stato D1
già riconciliato, mentre la Home aggiunge il Paese rilevato.

La diagnosi guidata aggiorna regole, stato Validation e diritto operativo. Non
attiva la Validation né avvia prove o acquisti. Mostra l'ora del controllo e gli
eventuali errori; in caso di fallimento non presenta una verifica precedente come
attuale. Paesi, campi visibili e momento del checkout restano verifiche manuali,
con collegamento al simulatore.

Dati tecnici allegabili, per allowlist:

- dominio store;
- Paese rilevato;
- lingua app;
- versione;
- stato prova o licenza;
- stato Validation;
- ultimo error code;
- versione schema e hash configurazione;
- revisione e ultimo allineamento dello stato Validation;
- correlation ID diagnostico.

Mai allegare CF, PEC degli acquirenti, ordini, indirizzi, token, secret o payload
completi.
