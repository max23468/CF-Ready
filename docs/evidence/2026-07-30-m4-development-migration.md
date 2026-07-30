# Operazioni Development M4

**Data:** 30 luglio 2026 · **Ambiente:** Development. Il documento registra
nell'ordine la migrazione D1, il deploy del Worker, lo snapshot Shopify e le
verifiche live.

## Migrazione D1

Eseguita prima del deploy: le tabelle nuove non erano referenziate dal Worker
allora attivo.

### Preflight

| Voce | Valore |
| --- | --- |
| Account Cloudflare | OAuth `matteofilisina@icloud.com`, account `98195e505f42abaaeb4827f71a924b1a` |
| Database | `cf-ready-db-dev` (`9490eaea-3a12-465d-bb48-e2622b31fc4d`), regione EEUR |
| Stato pre-migrazione | 4 tabelle, 53.2 kB, `0001` e `0002` già applicate |
| Migrazione pendente | `0003_app_state_webhooks_events.sql` |
| Sorgente | commit `b6e46ca` sul branch `feature/m4-dati-auth-lifecycle` |
| Bookmark Time Travel | `00000018-00000000-000050b8-6e52c1d44dc67991f0444459d46cf070` |

La migrazione contiene solo `CREATE TABLE` su nomi nuovi e un indice: non
altera tabelle esistenti e il Worker Development in esecuzione non referenzia
gli oggetti creati.

### Applicazione e readback

`wrangler d1 migrations apply DB --remote` ha eseguito 5 comandi. Il readback su
`sqlite_master` ha restituito le tabelle `app_state`, `app_events`,
`webhook_events` e l'indice `app_events_shop_id_occurred_at_idx`.

I dati preesistenti sono intatti: 1 riga in `shops`, 1 in `shopify_sessions`,
0 in `app_state`.

### Rollback

`DROP TABLE app_state`, `app_events`, `webhook_events` e la riga corrispondente
in `d1_migrations`. Nessun dato applicativo verrebbe perso. Il ripristino Time
Travel al bookmark registrato sopra resta la rete per corruzione o perdita, non
il rollback ordinario di questo schema.

## Deploy Worker e snapshot Shopify

Release M4: **`0.2.0`**.

| Voce | Valore |
| --- | --- |
| Sorgente runtime | `a7587d2`, che rilascia il codice M4 mergiato con `693d6c8` (PR #58) |
| Worker | `cf-ready-dev`, `https://cf-ready-dev.tmsf.workers.dev` |
| Versione Worker attiva | `45f7e85e-c120-46a9-b96b-e55ff720484e` |
| Rollback Worker | versione `53660a82-4d4c-44a3-a280-b02eceaecd70`, precedente a M4 |
| Versione Shopify attiva | `0.2.0`, `gid://shopify/Version/1070080524289` |
| Rollback Shopify | versione `0.1.0` |
| Workflow | `Deploy Development` run `30530905262` |

Il deploy Shopify ha richiesto tre passaggi. Il run `30528975291` è fallito
perché il nome `0.1.0` esisteva già. Il run `30529548074` ha rilasciato uno
snapshot con nome derivato dal commit, `0.1.0-dev.ff878ab`
(`gid://shopify/Version/1070049361921`), soluzione poi scartata: la chiusura di
una milestone è una release. Il numero assegnato a ogni milestone fino alla
`1.0.0` è ora nel Master Plan §19.5 e M4 è stata rilasciata come `0.2.0` con il
run `30530905262`. Il Worker è stato ridistribuito dallo stesso commit della
release, così snapshot Shopify e runtime Cloudflare condividono una sola
sorgente; la versione intermedia `899753e6-3997-4601-8902-d6ce896e44d2`
conteneva lo stesso codice M4 e resta nella cronologia.

## Verifiche live

| Prova | Esito |
| --- | --- |
| `GET /` | `302` verso `/auth/login` |
| `POST` sulle quattro rotte webhook senza HMAC | `400`, nessuna elaborazione |
| `shop/update` firmato via `shopify app webhook trigger` | ricevuta `SHOP_UPDATE` `processed`, evento `shop_update_skipped` con codice `missing_admin_context` |
| `customers/data_request` firmato | ricevuta `CUSTOMERS_DATA_REQUEST` `processed` |

Le prove firmate sono state eseguite sullo snapshot precedente; smoke di `GET /`
e delle rotte webhook sono stati ripetuti dopo il deploy della `0.2.0`, che non
cambia il codice del Worker.

I payload di esempio della CLI usano lo store fittizio `shop.myshopify.com`:
senza sessione la riconciliazione viene saltata con un codice stabile invece di
generare retry, e l'evento resta senza `shop_id`. Le due ricevute sintetiche
restano in `webhook_events` come traccia della prova.

## Gate live sul dev store

Eseguiti dall'owner il 30 luglio 2026, con readback D1 verificato:

| Prova | Esito |
| --- | --- |
| Apertura dell'app, 10:14 UTC | autenticazione completata su installazione preesistente, riconciliazione che popola `app_state` con Validation `gid://shopify/Validation/140411184`, `schemaVersion` 2, hash calcolato e nessun codice errore |
| Modifica delle impostazioni negozio, 10:17 UTC | consegna reale di `shop/update` da Shopify, ricevuta `processed` con lo shop domain vero, evento `shop_updated` con `country_code` `IT` |
| Disinstallazione, 10:27 UTC | ricevuta `APP_UNINSTALLED` `processed`, evento `app_uninstalled`, store `uninstalled` con `uninstalled_at`, sessione eliminata, `validation_gid` azzerato |
| Reinstallazione e riattivazione, 10:28 UTC | nuova sessione unica, evento `app_installed`, store di nuovo `active` con `uninstalled_at` nullo, evento `validation_enabled` e nuova Validation `gid://shopify/Validation/140509488` |

La consegna reale chiude anche la domanda sulla registrazione dei topic
aggiunti dallo snapshot `0.2.0`, non ispezionabile via API.

Il cambio di `validation_gid` fra le due aperture conferma che Shopify rimuove
la Validation alla disinstallazione: azzerare lo stato locale evita che la UI
dichiari attiva una risorsa inesistente. Nessun codice errore lungo l'intero
ciclo, e una sola sessione presente al termine.

| Riapertura dopo la scadenza del token, 11:42 UTC | token rinnovato senza intervento del merchant: `access_token_expires_at` da 11:28 a 12:42, refresh token rigenerato fino al 28 ottobre, stessa riga sessione (`created_at` 10:28), `installation_status` invariato ad `active` |

Il rinnovo del token è il caso che avrebbe innescato il difetto corretto
nell'audit, cioè lo stato riportato ad `active` a ogni scrittura di sessione:
lo store è rimasto coerente.

### Difetti emersi dalle prove live

**`shop/redact` dopo una reinstallazione.**
La reinstallazione immediata ha esposto un difetto del percorso `shop/redact`.
Shopify invia quel topic 48 ore dopo la disinstallazione e la documentazione non
prevede l'annullamento dell'invio se lo store reinstalla nel frattempo: la
versione `0.2.0` avrebbe quindi cancellato i dati di un'installazione viva,
disconnettendo il merchant. La cancellazione è ora condizionata allo stato
`uninstalled`, con la richiesta comunque presa in carico e registrata come
`shop_redact_skipped`. Il caso è coperto da un test che fallisce senza la
guardia.

Con la disinstallazione del 30 luglio alle 10:27 UTC, l'invio atteso cade
intorno al 1 agosto 2026: la correzione va rilasciata prima di quella data.

**`app_installed` registrato a ogni autenticazione.**
Il rinnovo del token ha prodotto un terzo evento `app_installed` senza che ci
fosse alcuna installazione: con la managed installation Shopify non espone un
evento di installazione distinto, e `afterAuth` scatta anche al token exchange
del rinnovo. Le prove delle 10:14 e delle 11:42 sono quindi autenticazioni su
un'installazione esistente; l'unica installazione reale della giornata è quella
delle 10:28. L'evento è ora registrato una volta sola per installazione, fino
alla disinstallazione successiva, con un test dedicato. La riconciliazione
resta invece a ogni autenticazione: è idempotente e costa una query.

Gli eventi `app_installed` spuri già scritti nel D1 Development restano nella
cronologia: la telemetria è un registro append-only e riscriverla falserebbe la
prova.

## Gate geografico: residuo dichiarato

Il gate sullo store non italiano non è verificabile in Development. Il paese
dell'indirizzo del dev store è vincolato all'entità commerciale dell'account
Shopify: cambiarlo creerebbe una nuova entità e scollegherebbe i negozi
esistenti. La prova è stata quindi fermata prima di applicarla.

Il ramo resta coperto dai test automatici, che verificano disattivazione,
marcatura `blocked_country`, fail-open sull'errore di disattivazione e mancata
riattivazione al rientro in Italia. Il rischio residuo è accettato e registrato
nel Master Plan Open items §34.7.
