# Contratti tecnici M5

Questo documento fissa i contratti commerciali introdotti da M5 — prova,
sottoscrizioni, acquisto una tantum ed entitlement — perché M6 li presenti senza
reinventarli. Estende i [contratti M4](m4-technical-contracts.md), che restano
validi per webhook, eventi e riconciliazione. Il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md) resta canonico per
prezzi e regole commerciali; qui c'è come sono implementate.

## Chi decide cosa

| Informazione | Fonte |
| --- | --- |
| Sottoscrizioni e acquisti attivi | Shopify, letti a ogni riconciliazione |
| Prova, giorni residui e generazione acquisita | D1 |
| Diritto usato dal checkout | metafield della Validation, scritto dalla riconciliazione |
| Periodo pagato dopo una cancellazione | D1, come stato `ending` |

Il diritto non viene mai concesso dal ritorno di un redirect di approvazione:
si rilegge sempre da Shopify. Per la stessa ragione un webhook fuori ordine è
innocuo — conta l'ultimo stato letto, non la sequenza degli avvisi.

## Prova

Parte da sola quando uno store italiano diventa idoneo, senza piano né metodo di
pagamento. Dura quattordici giorni contando il primo, e la scadenza è una data
locale nel fuso dello store: è lo stesso riferimento che la Function confronta
con `shop.localTime.date`, quindi l'ultimo giorno è incluso da entrambe le parti.

| Stato | Significato |
| --- | --- |
| `active` | prova in corso |
| `expired` | scaduta senza pagamento |
| `converted` | il merchant ha pagato prima della scadenza, i giorni residui sono rinunciati |

Uno store non idoneo non crea la riga e quindi non consuma la prova. Una prova
già fruita sopravvive alla cancellazione dei dati in `trial_ledger`, con
l'hash del dominio: dopo un `shop/redact` la reinstallazione la ritrova
esaurita invece di ottenerne una nuova.

## Generazione tariffaria

Acquisita quando lo store diventa idoneo e mai più cambiata, nemmeno passando
fra le modalità. `launch` fino alla fine della finestra di lancio, poi
`balanced`. `value` è un'ipotesi interna: non ha piani configurati, quindi non
è acquistabile per errore.

## Piani

Sei piani, tre per generazione, con i prezzi del Master Plan §14.2. I nomi sono
`<generazione>-<modalità>`, per esempio `launch-annual`. I cambi fra mensile e
annuale usano `STANDARD`, il comportamento nativo Shopify: nessuna proratazione
calcolata dall'app.

Gli addebiti sono di prova finché `BILLING_TEST` non vale `"false"`. La lettura
scarta gli addebiti della modalità diversa da quella corrente: un addebito di
prova non concede il diritto quando l'app addebita davvero.

## Stato commerciale normalizzato

`billing_accounts` è una cache operativa, non la verità.

| Stato | Quando |
| --- | --- |
| `active` | sottoscrizione o acquisto una tantum attivi su Shopify |
| `ending` | sottoscrizione cancellata, periodo pagato non ancora concluso |
| `expired` | periodo concluso senza rinnovo |
| `refunded` | l'acquisto una tantum non risulta più attivo: gli acquisti non scadono, quindi è stato rimborsato per intero |
| `none` | nessun addebito mai osservato |

`current_period_start` resta vuota: Shopify non espone l'inizio del ciclo e un
valore dedotto non va scritto come se fosse osservato.

## Diritto per il checkout

Precedenza, dal più forte:

1. acquisto una tantum attivo → `one_time`, senza scadenza;
2. sottoscrizione `active` o `ending` con periodo non concluso → `subscription`,
   valida fino a fine periodo;
3. prova attiva → `trial`, valida fino all'ultimo giorno;
4. altrimenti `none`, e la Function non blocca più nulla.

Il diritto pagato prevale sulla prova perché i giorni residui sono già dentro la
sottoscrizione come `trialDays`. Alla scadenza non serve alcun job: la Function
confronta la data locale e si spegne da sola, la riconciliazione successiva
allinea il metafield.

## Flussi con effetti commerciali

**Sottoscrizione.** Passa a Shopify solo i giorni di prova residui, oggi
incluso. La prova non riparte e non si accorcia.

**Cancellazione ordinaria.** Nessuna proratazione: lo stato passa a `ending` e
l'accesso resta fino a fine periodo già pagato.

**Passaggio a una tantum.** Nell'ordine: si mostra il prezzo della generazione
acquisita e il credito stimato, si crea l'acquisto, il merchant approva su
Shopify, la riconciliazione verifica che risulti attivo e solo allora cancella
la sottoscrizione con proratazione nativa. Un acquisto abbandonato non arriva
mai allo stato attivo, quindi la cancellazione non parte: l'abbonamento resta
intatto. Se la cancellazione fallisce il diritto è già acquisito e la
riconciliazione successiva riprova.

Un secondo acquisto una tantum viene rifiutato quando ne risulta già uno
attivo: sarebbe un secondo addebito reale.

**Credito stimato.** Canone del ciclo corrente per i giorni residui, diviso la
durata nominale del ciclo. Nessun cumulo storico, nessun giorno di prova, zero a
ciclo concluso. È una stima da mostrare: l'importo effettivo è quello calcolato
da Shopify, e nella fattura l'acquisto può comparire a prezzo pieno con il
credito separato.

## Eventi e codici aggiunti da M5

| Evento | Classe | Quando |
| --- | --- | --- |
| `trial_started` | `billing` | prova avviata, una volta per store |
| `trial_expired` | `billing` | prova scaduta senza pagamento |
| `subscription_cancelled` | `billing` | cancellazione ordinaria richiesta dal merchant |
| `subscription_converted` | `billing` | abbonamento cancellato dopo un acquisto una tantum |
| `billing_updated` | `billing` | webhook billing elaborato |
| `billing_update_skipped` | `billing` | webhook billing senza sessione utilizzabile |

I metadati usano l'allowlist dei contratti M4, estesa con `pricing_generation`.

| Codice | Origine |
| --- | --- |
| `billing_read_failed` | Shopify non raggiungibile: si conserva lo stato noto invece di declassare il merchant |
| `subscription_cancel_failed` | `appSubscriptionCancel` rifiutato o in errore |
| `entitlement_write_failed` | scrittura del diritto nel metafield rifiutata |
| `entitlement_readback_failed` | readback del metafield incoerente con il diritto calcolato |

`billing_events` resta append-only, con vincolo univoco su identificatore
Shopify e tipo evento: registra i cambi di stato e i cambi di addebito, così un
passaggio da mensile ad annuale non passa inosservato solo perché entrambi sono
`active`.
