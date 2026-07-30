# Rilascio Development M5

**Data:** 30 luglio 2026 · **Ambiente:** Development · **Release:** `0.3.0`.

Ordine seguito: merge del codice, bump di versione, migrazioni D1, deploy del
Worker, snapshot Shopify. Le tabelle nuove non sono referenziate dal Worker
precedente, quindi applicarle prima è sicuro.

## Migrazioni D1

| Voce | Valore |
| --- | --- |
| Database | `cf-ready-db-dev` (`9490eaea-3a12-465d-bb48-e2622b31fc4d`) |
| Migrazioni | `0004_trials`, `0005_trial_ledger`, `0006_billing` |
| Bookmark Time Travel | `00000020-00000000-000050b8-6b94b3e028723b07d94f9ef44acfeaf0` |
| Readback | `trials`, `trial_ledger`, `billing_accounts`, `billing_events` presenti |
| Dati preesistenti | 1 riga in `shops`, 1 in `shopify_sessions`, 1 in `app_state` |

Rollback: `DROP TABLE` delle quattro tabelle e delle righe corrispondenti in
`d1_migrations`. Nessun dato applicativo esistente verrebbe perso.

## Deploy

| Voce | Valore |
| --- | --- |
| Sorgente runtime | `1caabc5` (PR #67 e #68) |
| Versione Worker attiva | `25af30df-4ae1-4f8c-b844-c819412a0e40` |
| Rollback Worker | versione `33331e71-0d5a-475d-90f7-24d3188f0cc8` |
| Versione Shopify attiva | `0.3.0`, `gid://shopify/Version/1070657568769` |
| Rollback Shopify | versione `0.2.1` |
| Workflow | `Deploy Development` run `30562130950` |

Lo snapshot registra il topic `app_subscriptions/update`, aggiunto da M5.

## Smoke

| Prova | Esito |
| --- | --- |
| `GET /` | `302` verso `/auth/login` |
| `POST` sulle cinque rotte webhook senza HMAC | `400`, nessuna elaborazione |

Gli addebiti restano in modalità di prova: `BILLING_TEST` non è valorizzata e il
valore predefinito è `true`. Portarla a `"false"` è una voce del preflight
Production.

## Gate M5 sul dev store

Eseguiti dall'owner il 30 luglio 2026 con addebiti di prova, readback D1 dopo
ogni passaggio.

| Gate | Esito |
| --- | --- |
| Sottoscrizione durante la prova | verde. La pagina di approvazione indicava sei giorni di prova con termine il 5 agosto, cioè i soli giorni residui di una prova retrodatata per rendere il conteggio osservabile. Dopo l'approvazione: `active`/`monthly` fino al 4 settembre, prova `converted`, un solo evento billing da 299 centesimi |
| Cambio mensile → annuale | verde. Approvazione con dicitura di sostituzione dell'abbonamento precedente e nessun giorno di prova; dopo: `annual` con nuovo addebito fino al 30 luglio 2027 e seconda riga distinta in `billing_events` |
| Acquisto abbandonato | verde. Premuto Annulla, abbonamento annuale intatto: addebito, periodo ed eventi invariati |
| Passaggio a una tantum | verde. Acquisto attivo, diritto `one_time` senza scadenza, annuale cancellato solo dopo l'acquisto, terza riga da 8990 centesimi |
| Cancellazione ordinaria | **non eseguito**, residuo dichiarato |

Il diritto non è mai stato concesso dal ritorno del redirect: nel primo gate il
merchant non è nemmeno rientrato nell'app, e lo stato era già corretto perché
proveniva dal webhook e dalla riconciliazione.

### Reinstallazione con pagamento unico attivo

Disinstallazione e reinstallazione hanno restituito lo stesso acquisto
`gid://shopify/AppPurchaseOneTime/3492512048` con la stessa data: Shopify lega
l'acquisto allo store e all'app, non alla singola installazione. Il diritto
sopravvive quindi senza alcun registro applicativo, e §14.11 è soddisfatto dalla
piattaforma. La deduzione del rimborso resta corretta, perché scatta solo quando
l'acquisto sparisce davvero. Dopo la reinstallazione la Validation è stata
riattivata senza riconfigurare nulla, come previsto da FR-076.

### Cancellazione ordinaria: residuo

Il gate non è eseguibile sul dev store: con il pagamento unico attivo non si può
creare un abbonamento, e la guardia che lo impedisce protegge il merchant da un
addebito inutile. L'acquisto non è rimborsabile perché in modalità di prova non
è mai stato pagato, quindi non esiste un modo per tornare a uno stato
sottoscrivibile senza un secondo store.

Il comportamento resta coperto dai test automatici: periodo di grazia `ending`,
accesso fino a fine periodo, scadenza successiva, nessuna proratazione. La
verifica live si sposta al canary M10, dove esiste un abbonamento reale.

### Credito pro rata: verificato a metà

La conversione richiede la proratazione — la cancellazione dell'abbonamento
parte con `prorate: true` e Shopify l'ha accettata — ma l'importo effettivo del
credito non è stato confrontato con la stima mostrata al merchant.

Il caso osservato sarebbe stato il più pulito possibile: l'annuale era stato
attivato lo stesso giorno, quindi il ciclo era interamente non usufruito e la
stima corrispondeva all'intero canone. Su addebiti di prova il credito potrebbe
non essere materializzato, dato che nessun importo è stato mosso.

Resta quindi da confrontare, sul canary M10 insieme alla cancellazione
ordinaria, la stima mostrata con l'importo che Shopify calcola davvero. Il
Master Plan §14.8 già dichiara la stima come tale, quindi il rischio è di
comunicazione, non di diritto: un credito diverso non toglie nulla al merchant.

### Revoca per rimborso: non esercitata

Un rimborso totale revoca il diritto e uno parziale lo conserva, ma il percorso
non è stato provato live: un addebito di prova non è mai stato pagato, quindi
non è rimborsabile. Il comportamento resta coperto dai test, dove un acquisto
che sparisce dagli attivi porta lo stato a `refunded`. La prova reale richiede
un addebito pagato davvero e si sposta con gli altri residui.

### Avvisi di prova

Gli avvisi in app a sette giorni, tre giorni, ultimo giorno e scadenza previsti
da FR-077 non sono implementati: sono microcopy della UI merchant e appartengono
a M6, che consegna la pagina Piano e fatturazione completa.

## Difetti trovati dai gate

Tutti corretti e rilasciati, dalla `0.3.1` alla `0.3.6`.

| Difetto | Perché i test non potevano vederlo |
| --- | --- |
| Il redirect della libreria non sopravvive alla richiesta dentro l'iframe embedded | dipende dal contesto embedded reale |
| `Apps without a public distribution cannot use the Billing API` | configurazione dell'app, non codice |
| Motivo del rifiuto di un addebito invisibile | serviva un rifiuto vero per accorgersene |
| `returnUrl` senza `shop` e `host` | l'errore appare solo al ritorno da Shopify |
| Rivalidazione abortita dal redirect, anche sulla rotta padre | comportamento del router nel browser |
| Piano già attivo riproposto dalla UI | visibile solo con un abbonamento reale attivo |
| Conversione eseguita due volte e contesa sulla lease mostrata come errore | serve la concorrenza reale fra webhook e apertura della Home |
| `app_purchases_one_time/update` non registrato | trovato preparando il gate, non da un test |

## Versioni rilasciate

Development è passata da `0.3.0` a `0.3.6` durante i gate. Stato finale: Worker
`3f120266-a318-4ea9-b6f5-ebc4714b7507`, snapshot Shopify `0.3.6`
(`gid://shopify/Version/1070961688577`).

## Verifica differita

Intorno al 1 agosto 2026 arriva il `shop/redact` programmato dalla
disinstallazione del 30 luglio. Lo store risulta reinstallato, quindi la
richiesta deve essere presa in carico senza cancellare, con evento
`shop_redact_skipped`: è la guardia introdotta in M4, finora provata solo dai
test.
