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

## Non eseguito

Gate live che richiedono azioni sul dev store e non sono automatizzabili da qui:
reinstallazione completa, scadenza reale del token offline con refresh e store
con indirizzo non italiano.
