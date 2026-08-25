# Contratti tecnici M4

Questo documento fissa i contratti introdotti da M4 — dati, autenticazione e
lifecycle — perché M5 e M6 li riusino invece di reinventarli. Non estende il
perimetro della 1.0 e non sostituisce il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md), che resta canonico
per requisiti e decisioni. Il codice è la fonte del comportamento: se diverge,
si corregge nella stessa modifica il documento coinvolto.

## Stato tecnico in D1

Le tabelle sono create dalla milestone che le usa. M4 aggiunge `app_state`,
`webhook_events` e `app_events` con la migrazione `0003`; la forward migration
`0008` aggiunge proprietà del claim e chiave webhook degli eventi.

`app_state`, una riga per store, è lo stato normalizzato per la UI, non la
verità: Shopify resta autorevole per Validation e configurazione.

| Campo | Significato |
| --- | --- |
| `validation_gid` | Validation CF Ready osservata, `NULL` se assente |
| `validation_enabled` | stato osservato all'ultima riconciliazione |
| `config_schema_version` | `schemaVersion` letto dal metafield, `NULL` se non numerico |
| `config_hash` | SHA-256 del JSON canonico del metafield |
| `last_sync_at` | istante dell'ultima riconciliazione |
| `last_error_code` | codice stabile dell'ultimo esito non pulito, `NULL` se pulito |

Le colonne di onboarding descritte nel Master Plan §12.2 arrivano con M6.

`config_hash` serve al controllo ottimistico delle modifiche concorrenti. È
calcolato su un JSON canonico, con chiavi ordinate ricorsivamente: una
riscrittura dei campi da parte di Shopify non deve sembrare un conflitto.

## Ciclo di vita di un webhook

Ogni endpoint segue lo stesso percorso: `authenticateWebhook` valida con la
Shopify API l'HMAC sui byte originali, senza caricare o rinnovare la sessione
offline dello store, poi `handleWebhook` gestisce ricevuta ed esito. Questo
confine è necessario soprattutto dopo `app/uninstalled`: Shopify ha già
revocato il token, ma la consegna firmata deve continuare a essere accettata.

1. `claimWebhook` inserisce la ricevuta in `webhook_events` con stato
   `processing`. Se l'ID esiste già, la ricevuta viene riacquisita se era
   `failed` o se resta `processing` per almeno cinque minuti. Un claim ancora
   attivo risponde `500`, così Shopify continua a ritentare; solo un duplicato
   già `processed` riceve `200` senza rielaborazione.
2. Acquisito il claim, il Worker pubblica un messaggio minimizzato su Cloudflare
   Queues e risponde `200` solo dopo l'accettazione durevole. Il messaggio
   contiene ID webhook, token del claim, dominio dello store necessario ai retry
   dopo l'anonimizzazione D1 e, per `APP_SCOPES_UPDATE`, i soli scope tecnici.
   Non contiene il payload. Il consumer esegue l'handler e ritenta fino a cinque
   volte gli errori transitori, poi consegna il messaggio alla failure queue.
   Le prime due consegne rieseguono l'handler con 60 secondi di attesa, così un
   lock Validation può scadere; dalla terza la ricevuta passa a `failed` con un
   codice stabile e registra `webhook_failed`. Se D1 non accetta la
   finalizzazione, la failure queue ritenta e infine rimanda il messaggio alla
   coda primaria invece di eliminarlo.
   Finché l'handler gira, un heartbeat rinnova `received_at`: un replay può
   riacquisire il claim soltanto dopo che il proprietario ha davvero smesso di
   avanzare.
3. Claim ed esito condividono un token: soltanto il proprietario corrente può
   portare la ricevuta a `processed` o `failed`. Per `APP_UNINSTALLED` il claim
   conserva anche l'inizio del ciclo di installazione, quindi un replay non può
   disinstallare né cancellare le sessioni di una reinstallazione successiva.
   Stato, sessioni ed evento `app_uninstalled` cambiano nello stesso batch: una
   scrittura di sessione concorrente viene quindi completata prima della
   disinstallazione oppure riattiva uno store già `uninstalled`, senza dedurre
   una reinstallazione dalla sola presenza del claim. Le ricevute create prima
   di `0008`, prive del riferimento al ciclo, restano senza ciclo al retry e non
   vengono attribuite in modo distruttivo all'installazione corrente.

La ricevuta conserva `webhook_id`, `shop_domain`, `topic`, stato, timestamp,
token del claim e riferimento tecnico al ciclo di installazione: mai il
payload. `shop/redact` azzera `shop_domain` sulle ricevute dello store invece di
eliminarle, così l'idempotenza dei retry sopravvive alla cancellazione.
Gli eventi prodotti da un webhook conservano lo stesso ID tecnico e sono unici
per nome: riacquisire un claim dopo gli effetti non duplica la telemetria. Per
`shop/redact`, cancellazione dello store, evento `shop_redacted` e anonimizzazione
della ricevuta condividono lo stesso batch. Il retry anonimizza anche una
ricevuta precedente a `0008` se lo store era già stato cancellato, insieme a
tutte le altre ricevute ancora associate allo stesso dominio.

`shop/redact` arriva 48 ore dopo la disinstallazione e Shopify non annulla
l'invio se lo store reinstalla nel frattempo. La cancellazione avviene quindi
solo se l'installazione risulta ancora `uninstalled`: con un'installazione
attiva la richiesta viene presa in carico con `200` e registrata come
`shop_redact_skipped`, senza toccare dati né ricevute. Nessun dato acquirente è
coinvolto, quindi l'obbligo di cancellazione non è in discussione: sarebbe in
discussione la sessione viva di un merchant installato.

Il trigger orario del Worker applica lo stesso percorso di cancellazione agli
store che risultano ancora `uninstalled` dopo 90 giorni. Le ricevute webhook
vengono anonimizzate e sopravvive soltanto il `trial_ledger` pseudonimizzato;
uno store reinstallato non soddisfa la query e non viene toccato. Ogni
esecuzione tratta al massimo 25 store e applica anche le soglie temporali di 90
giorni a ricevute ed errori e di 12 mesi agli altri eventi tecnici e di billing.

Endpoint e topic registrati:

| Endpoint | Topic |
| --- | --- |
| `/webhooks/app/uninstalled` | `app/uninstalled` |
| `/webhooks/app/scopes_update` | `app/scopes_update` |
| `/webhooks/shop/update` | `shop/update` |
| `/webhooks/app/billing` | `app_subscriptions/update`, `app_purchases_one_time/update` |
| `/webhooks/compliance` | `customers/data_request`, `customers/redact`, `shop/redact` |

## Eventi e log

`recordEvent` scrive in `app_events` ed è best effort: un errore di scrittura
non interrompe il lifecycle, viene solo segnalato come `app_event_write_failed`.
Gli eventi di classe `error` e quelli nati da webhook finiscono sempre in
Workers Logs come oggetti JSON strutturati; gli altri eventi sono campionati al
10%. Ogni record di log riceve un `correlation_id`, ma non lo shop domain.
`webhook_id` è valorizzato soltanto dagli endpoint webhook, deduplica i retry
dello stesso evento e diventa il correlation ID del log senza introdurre
payload o dati merchant.

| Evento | Classe | Quando |
| --- | --- | --- |
| `app_installed` | `lifecycle` | una volta per installazione, fino alla disinstallazione successiva |
| `app_uninstalled` | `lifecycle` | `app/uninstalled` elaborato |
| `shop_updated` | `lifecycle` | `shop/update` riconciliato |
| `shop_update_skipped` | `lifecycle` | `shop/update` senza sessione utilizzabile |
| `compliance_acknowledged` | `lifecycle` | topic `customers/*` presi in carico |
| `shop_redacted` | `lifecycle` | dati dello store eliminati |
| `shop_redact_skipped` | `lifecycle` | `shop/redact` per uno store che ha reinstallato |
| `validation_enabled` / `validation_disabled` | `validation` | scrittura merchant riuscita e verificata |
| `install_reconcile_failed` | `error` | riconciliazione fallita durante l'installazione |
| `webhook_failed` | `error` | handler in errore |

I metadati ammessi sono un'allowlist espressa dal tipo `EventMetadata`:
`topic`, `country_code`, `error_code`, `reason`, `enabled`, `schema_version`,
`pricing_generation`, `correlation_id`. M5 aggiunge gli eventi `trial_started` e
`trial_expired`, di classe `billing`. Non esistono campi liberi: payload, header, token, shop
domain, Codice Fiscale e PEC non sono rappresentabili. Nei log strutturati vale
lo stesso vincolo, e l'id sessione è escluso perché contiene lo shop domain.

## Codici errore stabili

Sono valori chiusi, sicuri da mostrare, da registrare e da confrontare. Non
contengono testo Shopify né dati dello store.

| Codice | Origine |
| --- | --- |
| `unhandled_error` | eccezione non riconosciuta in un webhook |
| `response_<status>` | `Response` lanciata durante un webhook |
| `missing_admin_context` | `shop/update` senza sessione utilizzabile |
| `reconcile_failed` | riconciliazione fallita in `afterAuth` |
| `validation_locked` | lease per store non acquisibile |
| `validation_disable_failed` | disattivazione geografica non riuscita |
| `validation_still_enabled` | readback dopo disattivazione ancora attivo |
| `validation_write_failed` | mutazione merchant rifiutata da Shopify |
| `validation_readback_failed` | readback incoerente dopo una scrittura merchant |

`session_decrypt_failed`, `app_event_write_failed` e `render_failed` esistono
solo come eventi di log, non come stato persistito.

## Riconciliazione e gate geografico

`reconcile(admin, db, shopDomain)` è l'unico punto che allinea Shopify e D1.
Viene invocata a ogni autenticazione completata, all'apertura della Home, su
`shop/update` e dopo un errore di scrittura. Il job orario si limita alla
retention locale e non esegue riconciliazioni con Shopify.

Con la managed installation Shopify non espone un evento di installazione
distinto: `afterAuth` scatta anche al rinnovo del token offline, che avviene
tramite token exchange. `app_installed` è quindi deduplicato — vale una volta
per installazione, finché non arriva una disinstallazione — mentre la
riconciliazione gira a ogni autenticazione, perché è idempotente e costa una
sola query Shopify.

Effetti:

1. legge paese dello store e Validation con il Function handle `cf-ready-validation`;
2. se il paese non è `IT` e la Validation è attiva, la disattiva con lease e
   readback; ogni errore resta fail-open e produce un codice stabile;
3. aggiorna `shops.country_code` e `app_state`.

Transizioni di `installation_status` gestite da M4:

| Da | A | Causa |
| --- | --- | --- |
| `active` | `blocked_country` | paese osservato diverso da `IT` |
| `blocked_country` | `active` | ritorno a `IT`; la Validation **non** viene riattivata |
| qualunque | `uninstalled` | `app/uninstalled` |
| `uninstalled` | `active` | nuova sessione dopo reinstallazione |

Una scrittura di sessione non altera `blocked_country` né `suspended`: solo uno
store `uninstalled` torna `active`. È la regola che impedisce a un refresh
token di annullare il blocco geografico.

## Sessioni cifrate

Il formato persistito è `v2.<iv>.<ciphertext>`, AES-256-GCM con chiave a 32
byte dal secret `SESSION_ENCRYPTION_KEY`. Ogni campo è legato al proprio
contesto come dato addizionale autenticato: id sessione, shop e nome del campo.
Un ciphertext spostato tra sessioni non è quindi utilizzabile.

Una riga non decifrabile — chiave ruotata o record manomesso — non viene mai
accettata: la sessione risulta assente, l'evento `session_decrypt_failed` resta
nei log e Shopify ripete l'autenticazione. La procedura di rotazione è in
[Inventario secret](../runbooks/secret-inventory.md).
