# Checkout Validation — rendering degli errori

**Data:** 29 luglio 2026

**Ambiente:** Development

**Store:** `cf-ready-dev.myshopify.com`

**App:** CF Ready Development

**Deploy:** Development `0.1.0`

## Esito

La causa del blocco silenzioso nel checkout standard è il target al plurale:

```text
$.cart.localizedFields.TAX_CREDENTIAL_IT
$.cart.localizedFields.TAX_EMAIL_IT
```

Shopify esegue correttamente la Function e blocca l’ordine, ma non collega né
mostra gli errori. La forma camelCase al singolare rende invece il messaggio
inline sotto il localized field corrispondente:

```text
$.cart.localizedField.TAX_CREDENTIAL_IT
$.cart.localizedField.TAX_EMAIL_IT
```

Il candidato locale usa quindi il target singolare. La modalità inline
predefinita continua a validare soltanto a `CHECKOUT_COMPLETION`.

Resta un difetto distinto della piattaforma: con il passaggio di conferma
ordine attivo, la review read-only blocca il submit finale senza mostrare il
messaggio, anche quando la Function restituisce il target singolare corretto.

## Preparazione e perimetro

Prima delle scritture remote sono stati verificati:

- store `cf-ready-dev.myshopify.com`;
- organizzazione Temisfera;
- app CF Ready Development;
- ambiente Development e dev preview;
- una sola Validation CF Ready;
- rollback alla versione Development rilasciata precedente;
- checkout standard guest con dati esclusivamente sintetici.

Production non è stata modificata. Non sono stati eseguiti release, billing o
ordini reali.

## Matrice osservata

| Variabile | Esito |
| --- | --- |
| Target plurale, one-page, conferma OFF | ordine bloccato, messaggio assente |
| Target plurale, one-page, conferma ON | review raggiunta; submit finale bloccato, messaggio assente |
| Target plurale, three-page, conferma OFF | ordine bloccato, messaggio assente |
| Target plurale, three-page, conferma ON | submit finale bloccato, messaggio assente |
| Messaggio solo ASCII con target plurale | messaggio assente |
| Target singolare camelCase per CF | messaggio inline visibile e presente nell’albero accessibile |
| Target singolare camelCase per PEC | messaggio inline visibile e presente nell’albero accessibile |
| CF mancante | messaggio required inline |
| CF formalmente invalido | messaggio invalid inline |
| CF formalmente valido | errore rimosso durante la modifica |
| PEC mancante con regola temporaneamente required | messaggio required inline |
| PEC formalmente invalida | messaggio “L’indirizzo PEC inserito non ha un formato email valido.” visibile |
| PEC formalmente valida (`test@example.com`) | accettata; checkout non bloccato |
| Dominio sintetico `test@pec.example` | respinto prima dalla validazione nativa del campo Shopify |
| Cliente autenticato, PEC formalmente invalida | messaggio configurato visibile; checkout bloccato |
| Cliente autenticato, PEC formalmente valida | accettata; ordine di test completato |
| Checkout accelerati | non esposti dal dev store con Test Payment Gateway; M10 li ha chiusi con fixture server-side e ricognizione non transazionale delle superfici canary disponibili |
| Focus e scroll su PEC invalida | ritorno automatico al campo, bordo di focus e cursore visibili |
| Lingua italiana | messaggio italiano inline |
| Lingua inglese | messaggio inglese inline |
| API Function `2026-07` | target singolare funzionante |
| API Function `2026-04` | target singolare funzionante |
| One-page, conferma OFF, target singolare | funzionante |
| Three-page, conferma OFF, target singolare | funzionante |
| One-page, conferma ON, target singolare | submit finale nella review bloccato senza messaggio |
| Three-page, conferma ON, target singolare | submit finale nella review bloccato senza messaggio |

Il testo non è la causa: il target plurale fallisce anche con ASCII semplice,
mentre il target singolare rende correttamente apostrofi tipografici e accenti.
La versione API non è la causa: `2026-04` e `2026-07` hanno lo stesso esito.

## Modalità preventiva verificata

La combinazione diagnostica seguente è stata verificata live:

- `CHECKOUT_INTERACTION` con target globale `$.cart`;
- `CHECKOUT_COMPLETION` mantenuto come barriera finale;
- un errore globale per CF e uno per PEC.

I due errori vengono mostrati come box distinti in cima al checkout già al
caricamento. Con checkout a pagina singola e conferma ordine attiva, “Rivedi
l’ordine” blocca l’avanzamento e riporta la pagina sui due box, evitando la
review con blocco silenzioso.

L’owner ha approvato questa modalità come opzione configurabile per il merchant.
Il motore locale la implementa con `errorDisplay: "preventive"` nello schema
config v2; `inline` resta il default. Il comportamento live è stato verificato
con la stessa combinazione di step e target prima di consolidarlo nel contratto.
La UI completa in M6 dovrà:

- avvertire che i box possono apparire al caricamento;
- mantenere `CHECKOUT_COMPLETION`;
- consigliarla nella Guida e FAQ quando il merchant usa la conferma ordine;
- non dichiarare di rilevare automaticamente l’impostazione Shopify.

## Ipotesi escluse

| Ipotesi | Evidenza |
| --- | --- |
| Motore, regole, entitlement o geografia | input e output live sono coerenti; la stessa logica rende con il target singolare |
| Serializzazione Wasm | fixture reali del Wasm e messaggi Unicode corretti |
| Testo, lingua o lunghezza | ASCII fallisce col plurale; IT/EN e Unicode rendono col singolare |
| Versione API | stesso comportamento su `2026-04` e `2026-07` |
| Layout come causa primaria | plurale fallisce e singolare rende sia one-page sia three-page con conferma OFF |
| Configurazione della Validation | una sola Validation, Function eseguita con successo e output atteso |
| `blockOnFailure` | non governa gli errori di validazione restituiti, ma le eccezioni runtime |

## Incoerenza nelle fonti Shopify

Le fonti ufficiali correnti indicano tre forme diverse:

| Forma | Fonte |
| --- | --- |
| `$.cart.localizedFields.TAX_CREDENTIAL_USE_MX` | esempio della [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/2026-07/cart-and-checkout-validation) |
| `$.cart.localizedfield.key` | tabella “Supported checkout field targets” della stessa pagina |
| `$.cart.localizedField.${taxIdField.key}` | esempio della [Localized Fields API](https://shopify.dev/docs/api/checkout-ui-extensions/2026-07/target-apis/checkout-apis/localized-fields-api) |

La prova live dimostra che la terza forma, camelCase al singolare, è quella che
Shopify collega ai localized fields nel checkout corrente. La forma plurale
dell’esempio Function blocca senza rendere. Shopify ha poi confermato la forma
singolare come corretta; la sezione seguente riporta la risposta.

## Risposta di Shopify Developer Support

Il 30 luglio 2026 Shopify Developer Support ha risposto all’escalation aperta
dall’owner tramite il supporto Partner. Contenuto tecnico rilevante, in sintesi.

**Sintassi del target.** La forma camelCase al singolare con chiave uppercase è
quella corretta, e il riferimento autorevole indicato è l’esempio della
Localized Fields API. Il matching è case-sensitive: `TAX_CREDENTIAL_IT`, non
`tax_credential_it`. La forma plurale viene scartata perché il checkout la
classifica come errore di localized field, la rimuove dal pool degli errori
globali e poi la elimina, non trovando alcun componente di campo che
corrisponda al path plurale completo. Il blocco resta corretto e il messaggio
non compare in nessun punto. Shopify qualifica il comportamento come difetto di
piattaforma e ha annunciato una correzione della documentazione.

**Bug della review.** Confermato come difetto di piattaforma già riconosciuto
dal team di engineering, con re-escalation interna sul contesto di riproduzione
fornito. Lo step di conferma ordine non monta, in nessun layout, le superfici
che ospitano i messaggi dei localized fields, e non esiste un fallback a
banner. Thread pubblici indicati:

- [errori Completion inghiottiti nella review](https://community.shopify.dev/t/bug-cart-validation-functions-two-issues-blocking-migration-from-usebuyerjourneyintercept/31931);
- [wallet: errore poco utile da pagina prodotto e carrello](https://community.shopify.dev/t/bug-cart-validation-functions-apple-pay-google-pay-shows-unhelpful-validation-error-on-product-cart-page/31935).

**Approccio provvisorio consigliato.** Shopify suggerisce campo vuoto a
`CHECKOUT_COMPLETION` come barriera di conformità e `CHECKOUT_INTERACTION`
limitato ai soli valori presenti ma formalmente invalidi, per evitare errori su
un checkout appena caricato.

| Punto | Motore corrente | Decisione |
| --- | --- | --- |
| Target singolare camelCase, chiave uppercase | già adottato | nessuna modifica |
| Target di campo anche a `CHECKOUT_INTERACTION` | usa `$.cart` | non adottato: la modalità preventiva serve proprio quando il campo non è montato, dove un target di campo non rende; `$.cart` è la sola forma verificata live a quello step |
| A `CHECKOUT_INTERACTION` solo il formato invalido, mai il vuoto | emette vuoto e invalido | non adottato: il campo vuoto è il caso principale e a Completion con conferma attiva non viene mostrato; escluderlo renderebbe la modalità preventiva inefficace nello scenario per cui è stata approvata. Il costo, box visibili al caricamento, resta il compromesso già registrato e l’avviso al merchant resta un requisito della UI in M6 |

**Checkout accelerati.** Shopify dichiarava che i localized fields non vengono
raccolti nei flussi wallet e che gli errori emergono in forma generica. La
conseguenza osservata allora per CF Ready non era di rendering: con i campi
assenti il motore applicava il fail-open e l’ordine poteva completarsi senza
Codice Fiscale. Il limite è stato poi chiuso come descritto nella decisione
sotto.

La risposta è un’email di supporto, non un contratto pubblicato: la reference
della Function API mostra ancora la forma plurale nell’esempio e una terza
variante nella tabella dei target. Il target resta quindi ancorato a una prova
live e a questa risposta fino alla pubblicazione della correzione.

### Seconda risposta, 31 luglio 2026

Le fonti citate sono due, non quattro: la reference della Function API compare
due volte e gli altri due link sono i thread già noti. Nessuna fonte nuova. In
particolare l’affermazione che un difetto di bypass di questa forma sia stato
individuato e corretto ad agosto 2025 non è appoggiata da alcun riferimento e
resta non verificata.

**Applicazione lato server nei wallet.** Confermata: la Function viene eseguita
nella negoziazione di completamento prima che sia costruito un ordine, e i
flussi express non sono esentati. La reference dichiara esplicitamente la
copertura di Shop Pay, PayPal, Google Pay e Apple Pay. Shopify corregge inoltre
la lettura del thread sui wallet: il reporter originale segnala un messaggio
poco comprensibile, non un ordine completato; la frase sul pagamento completato
proviene da un commento successivo di un altro sviluppatore, mai verificato.

**Materializzazione dei localized fields.** `cart.localizedFields` si popola
solo dopo che destinazione e origine sono risolte, e l’origine dipende dalle
location dell’opzione di consegna selezionata. Nei flussi express in cui nessuna
opzione è ancora selezionata l’array arriva vuoto. Il motore, che decide sulla
presenza dei campi, non trova nulla da validare e lascia completare l’ordine
senza Codice Fiscale. Shopify qualifica il caso come forma del fail-open
dell’app, non come bypass di piattaforma, e chiede di eseguire comunque la
matrice completa dei wallet prima del lancio, segnalando con gli identificativi
di esecuzione qualunque flusso che si completi senza Codice Fiscale.

**Segnale di intento.** Confermato assente sullo schema `2026-07`:
`BuyerJourney` espone soltanto `step` con tre valori, e nulla distingue un
tentativo di avanzamento dal semplice caricamento dello step. Poiché la chiave
compare nell’array solo dopo la risoluzione della consegna, la sua presenza è
già il proxy cercato: l’euristica su indirizzo e opzione di consegna non serve e
la query di input resta invariata.

**Fallback a banner nella review.** Nessuna soluzione confermata né in
lavorazione e nessun tempo indicato. La modalità preventiva resta quindi
l’unica mitigazione sotto il nostro controllo e l’avviso al merchant previsto
nella UI resta necessario.

**Identificativo di tracciamento.** Non condivisibile. Shopify ha lasciato una
nota interna sulla comunicazione.

### Terza risposta, 3 agosto 2026

**Come si materializza un localized field.** Shopify combina tre fattori: paese
del negozio, paese di destinazione e paesi di origine della merce. L’origine si
risolve percorrendo le sedi di evasione dell’opzione di consegna selezionata.
La condizione sulla consegna adottata dal motore è quindi corretta: con una
spedizione e un’opzione selezionata l’origine si risolve e il campo può
comparire.

**Configurazione del merchant.** L’attivazione per singolo negozio dei localized
fields è stata rimossa: i campi sono obbligatori dove le condizioni li
richiedono e il merchant non può disattivarli. Cade quindi una delle cause di
falso blocco considerate in precedenza. CF Ready non ha mai avuto una
impostazione corrispondente e nessun documento la assumeva.

**Ciò che Shopify non conferma.** Non è documentato se la sola destinazione
italiana basti a far comparire `TAX_CREDENTIAL_IT`, oppure se il campo dipenda
dal paese del negozio. Se valesse la seconda ipotesi, un negozio non italiano
che spedisce in Italia non vedrebbe mai il campo. La domanda è stata portata
nell’escalation interna di Shopify.

La conseguenza per CF Ready è nulla, per due ragioni indipendenti. L’app si
attiva soltanto su negozi con paese Italia: `app/validation.server.ts` rifiuta
l’attivazione altrove e disattiva la Validation se il negozio smette di essere
idoneo. Inoltre la regola implementata non usa la destinazione dichiarata ma una
consegna italiana osservabile, quindi è già più stretta dell’ipotesi discussa.

**Accesso ai campi a livello negozio.** Una risposta Shopify su
`TAX_CREDENTIAL_ES` in
[un thread distinto](https://community.shopify.dev/t/how-do-i-enable-the-checkout-input-field-for-localizedfield-tax-credential-es-in-a-store/34495)
indica che il merchant non può abilitare il campo da solo, che si tratta di
early access e che il campo compare solo dopo che il negozio ha ottenuto
l’accesso. Se qualcosa di analogo valesse per l’Italia, un negozio italiano
senza accesso non avrebbe il campo e la regola lo bloccherebbe senza nulla da
compilare. È la stessa classe di rischio già mitigata, con una causa diversa, ed
è oggetto di una domanda aperta a Shopify.

Il motore non può accertarlo da sé: nello schema della Function l’oggetto `Shop`
espone soltanto ora locale e metafield, non il paese né eventuali accessi. Il
solo canale disponibile resta il metafield di configurazione scritto dall’app.

### Decisione sul fail-open dei campi assenti

Il difetto è reale e riguarda il motore, non la piattaforma: decidere sulla
presenza dei campi lascia completare senza Codice Fiscale ogni flusso in cui
l’array non si è ancora popolato.

La correzione è definita. La regola diventa: destinazione italiana **e**
spedizione presente **e** Codice Fiscale assente o vuoto, quindi errore. La
condizione sulla spedizione è ciò che protegge gli ordini senza consegna, dove
l’origine non si risolve mai, il campo non compare e un blocco lascerebbe il
cliente senza nulla da compilare. I dati necessari sono già nella query di
input.

L’adozione era stata inizialmente sospesa perché bloccare in assenza di un
segnale di consegna avrebbe potuto fermare una vendita senza campo compilabile.
Il 1º agosto 2026 l’owner ha autorizzato la chiusura del finding con la regola
ristretta già definita: solo una consegna italiana osservabile autorizza
l’errore per un campo obbligatorio assente; senza consegna il fail-open resta
invariato. M10 ha verificato la correzione con la matrice server-side e ha
ricognito senza transazioni le superfici wallet disponibili sul canary.

Resta come osservazione non bloccante una verifica minore: Shopify afferma che con la chiave presente
l’errore non può comparire su un checkout appena caricato, mentre la prova live
ha visto i box della modalità preventiva comparire al caricamento. La
spiegazione probabile è che in quel test la consegna fosse già risolta. Si
riverifica soltanto quando il traffico reale offre il caso, senza creare un
checkout artificiale, e non cambia il motore né il gate M10.

## Superfici non disponibili

- Checkout accelerati: nel checkout osservato era disponibile soltanto il Test
  Payment Gateway; Shop Pay, Apple Pay, Google Pay e PayPal non erano
  selezionabili.
- Function ufficiale minimale separata: non necessaria, perché una variante
  locale minima del solo target ha risolto il rendering standard.

Questi limiti non vengono trasformati in esiti positivi impliciti.

## Verifiche locali

- build della Function riuscita;
- 105 test Function verdi;
- fixture Wasm aggiornata al target singolare;
- Function API ripristinata a `2026-07`;
- messaggi ripristinati e configurazione PoC locale aggiornata allo schema v2,
  con modalità inline predefinita;
- `git diff --check` verde.

I log live restano in `.shopify/logs`, ignorati da Git. Non vengono allegati
perché contengono identificatori tecnici e configurazione; l’evidenza riporta
soltanto risultati sanitizzati.

### Chiusura audit M3

Il 29 luglio 2026 l’artefatto M3 corrente è stato ricostruito e invocato con
`shopify app function run` sulla fixture sintetica `tax-code-required`:

| Voce | Valore |
| --- | --- |
| Esito | `success: true`, output conforme |
| Istruzioni | 794.719 su 11.000.000 |
| Memoria | 1.344 KiB |
| Modulo Wasm | 15 KiB |
| Log Function | vuoti |

Il costo osservato usa circa il 7,2% del limite e lascia oltre il 92% di
margine.

Il readback fresco della Home embedded sullo store
`cf-ready-dev.myshopify.com` ha mostrato `Validation PoC attiva`. Il loader
interroga la fonte autorevole Shopify, pagina tutte le Validation e rifiuta il
rendering se trova più di una Validation con handle `cf-ready-validation`;
l’esito osservato conferma quindi una sola Validation CF Ready attiva.

Il test del checkout iniziale con un prodotto in abbonamento non appartiene al
motore M3. La regola è coperta da fixture server-side; sul canary M10 non esiste
un selling plan e non ne viene creato uno solo per il test. Un'osservazione live
resta aggiuntiva quando lo store introduce un abbonamento per esigenze
commerciali reali, senza estendere l’esito alle generazioni ricorrenti
successive.

## Stato operativo corrente

Al termine della prima sessione di prove la Validation era stata disattivata.
Su autorizzazione successiva dell’owner, per completare la matrice senza
continue riattivazioni:

- Validation PoC riattivata sul solo store Development;
- una sola Validation CF Ready presente e attiva;
- `blockOnFailure: false` confermato dal readback applicativo;
- dev preview rimossa dopo il deploy fisso;
- checkout a pagina singola ripristinato;
- conferma ordine disattivata nell’ultimo readback Admin disponibile;
- codice diagnostico sostituito dal ramo configurabile
  `errorDisplay: "preventive"`;
- modalità inline locale predefinita e Completion-only;
- backend caricato da `cf-ready-dev.tmsf.workers.dev`;
- snapshot Shopify `0.1.0` attivo;
- smoke autenticato sul checkout standard: `ABC` bloccato con il messaggio
  inline configurato; nessun ordine creato.

La Validation resta attiva in Development fino a richiesta esplicita
dell’owner. La disattivazione resta il rollback di emergenza per errori,
configurazione incerta o Function non disponibile. Production non è coinvolta.

## Ricevuta deploy Development

| Voce | Valore |
| --- | --- |
| Commit | `e2f02400ab3cb2ee8ac84c24290d2439b4dff5e6` |
| PR | `#52` |
| Worker | `cf-ready-dev` |
| URL Worker | `https://cf-ready-dev.tmsf.workers.dev` |
| Deployment Cloudflare attivo | `d81b537d-0249-473e-ae34-be4918401c5a` |
| Versione Worker attiva | `0854800b-9805-4a77-a614-827561e65ead` |
| Versione Shopify attiva | `0.1.0` |
| Version ID Shopify | `gid://shopify/Version/1069448986625` |
| Workflow | `Deploy Development` run `30486465051` |
| D1 | `cf-ready-db-dev`, nessuna migrazione pendente |
| Secret readback | `SHOPIFY_API_SECRET` e `SESSION_ENCRYPTION_KEY` presenti per nome |
| Validation | una sola CF Ready, attiva, `blockOnFailure: false` |

Il Worker non aveva una versione utilizzabile precedente. Il rollback coordinato
consiste nel riattivare
`cf-ready-development-2` (`gid://shopify/Version/1067786829825`) prima di
rimuovere `cf-ready-dev`; D1 resta intatto. La disattivazione della Validation
resta il rollback immediato per un’anomalia della Function.

### Aggiornamento osservabilità Development

Il 29 luglio 2026 il Worker Development è stato ridistribuito senza modifiche
alla Function Shopify o ai dati:

| Voce | Valore |
| --- | --- |
| Sorgente runtime | `bda2a2154abce7797f13e528c982e7bbced22ed2` più la configurazione osservabilità registrata insieme a questa ricevuta |
| Deployment Cloudflare attivo | `24d386aa-3fb2-4cf3-955a-3eb492bca9eb` |
| Versione Worker attiva | `53660a82-4d4c-44a3-a280-b02eceaecd70` |
| Workers Logs | attivi, sampling `1` |
| Invocation logs | disattivati |
| Workers Traces | disattivato |
| Logpush / Tail Workers | disattivati |
| D1 | nessuna migrazione pendente |
| Smoke | `GET /` → `302 /auth/login` |
| Rollback Worker | deployment `d81b537d-0249-473e-ae34-be4918401c5a`, versione `0854800b-9805-4a77-a614-827561e65ead` |

Il readback Cloudflare ha confermato la configurazione. Production, Validation e
snapshot Shopify `0.1.0` non sono stati modificati.

## Conclusione e gate successivi

Il fix locale del rendering standard è il target
`$.cart.localizedField.<KEY>`. Il bug della review con conferma ordine ON è
confermato separatamente e coincide con la classe di difetti già riconosciuta
da Shopify.

L’indagine Development è conclusa per tutte le superfici disponibili. Le due
risposte di Shopify chiudono la sintassi del target, il riconoscimento del bug
della review, l’applicazione lato server nei wallet e l’assenza di un segnale di
intento. L’identificativo di tracciamento non è ottenibile e il punto è chiuso.

La correzione del campo assente è ora implementata: quando Shopify espone una
consegna italiana, ogni campo configurato come obbligatorio ma assente genera
un errore globale `$.cart`; senza consegna osservabile il motore resta
fail-open. Un test di regressione copre entrambi i rami. M10 ha chiuso la matrice
con le fixture server-side e la ricognizione non transazionale delle superfici
reali disponibili, senza decidere più se adottare il fix.

Restano follow-up non bloccanti, senza riaprire la matrice già completata:

1. riconfermare il target sulla reference pubblicata quando esce la correzione
   documentale annunciata, prima della `1.0.0`;
2. osservare sui primi ordini autentici idonei l'applicazione ai wallet; un
   bypass senza Codice Fiscale resta bloccante e va segnalato a Shopify, ma
   l'assenza del caso nel periodo non blocca M10 né richiede ordini artificiali;
   almeno un checkout reale riuscito resta però gate M11 prima della `1.0.0`;
3. verificare, quando il traffico reale offre il caso, se i box della modalità
   preventiva compaiano su un checkout appena caricato, dato che Shopify lo
   esclude e una prova live precedente li aveva osservati;
4. chiarire con Shopify se `TAX_CREDENTIAL_IT` richieda un accesso a livello
   negozio come risulta per il campo spagnolo. In caso affermativo un negozio
   italiano senza accesso verrebbe bloccato senza campo compilabile e la regola
   andrebbe ristretta ulteriormente. Shopify ha inoltre in escalation la
   combinazione di paesi che determina la comparsa del campo.

Questi punti sono conservati nel Master Plan e non richiedono più il piano
temporaneo dell’indagine.
