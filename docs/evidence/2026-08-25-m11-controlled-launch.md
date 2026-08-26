# M11 — `1.0.0` e Controlled Launch

Data di avvio: 25 agosto 2026.

Stato: **pubblicazione in corso**. Il gate del checkout organico è chiuso e il
candidato `1.0.0` è verificato in Development; restano promozione, deploy e
readback Production, tag/release e il lavoro umano del Controlled Launch.

## Prerequisito M10

M10 è chiusa dalla ricevuta canary del 25 agosto 2026: la
promozione Production #314, il deploy `32786987670`, la release `v0.9.40`, il
readback D1 e la verifica live appartengono allo stesso commit `bd80fb7`. Le PR
#315 e #316 hanno poi pubblicato la ricevuta su `develop` e `main` con i gate
bloccanti verdi.

## Gate Function API `2026-07`

Le fonti Shopify rilette il 26 agosto 2026 confermano che `2026-07` è la
versione corrente delle Function API e che Cart and Checkout Validation usa il
target `cart.validations.generate.run`.

Shopify CLI `4.7.0` ha rigenerato lo schema dichiarato in
`extensions/cf-ready-validation/shopify.extension.toml`. Il confronto con
`schema.graphql` ha rilevato soltanto tre a-capo di direttiva e la riga finale:
nessuna differenza semantica. Il comando ripetibile è:

```sh
npm run verify:function-schema
```

Il comando analizza entrambi gli SDL GraphQL prima del confronto, così una
differenza di soli spazi o a-capo non produce un falso positivo e una modifica
di tipi, campi o direttive resta bloccante.

Sul candidato `1.0.0` del 26 agosto sono riusciti
`npm run verify:function-schema`, `npm run typegen`, le 109 fixture di
`npm run test:function` e `npm run build:function`. Lo schema rigenerato dalla
CLI `4.7.0` è semanticamente identico al file committato. Gli stessi gate sono
riusciti in CI e nel deploy Development sul commit `345c27d` prima della
promozione.

## Toolchain e dipendenze

L'audit M11 del 25 agosto ha confrontato tutte le dipendenze dirette con il
registry npm, i peer e gli engine effettivi, le dipendenze transitive, Shopify
CLI, Wrangler e le GitHub Actions pinnate. Sono stati aggiornati Node.js a
`26.7.0`, `@types/node` a `26.3.0`, `@types/react-dom` a `19.2.5`, Oxfmt a
`0.65.0`, Oxlint a `1.80.0` e la compatibility date Worker a `2026-08-22`.

GraphQL resta a `16.14.2`: la `17.0.2` è la latest assoluta, ma non è compatibile
con i peer di `@graphql-codegen/cli`, `graphql-request` e `graphql-ws` portati
dalla toolchain Shopify Function. Shopify CLI `4.7.0`, npm `12.0.2`, Wrangler
`4.126.0`, il Vite plugin Cloudflare `1.54.0` e tutte le dipendenze applicative
risultano sulle ultime versioni stabili compatibili. Le Action sono già sulle
release correnti e fissate ai relativi commit immutabili.

La compatibility date è la massima supportata da tutti i runtime pubblicati
nella toolchain: Wrangler e Vite plugin includono `workerd@1.20260825.1`, ma il
Vitest pool `0.22.0` più recente include ancora un runtime che supporta al
massimo `2026-08-22`. Entrambi i binari sono autorizzati in modo puntuale nella
allowlist degli script npm; non viene forzato un runtime transitorio fuori
dalle combinazioni pubblicate da Cloudflare. Il gate verifica tipi, test, build
Function e dry-run Worker; distribuzione e readback Development sono riusciti
sul commit `345c27d`.

## Ricevuta deploy Development `1.0.0`

Il workflow [32964683280](https://github.com/max23468/CF-Ready/actions/runs/32964683280)
ha distribuito e riletto il commit `345c27d1cad960fb7a47e4e17c874201c2c21e2f`:

- `npm run check`, preflight provider e snapshot di rollback coordinato verdi;
- nessuna migrazione D1 Development pendente dopo il readback;
- Worker deployment `bdebefee-daf6-413b-bf68-e7249c0a4c32`, versione
  `b6df46e4-4d7a-40e0-9d89-5917cc14e6c9`, 100% del traffico;
- smoke e verifica capacità Worker riusciti;
- versione Shopify Development `1.0.0` attiva
  (`gid://shopify/Version/1104073752577`) e legata allo stesso commit;
- rollback coordinato precedente: commit `bd7165c`, versione `0.9.45`.

## Allineamento delle componenti alla `1.0.0`

La verifica richiesta prima della promozione non ha rilevato componenti CF
Ready con una versione applicativa inferiore alla `1.0.0`:

- `package.json` e la radice del lockfile coincidono su `1.0.0`, fonte canonica
  prevista dal Master Plan;
- il Worker importa quella versione come `APP_VERSION` e il workflow ha
  distribuito il medesimo commit `345c27d`;
- lo snapshot Shopify Development attivo è `1.0.0` e include configurazione app
  e Function `cf-ready-validation`; la Function non mantiene un secondo SemVer
  indipendente che possa divergere;
- il sito statico Pages è identificato dal commit e dal deployment verificato,
  non da una versione applicativa separata.

Le versioni `0.x` ancora presenti nel lockfile appartengono a dipendenze esterne
e non sono componenti versionate di CF Ready.

## Monitoraggio Controlled Launch

Il report interno legge da D1 soltanto conteggi aggregati già presenti nel
modello operativo: installazioni, store attivi, onboarding completati,
Validation abilitate, trial, store paganti o con acquisto concluso, concessioni
omaggio, store con errore aperto ed errori tecnici degli ultimi sette giorni.
Non aggiunge tabelle, provider o telemetria client-side e non restituisce domini,
identificatori Shopify, dati fiscali, PEC, metadata o codici errore.

La scelta dell'ambiente è obbligatoria e il comando esegue una sola `SELECT`
remota:

```sh
npm run report:launch -- development
npm run report:launch -- production
```

La lettura Production resta un'operazione intenzionale: non viene inclusa nei
gate CI né eseguita automaticamente. Il report copre i segnali tecnici e di
adozione disponibili; feedback qualitativo, efficacia dell'outreach ed esito
del checkout organico richiedono invece osservazione e lavoro umano.

La prima lettura Production del 25 agosto 2026 alle 07:37 UTC aveva restituito
quattro store attivi e quattro onboarding completati, tre Validation abilitate,
due store paganti o con acquisto concluso e una concessione omaggio. La lettura
aveva scritto zero righe, ma non costituiva una prova corretta dello stato
corrente: dopo la disinstallazione dello store di sviluppo restavano inoltre
nel conteggio gli stati collegati a installazioni non più attive.

La successiva verifica incrociata tra Partner Dashboard e D1 ha individuato
un'installazione fantasma: Shopify aveva consegnato `app/uninstalled` il 20
agosto e `shop/redact` il 22 agosto, ma tutte le nove consegne di ciascun topic
avevano ricevuto HTTP 500. Nei sette giorni osservati
il Partner Dashboard mostrava 18 fallimenti su 26 consegne (69,2%), mentre D1
mostrava zero webhook falliti perché l'errore avveniva prima dell'ingresso nel
nostro handler. La causa era il rinnovo della sessione offline eseguito da
`authenticate.webhook` dopo che Shopify aveva già revocato il token con la
disinstallazione; il comportamento corrisponde al problema upstream
[shopify-app-js #3360](https://github.com/Shopify/shopify-app-js/issues/3360).

Il percorso webhook ora valida firma e header con la Shopify API senza caricare
la sessione merchant. Il report limita onboarding, Validation, errori aperti,
trial ed entitlement agli store attivi. Il readback corretto deve quindi
distinguere due installazioni realmente attive dagli stati storici; una sola
Validation risulta attiva. I fallimenti che avvengono
prima di D1 restano osservabili soltanto dal monitoraggio Shopify, che fa parte
del readback operativo e non può essere sostituito dal solo report interno.

## Preparazione outreach e feedback

Il [runbook di outreach](../runbooks/controlled-launch-outreach.md) delimita il
target ai merchant e ai professionisti Shopify con un bisogno pertinente,
esclude esplicitamente Partita IVA, SDI e fatturazione elettronica, e prepara i
messaggi trasparenti per merchant, agenzie e risposte pubbliche. Include un
primo lotto di cinque contatti, le domande di feedback e le condizioni di stop.

La preparazione è lavoro tecnico completabile nel repository. La selezione dei
contatti, l'invio, le conversazioni, l'installazione dei primi merchant e la
crescita organica restano azioni dell'owner: in questa sessione non è stato
contattato nessuno.

## Verifiche locali del candidato `1.0.0`

Il 26 agosto 2026, con Node.js `26.7.0`, npm `12.0.2` e Shopify CLI `4.7.0`:

- `npm run check`: verde, inclusi 200 test applicativi, 109 test Function,
  React Doctor `100/100`, build Worker e Function e dry-run Wrangler;
- `npm run test:e2e`: 7 scenari verdi in Chromium e WebKit stretto/largo, su
  porte locali isolate `4273` e `4274`;
- `npm run verify:function-schema`: schema Shopify Function API `2026-07`
  semanticamente identico al file committato;
- `npm run typegen`, `npm run test:function` e `npm run build:function`:
  riusciti anche come gate mirati prima del controllo completo;
- `npm run report:launch -- production`: una sola `SELECT` aggregata riuscita,
  zero righe scritte, uno store attivo, una Validation abilitata e nessun
  errore aperto.

Le prove locali sono state riconfermate dalla CI della PR #327 e dal workflow
Development sul commit unito `345c27d`. La promozione Production deve partire
dal tip di `develop` dopo l'assorbimento di questa ricevuta.

## Gate checkout reale

Il 26 agosto 2026 una verifica in sola lettura ha correlato un ordine ordinario
già presente sul canary con l'esecuzione della Function, senza creare o
modificare ordini, clienti, prodotti o pagamenti:

- il connettore Shopify ha confermato store italiano, fuso `CEST` e un ordine
  Online Store pagato, non di prova, non bozza e non annullato, creato il 25
  agosto 2026 alle 17:53:16 CEST con consegna italiana;
- la configurazione canary verificata in M10 aveva una sola Validation attiva,
  Codice Fiscale richiesto e PEC opzionale; il report Production del 26 agosto
  ha riconfermato uno store attivo e una Validation abilitata;
- il Partner Dashboard ha registrato alle 17:53:11 CEST, cinque secondi prima
  della creazione dell'ordine, una chiamata
  `cart.validations.generate.run` conclusa `OK` con Function API `2026-07`;
- l'ordine è stato completato con destinazione italiana sotto una configurazione
  che richiedeva il Codice Fiscale: l'esito osservato è quello atteso per dati
  formalmente validi sotto la regola attiva.

Il Partner Dashboard nasconde correttamente input e output completi perché
l'app non possiede `read_customer_address`. La prova conserva soltanto
timestamp, stato e target tecnici: nessun Codice Fiscale, PEC, indirizzo, dato
cliente, ID ordine o valore commerciale è stato copiato nel repository.

Il gate checkout reale richiesto prima di `v1.0.0` è quindi **chiuso**.

## Stato di pubblicazione

Il deploy Development `1.0.0` è riuscito. Tag `v1.0.0`, deploy/release
Production, outreach e nuove attivazioni commerciali non sono ancora stati
eseguiti; la pubblicazione tecnica autorizzata è in corso.
