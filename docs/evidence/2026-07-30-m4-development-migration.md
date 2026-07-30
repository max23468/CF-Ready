# Migrazione D1 Development M4

**Data:** 30 luglio 2026 · **Ambiente:** Development · **Operazione:** sola
migrazione D1, senza deploy del Worker e senza modifiche allo snapshot Shopify.

## Preflight

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

## Applicazione e readback

`wrangler d1 migrations apply DB --remote` ha eseguito 5 comandi. Il readback su
`sqlite_master` ha restituito le tabelle `app_state`, `app_events`,
`webhook_events` e l'indice `app_events_shop_id_occurred_at_idx`.

I dati preesistenti sono intatti: 1 riga in `shops`, 1 in `shopify_sessions`,
0 in `app_state`.

## Rollback

`DROP TABLE app_state`, `app_events`, `webhook_events` e la riga corrispondente
in `d1_migrations`. Nessun dato applicativo verrebbe perso. Il ripristino Time
Travel al bookmark registrato sopra resta la rete per corruzione o perdita, non
il rollback ordinario di questo schema.

## Non eseguito

- deploy del Worker Development con il codice M4;
- `shopify app deploy` per registrare `shop/update` e i topic di compliance;
- gate live M4: reinstallazione, refresh token reale, store non italiano.

Finché il Worker non viene ridistribuito, le tabelle restano vuote e senza
effetto sul comportamento osservabile dell'app.
