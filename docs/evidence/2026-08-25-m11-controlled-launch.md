# M11 — `1.0.0` e Controlled Launch

Data di avvio: 25 agosto 2026.

Stato: **in corso**. Questa ricevuta registra le prove M11 senza presentare come
chiusi i gate che dipendono dal candidato finale o dal traffico reale.

## Prerequisito M10

M10 è chiusa dalla [ricevuta canary](2026-08-25-m10-canary-numisleo.md): la
promozione Production #314, il deploy `32786987670`, la release `v0.9.40`, il
readback D1 e la verifica live appartengono allo stesso commit `bd80fb7`. Le PR
#315 e #316 hanno poi pubblicato la ricevuta su `develop` e `main` con i gate
bloccanti verdi.

## Precheck Function API `2026-07`

Le fonti Shopify rilette il 25 agosto 2026 confermano che `2026-07` è una
versione stabile delle Function API, accessibile fino al 16 luglio 2027, e che
Cart and Checkout Validation usa ancora il target
`cart.validations.generate.run`.

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

Questo è un precheck sull'HEAD di avvio M11 e **non chiude** il gate: il comando,
la generazione dei tipi, le fixture e la build della Function vanno ripetuti
sull'HEAD esatto del candidato `1.0.0`.

## Toolchain e dipendenze

L'audit M11 del 25 agosto ha confrontato tutte le dipendenze dirette con il
registry npm, i peer e gli engine effettivi, le dipendenze transitive, Shopify
CLI, Wrangler e le GitHub Actions pinnate. Sono stati aggiornati Node.js a
`26.7.0`, `@types/node` a `26.3.0`, `@types/react-dom` a `19.2.5`, Oxfmt a
`0.65.0`, Oxlint a `1.80.0` e la compatibility date Worker a `2026-08-22`.

GraphQL resta a `16.14.2`: la `17.0.2` è la latest assoluta, ma non è compatibile
con i peer di `@graphql-codegen/cli`, `graphql-request` e `graphql-ws` portati
dalla toolchain Shopify Function. Shopify CLI `4.7.0`, npm `12.0.2`, Wrangler
`4.125.0` e tutte le dipendenze applicative risultano già sulle ultime versioni
stabili compatibili. Le Action sono già sulle release correnti e fissate ai
relativi commit immutabili.

La compatibility date è la massima supportata dal `workerd` incluso nelle
versioni latest di Wrangler, Vite plugin e Vitest pool: `2026-08-25` è stata
provata e scartata perché il runtime dei test supporta al massimo `2026-08-22`.
Non viene forzato un `workerd` transitorio fuori dalla combinazione pubblicata
da Cloudflare. Il gate locale verifica tipi, test, build Function e dry-run
Worker; resta comunque da distribuire e leggere in Development prima di
promuovere il candidato in Production.

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

La prima lettura Production del 25 agosto 2026 alle 07:37 UTC ha restituito
quattro store attivi e quattro onboarding completati, tre Validation abilitate,
due store paganti o con acquisto concluso e una concessione omaggio. Non erano
presenti store con errore aperto, eventi di errore o webhook falliti negli
ultimi sette giorni. Sono riportati soltanto conteggi aggregati; la lettura ha
scritto zero righe. Questi dati provano il funzionamento del report, non
l'esecuzione della Function su un checkout organico.

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

## Verifiche locali dell'HEAD di lavoro

Il 25 agosto 2026, con Node.js `26.7.0`:

- `npm run check`: verde, inclusi 191 test applicativi, 109 test Function,
  React Doctor `100/100`, build Worker e Function e dry-run Wrangler;
- `npm run test:e2e`: 7 scenari verdi in Chromium e WebKit stretto/largo;
- `npm audit`: zero vulnerabilità; 704 firme registry e 206 attestazioni
  verificate;
- albero npm valido; nessuna dipendenza diretta aggiornabile resta, salvo
  GraphQL `17.0.2`, intenzionalmente esclusa per i peer incompatibili descritti
  sopra;
- `npm run verify:function-schema`: schema Shopify Function API `2026-07`
  semanticamente identico al file committato;
- `npm run report:launch -- production`: lettura aggregata riuscita, zero righe
  scritte.

Queste prove sono locali sull'HEAD di lavoro non ancora pubblicato. La nuova
compatibility date non è stata distribuita in Development e nessun check remoto
GitHub o deploy è stato eseguito.

## Gate checkout reale

Resta aperta l'osservazione di almeno un ordine nato organicamente sul canary,
idoneo a una regola italiana attiva. La prova deve confermare esecuzione ed
esito atteso della Function senza creare ordini, clienti, prodotti o pagamenti
per il test e senza registrare Codice Fiscale, PEC o altri dati personali.

## Stato di pubblicazione

Nessun tag `v1.0.0`, deploy, release, outreach o attivazione commerciale è stato
eseguito in questo avvio. Queste fasi restano successive ai due gate bloccanti e
alle autorizzazioni operative previste dal repository.
