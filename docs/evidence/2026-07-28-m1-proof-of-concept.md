# Evidenze M1 — Proof of concept

Data: 28 luglio 2026.

## Target verificati

| Risorsa | Target |
| --- | --- |
| organizzazione Shopify | Temisfera |
| app Development | CF Ready Development |
| client ID Development | `adff48d4fe4ceb0dadb4734520701dd7` |
| dev store | `cf-ready-dev.myshopify.com` |
| D1 Development | `cf-ready-db-dev` |
| D1 ID | `9490eaea-3a12-465d-bb48-e2622b31fc4d` |
| Function API | `2026-07` |

Il preflight ha confermato app, dev store e D1 prima delle scritture.
Il connettore Shopify disponibile puntava a uno store diverso e non è stato
usato.

## Prove osservate

- Installazione embedded funzionante in Safari sull'app Development.
- Token offline richiesto e nuova sessione persistita in D1 locale.
- Readback strutturale della sessione reale: access token e refresh token
  cifrati presenti, con entrambe le scadenze valorizzate; nessun valore è
  stato letto o stampato.
- Ricaricamenti successivi autenticati tramite la sessione persistente.
- Query Admin GraphQL di shop, paese e Validation riuscita.
- Scrittura e readback del paese `IT` in D1 riusciti.
- Validation PoC creata e aggiornata senza toccare Validation di altre app.
- Metafield di configurazione letto dalla Function.
- Checkout reale sul dev store con `TAX_CREDENTIAL_IT` vuoto: completamento
  fermato, nessun ordine creato.
- Output Function osservato:
  `PoC CF Ready: inserisci il Codice Fiscale.` sul target
  `$.cart.localizedFields.TAX_CREDENTIAL_IT`.
- Invocazione Function riuscita con 196.466 istruzioni su 11.000.000,
  input 0,15 kB e output 0,14 kB.
- La Validation PoC è stata disattivata e il readback Shopify ha mostrato
  `Validation PoC disattivata`.
- Marchio verificato nell'Admin reale a 16 px: tessera e fascia restano
  distinguibili; la sigla è secondaria come previsto per questa dimensione.

Il refresh di un token realmente scaduto non è stato forzato sul dev store:
il percorso è abilitato dalla libreria Shopify, la sessione reale contiene il
refresh token cifrato e il roundtrip di token e scadenze è coperto dal test D1.

## CPU

La misura è stata eseguita sul bundle Worker di produzione, servito localmente
da `workerd` tramite Wrangler 4.114.0. Le variabili Shopify erano sintetiche e
non sono state usate credenziali reali.

| Percorso | Richieste | Esito | CPU totale | Media |
| --- | ---: | --- | ---: | ---: |
| `/auth/login?shop=cf-ready-dev.myshopify.com` | 100 | 302 | 350 ms | 3,50 ms |
| `/` | 100 | 302 | 280 ms | 2,80 ms |

La misura usa l'incremento CPU complessivo dei processi `workerd`, quindi
include l'overhead locale del runtime. Entrambe le medie restano sotto il
limite progettuale di 10 ms per richiesta ordinaria. La route embedded
autenticata è stata inoltre verificata nel runtime Development, ma non usata
come misura CPU perché Vite Development introduce overhead non
rappresentativo.

## Gate locali

Risultati osservati:

- test SessionStorage: 1/1;
- fixture Function: 3/3, inclusa l'assenza fail-open del localized field;
- build Function: riuscita;
- build React Router: riuscita;
- validazione della query Function contro lo schema Shopify: riuscita;
- preflight Development: riuscito.
- migrazione D1 Development applicata e tabelle `shops` e
  `shopify_sessions` confermate con readback remoto;
- dipendenze dirette verificate rispetto a codice, configurazioni e comandi:
  nessuna dipendenza inutilizzata da rimuovere;
- install script npm coperti da policy esplicita e versionata: `esbuild`,
  `workerd` e `fsevents` approvati; il postinstall non necessario di `core-js`
  negato;
- `npm run check`: riuscito;
- `git diff --check`: riuscito.

`npm audit` segnala 19 advisory alte e nessuna critica. Una riguarda
React Router soltanto nelle API RSC instabili, che CF Ready non usa; le altre
provengono dalla toolchain ufficiale `@shopify/shopify_function` usata per
generare e compilare la Function, non dal bundle Worker o dal WASM eseguito al
checkout. Le versioni correnti compatibili non offrono una correzione completa:
l'audit va ripetuto quando Shopify aggiorna la toolchain e prima di ogni
release.

## Confini operativi

- Nessun deploy Worker o Function.
- Nessuna operazione Production.
- Nessuna release, submission App Store, billing, commit o push.
- Nessun secret è stato salvato nel repository o riportato in questo
  documento.
- Il dev store resta protetto da password e la Validation PoC resta
  disattivata.
