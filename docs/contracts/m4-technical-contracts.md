# Contratti tecnici M4

Questo documento fissa i contratti introdotti da M4 — dati, autenticazione e
lifecycle — perché M5 e M6 li riusino invece di reinventarli. Non estende il
perimetro della 1.0 e non sostituisce il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md), che resta canonico
per requisiti e decisioni. Il codice è la fonte del comportamento: se diverge,
si corregge nella stessa modifica il documento coinvolto.

## Stato tecnico in D1

Le tabelle sono create dalla milestone che le usa. M4 aggiunge `app_state`,
`webhook_events` e `app_events` con la migrazione `0003`.

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

Ogni endpoint segue lo stesso percorso: `authenticate.webhook` valida l'HMAC
sui byte originali, poi `handleWebhook` gestisce ricevuta ed esito.

1. `claimWebhook` inserisce la ricevuta in `webhook_events` con stato
   `processing`. Se l'ID esiste già, la ricevuta viene riacquisita solo se era
   `failed`: un duplicato di un webhook `processing` o `processed` esce subito
   con `200` senza rielaborare, un retry Shopify dopo un errore viene invece
   rielaborato.
2. L'handler gira. Un errore porta la ricevuta a `failed` con un codice
   stabile, registra `webhook_failed` e risponde `500`, così Shopify ritenta.
3. L'esito pulito porta la ricevuta a `processed`.

La ricevuta conserva `webhook_id`, `shop_domain`, `topic`, stato e timestamp:
mai il payload. `shop/redact` azzera `shop_domain` sulle ricevute dello store
invece di eliminarle, così l'idempotenza dei retry sopravvive alla
cancellazione.

`shop/redact` arriva 48 ore dopo la disinstallazione e Shopify non annulla
l'invio se lo store reinstalla nel frattempo. La cancellazione avviene quindi
solo se l'installazione risulta ancora `uninstalled`: con un'installazione
attiva la richiesta viene presa in carico con `200` e registrata come
`shop_redact_skipped`, senza toccare dati né ricevute. Nessun dato acquirente è
coinvolto, quindi l'obbligo di cancellazione non è in discussione: sarebbe in
discussione la sessione viva di un merchant installato.

Endpoint e topic registrati:

| Endpoint | Topic |
| --- | --- |
| `/webhooks/app/uninstalled` | `app/uninstalled` |
| `/webhooks/app/scopes_update` | `app/scopes_update` |
| `/webhooks/shop/update` | `shop/update` |
| `/webhooks/compliance` | `customers/data_request`, `customers/redact`, `shop/redact` |

I topic billing sono registrati da M5 insieme alla logica che li consuma.

## Eventi e log

`recordEvent` scrive in `app_events` ed è best effort: un errore di scrittura
non interrompe il lifecycle, viene solo segnalato come `app_event_write_failed`.
Gli eventi di classe `error` finiscono anche in Workers Logs come JSON.

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
| `response_<status>` | `Response` lanciata durante un webhook, per esempio `response_409` per Validation duplicate |
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
`shop/update` e dopo un errore di scrittura. Non esistono job periodici.

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
