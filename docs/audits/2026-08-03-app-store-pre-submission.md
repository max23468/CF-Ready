# Audit pre-submission App Store

**Data:** 4 agosto 2026
**Snapshot:** `develop` a `8fc5d5b`, versione `0.9.9`
**Perimetro:** §24.8 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md) e i requisiti di
  self-review pubblicati da Shopify

## Come è stato fatto

L'elenco dei requisiti non è stato ricordato né ricostruito: è stato scaricato
  dalla fonte con la CLI supportata il 3 agosto e riscaricato il 4 agosto 2026,
  dopo la submission e sull'ultimo snapshot Development.

```bash
npm exec -- shopify doc fetch --url https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements
```

Ogni requisito applicabile è stato verificato contro il codice di questo
repository. **Un audit fatto su documentazione ricordata non vale**: il secondo
passaggio ha incluso anche i requisiti di installazione `2.3.2`–`2.3.4` presenti
nella fonte corrente.

## Esito

| Esito | Numero |
| --- | --- |
| Probabilmente conforme nel controllo locale Shopify | 31 |
| Probabilmente non conforme | 0 |
| Richiede review manuale nel controllo locale | 0 |
| Non applicabile, gruppo saltato | 10 gruppi |

Nessun requisito locale risulta violato dal comportamento dell'app. Restano
separati i controlli che Shopify esegue sulla submission. Il canary M10 è stato
poi chiuso il 25 agosto 2026 con fixture server-side, ricognizione non
transazionale e monitoraggio registrati nella ricevuta dedicata: questo audit
preparatorio non li sostituisce.

## Punti preparatori chiusi e chiusura M10

### 1. URL Production nel manifest — chiuso il 4 agosto 2026 ✅

`shopify.app.toml` dichiarava i valori dello scaffold, `https://example.com`.
Ora punta a `https://cf-ready-prod.tmsf.workers.dev` e vieta
`automatically_update_urls_on_dev`, così un `shopify app dev` distratto non può
riscrivere gli URL dell'app pubblica con un tunnel.

Chiuso anche il passo successivo: il Worker `cf-ready-prod` è distribuito e
risponde, e la versione attiva dell'app è la `0.9.8` del 4 agosto 2026, run
[`30946345558`](https://github.com/max23468/CF-Ready/actions/runs/30946345558).

### 2. Billing ancora in modalità test — chiuso il 4 agosto 2026 ✅

`app/env.server.ts` calcola `BILLING_IS_TEST = bindings.BILLING_TEST !== "false"`.
`wrangler.json` ora definisce la variabile a `"false"` nell'ambiente
`production`: gli addebiti dei merchant sono reali. Resta `"true"` di fatto in
Development, dove la variabile non è definita.

La versione precedente di questo punto rinviava il passaggio al canary, perché
«il reviewer deve vedere addebiti di prova». Production deve invece inviare
`test: false`, altrimenti i merchant non vengono addebitati — esattamente il
difetto contestato dal requisito 1.2.2. Con Manual pricing, però, un development
store non rende gratuita per costruzione una charge Production: per non
addebitare serve `test: true`. Le istruzioni reviewer usano quindi la prova
gratuita per il walkthrough e chiedono di aprire la conferma del piano senza
approvarla; Development conserva le charge di test per il collaudo interno.
Vedi D-129 nel Master Plan.

Il valore è effettivo sul Worker Production dalla `0.9.6` ed è stato riconfermato
dal preflight e dal deploy della `0.9.8`.

### 3. Function API `2026-07` — riconfermata; canary M10 chiuso

Il Master Plan chiede quattro verifiche tecniche prima della `1.0.0`. Tre sono
state fatte il 3 agosto 2026; M10 ha chiuso il criterio non transazionale della
quarta il 25 agosto. L'osservazione di almeno un checkout reale organico idoneo
a una regola italiana attiva, con esecuzione ed esito della Function confermati,
resta un gate distinto di M11 prima del tag `v1.0.0`.

| Richiesta | Esito |
| --- | --- |
| Versione stabile secondo le fonti Shopify correnti | ✅ la tabella di [About Shopify API versioning](https://shopify.dev/docs/api/usage/versioning) dà `2026-07` rilasciata il 1º luglio 2026 e accessibile fino al 16 luglio 2027; la Cart and Checkout Validation Function API è pubblicata sotto `/docs/api/functions/2026-07/` e la ricerca CLI del 4 agosto conferma gli express checkout supportati |
| Schema rigenerato con la CLI supportata | ✅ `shopify app function schema --config dev --stdout` con CLI 4.6.0: il risultato è identico a `extensions/cf-ready-validation/schema.graphql` a meno di tre a-capo di direttiva e della riga finale, cioè della formattazione applicata da `oxfmt`. Nessuna differenza di contenuto |
| Fixture ripetute | ✅ `npm run test:function`, 109 test verdi |
| Applicazione sul canary reale | ✅ `0.9.40`: fixture server-side verdi, checkout standard e wallet disponibili ricogniti senza completare transazioni, monitoraggio e readback live registrati nella [ricevuta M10](../evidence/2026-08-25-m10-canary-numisleo.md) |

L'osservazione di almeno un checkout reale su un prossimo ordine nato
organicamente, idoneo a una regola italiana attiva e con evidenza di esecuzione
ed esito della Function, resta un gate aperto di M11; non autorizza la creazione
di ordini artificiali sullo store reale.

### 4. Contatto tecnico d'emergenza — chiuso il 4 agosto 2026 ✅

Il requisito 4.5.6 chiede un **emergency developer contact** registrato nelle
impostazioni dell'account Partner: è il recapito su cui Shopify manda le
comunicazioni tecniche critiche sull'app. Registrato dall'owner il 4 agosto
2026.

Il percorso di review è stato poi definito in D-132: CF Ready non ha un login
proprio, quindi il requisito 4.5.5 sulle credenziali non si applica. Le
**testing instructions** chiedono al reviewer di installare l'app su un proprio
development store italiano; non vengono forniti account o store di CF Ready.

### 5. Configurazione Production del Worker — chiusa il 4 agosto 2026

`wrangler.json` ha l'ambiente `production` e i tre secret runtime sono
caricati: Worker `cf-ready-prod`, D1 `cf-ready-db-prod`, `ALLOWED_SHOP` vuota e
addebiti reali. Punto chiuso il 4 agosto 2026.

Una trappola scoperta preparandolo, perché non si ripeta: il Vite plugin
appiattisce l'ambiente **al momento della build**, quindi `wrangler deploy
--env production` dopo una build ordinaria pubblicherebbe le variabili
Development sotto il nome sbagliato, in silenzio. Il preflight Production
verifica il bundle e rifiuta di proseguire; una regressione in
`scripts/preflight-prod.node-test.mjs` tiene fermo il controllo.

## Requisiti verificati come conformi

| Requisito | Verifica |
| --- | --- |
| 1.1.1 Session token, niente cookie di terze parti | `app/routes/app.tsx` usa `AppProvider embedded` di `@shopify/shopify-app-react-router`; nessuna occorrenza di `localStorage` o `document.cookie` nel codice applicativo |
| 1.1.2 Usa il checkout Shopify | nessun URL di checkout esterno, nessuna logica di pagamento: l'app non crea ordini |
| 1.1.3 Nessun download di temi | nessuna chiamata Themes o Asset API; l'app non tocca il tema |
| 1.1.4 Solo informazioni fattuali | nessun dato generato o simulato; la listing dichiara esplicitamente cosa l'app non fa |
| 1.1.6–1.1.8 Marketplace, Payment Gateway e POS esterni | nessun marketplace, gateway di pagamento o collegamento a POS terzi; POS è dichiarato non supportato |
| 1.1.9 Nessun addebito aggiunto al carrello | la Function aggiunge soltanto `validationAdd.errors`, non righe né importi |
| 1.1.10 Opzione di spedizione più economica | l'app non legge, riordina o modifica opzioni di spedizione |
| 1.1.13 Duplicazione prodotti autorizzati | l'app non legge né copia prodotti |
| 1.1.14 Nessun marketplace di agenzie | l'assistenza è interna e non mette in contatto merchant con terzi |
| 1.1.15 Rimborsi tramite processore originale | l'app non emette rimborsi; osserva gli stati Shopify Billing |
| 1.1.16 Nessun prestito | nessuna funzione o comunicazione di finanziamento |
| 1.2.1 Billing tramite Shopify | `app/billing.server.ts` usa `appSubscriptionCreate`, `appPurchaseOneTimeCreate` e `appSubscriptionCancel`; nessun sistema di pagamento esterno |
| 1.2.2 Approvazione e rifiuto gestiti | stato dell'addebito riconciliato dal webhook `app_subscriptions/update` e `app_purchases_one_time/update`; la reinstallazione riconosce l'acquisto una tantum esistente |
| 1.2.3 Cambio piano senza reinstallare né scrivere al supporto | passaggi mensile/annuale/una tantum gestiti in-app, con la sequenza sicura di §14 per la conversione a una tantum |
| 2.2.1 Usa le API Shopify | OAuth, Admin GraphQL e Validation API |
| 2.2.3 App Bridge corrente | dipendenza `@shopify/shopify-app-react-router` 1.2.1; nessuna traccia del pacchetto legacy `@shopify/app-bridge` |
| 2.2.4 Solo GraphQL Admin API | nessuna chiamata a `/admin/api/*.json`, nessun client REST |
| 2.2.6 Nessuna promozione in Admin extension | nessuna Admin UI extension; il prompt recensione vive nell'App Home embedded |
| 2.2.7 Max modal solo su gesto merchant | nessuna Max modal o API fullscreen |
| 2.3.1 Nessun inserimento manuale del dominio | nessun campo che chieda un `myshopify.com`: la pagina di accesso che lo chiedeva è stata rimossa il 4 agosto 2026 (D-128), e `/auth/login` inoltra a `/app` |
| 2.3.2 Autenticazione immediata dopo installazione | `/`, `/auth/login` e le varianti con `shop` inoltrano a `/app`; la destinazione senza sessione espone solo il bootstrap App Bridge, coperto da `tests/e2e/install.spec.ts` |
| 2.3.3 UI dopo il consenso OAuth | `authenticate.admin` gestisce callback e session token; `afterAuth` completa lo stato dello store e l'App Home è la destinazione autenticata |
| 2.3.4 OAuth immediato dopo reinstallazione | sessioni revocate rientrano nello stesso flusso `authenticate.admin`; reinstallazione e token sostituiti sono coperti dai test lifecycle/session storage |
| 3.1.1 TLS valido | servito da Cloudflare Workers su HTTPS; nessun fallback in chiaro |
| 3.2.x Scope minimi | un solo scope, `write_validations`. Nessuno degli scope sensibili elencati dai requisiti — `read_all_orders`, `write_payment_mandate`, `write_checkout_extensions_apis`, `read_advanced_dom_pixel_events`, `read_checkout_extensions_chat` — è richiesto |

## Gruppi non applicabili

| Gruppo | Perché saltato |
| --- | --- |
| 5.1 Online store | nessuna theme app extension: l'unica extension è `type = "function"` |
| 5.2 Payment | nessuna extension di pagamento, nessuno scope `write_payment_gateway` |
| 5.3 Payment facilitator | opt-in |
| 5.4 Purchase option | nessuno scope subscription o payment mandate |
| 5.5 Product sourcing | opt-in |
| 5.6 Checkout customization | l'extension è una Function, non una UI extension con target di checkout |
| 5.7 Sales channel | nessun `channel_config` |
| 5.8 Post purchase | nessun `checkout_post_purchase` |
| 5.9 Mobile app builder, 5.10 Donation | opt-in |

## Voci §24.8 verificate fuori dai requisiti automatici

| Voce | Esito |
| --- | --- |
| Webhook privacy | i tre topic obbligatori (`customers/data_request`, `customers/redact`, `shop/redact`) sono dichiarati in `shopify.app.toml` e gestiti da `app/routes/webhooks.compliance.tsx` |
| Nessun dato personale nei log | verificato in M8 e coperto dai test; Codice Fiscale e PEC non lasciano l'infrastruttura Shopify |
| Installazione pulita, disinstallazione e reinstallazione | coperte da `tests/lifecycle.test.ts`, `tests/session-storage.test.ts` e dal percorso pre-OAuth di `tests/e2e/install.spec.ts` |
| Store Basic | il dev store è Basic; nessuna funzione richiede Plus |
| IT/EN completi | `tests/i18n.test.ts` e le sei route del sito in `tests/e2e/site.spec.ts` |
| URL legali e assistenza | pubblicati e verificati dallo smoke del workflow Pages |
| Nessuna funzione descritta ma assente | listing e reviewer instructions scritte a partire dal comportamento implementato, non dai deliverable pianificati |
| Prezzi non ambigui | tre modalità con identiche funzionalità; importi in `app/plans.server.ts`, coerenti con la listing |
| Icona | rischio accettato D-114 sulla sigla dentro l'icona, con `icon-app-notext.svg` pronto come rimedio |
| Review video | copione in [`screencast-script.md`](../listing/screencast-script.md), aggiornato all'avvio esplicito della prova; ripresa dichiarata eseguita dall'owner il 4 agosto 2026, fuori dal repository |

## Cosa non è stato verificato

Dichiarato per non far passare questo audit per più di quello che è:

- nessun checkout reale è stato eseguito in questa sessione;
- nessuna installazione pulita è stata rifatta;
- listing, screenshot, screencast e stato della review vivono nel Dev Dashboard:
  la loro presenza resta una prova esterna, distinta dal controllo locale.
