# Validazione automatica nel checkout

**Data:** 8 settembre 2026

**Ambiente:** Development

**Store:** `cf-ready-dev.myshopify.com`

**App:** CF Ready Development

**Candidato:** `bb9d6cb` (`1.5.0`)

**PR:** [#455](https://github.com/max23468/CF-Ready/pull/455)

## Esito

Il dev preview della Cart and Checkout Validation ha confermato il gate
principale della strategia automatica. Quando un localized field è presente,
Shopify rende a `CHECKOUT_INTERACTION` l'errore restituito sul target specifico
direttamente sotto il campo:

```text
$.cart.localizedField.TAX_CREDENTIAL_IT
$.cart.localizedField.TAX_EMAIL_IT
```

Il checkout guest a pagina singola si è aperto senza banner rosso. Prima della
risoluzione della consegna la Function ha ricevuto `localizedFields` e delivery
group vuoti e non ha restituito errori. Dopo la compilazione di un indirizzo
italiano, Shopify ha materializzato CF e PEC e ha preselezionato l'unica
spedizione `Standard`; il log della Function riportava una delivery group
italiana con `selectedDeliveryOption` presente.

In questo stato il CF obbligatorio vuoto ha mostrato il messaggio required
inline. Un CF non vuoto ma invalido e una PEC facoltativa non vuota ma invalida
hanno mostrato i rispettivi messaggi inline durante Interaction. Con valori
formalmente validi gli errori sono scomparsi e la Function non ha restituito
operazioni di validazione.

## Perimetro e preparazione

Prima della prova sono stati verificati organizzazione Temisfera, app CF Ready
Development e store `cf-ready-dev.myshopify.com`. La configurazione salvata
aveva CF `required_validated`, PEC `optional_validated` e una sola Validation
CF Ready attiva. Il dev preview ha eseguito il bundle Function del candidato
`bb9d6cb` con schema `2026-07`.

Sono stati usati soltanto dati sintetici. Production, billing, configurazioni
commerciali e ordini esistenti non sono stati modificati.

## Matrice osservata live

| Stato | Pagamento selezionato | Esito osservato |
| --- | --- | --- |
| Apertura checkout, indirizzo non risolto | Carta di credito di prova | nessun banner e nessun errore CF/PEC |
| Consegna IT risolta, opzione `Standard` preselezionata, CF vuoto | Carta di credito di prova | required inline sul CF |
| CF `ABC`, PEC vuota | Carta di credito di prova | invalid inline sul CF |
| CF valido, PEC `abc` | Carta di credito di prova | invalid inline sulla PEC |
| CF `ABC`, PEC valida | Deposito bancario | invalid inline sul CF; pulsante `Completa ordine` disponibile dopo la correzione |
| CF vuoto, PEC valida | Deposito bancario | required inline sul CF |
| CF `ABC`, PEC valida | PostePay | invalid inline sul CF; stesso messaggio della carta e del deposito bancario |
| CF vuoto, PEC valida | PostePay | required inline sul CF |
| CF e PEC validi | Deposito bancario | nessun errore; `Completa ordine` attivo |
| CF e PEC validi | PostePay | nessun errore; `Completa ordine` attivo |

I log del dev preview hanno registrato le esecuzioni come
`CHECKOUT_INTERACTION`. Alle 11:56:51 il checkout non aveva ancora localized
fields né consegna risolta e l'output era vuoto. Alle 11:57:15 il CF invalido
ha prodotto il solo target CF. Alle 11:58:23 la PEC invalida ha prodotto il
solo target PEC. Alle 11:59:37 il CF vuoto e la PEC invalida, con consegna
italiana selezionata, hanno prodotto entrambi i target specifici. Alle 12:00:19
i due valori validi hanno prodotto un output senza errori.

La Function non legge il metodo di pagamento. Le tre superfici osservate hanno
quindi attraversato lo stesso algoritmo; il cambio tra carta, deposito
bancario e PostePay non ha introdotto target o messaggi dedicati.

## Limiti della prova

- Il Development store esponeva una sola spedizione, preselezionata da Shopify;
  più opzioni e split delivery group restano coperti dalle fixture server-side.
- PayPal ed express wallet non erano esposti nel checkout osservato.
- È stato osservato il checkout one-page con completamento diretto. La
  configurazione con conferma ordine non è stata cambiata durante questa prova.
- È stato usato un checkout guest. Un cliente autenticato con dati precompilati
  non è stato riprodotto.
- I due pagamenti manuali sono stati portati fino allo stato valido con pulsante
  finale attivo, senza premere `Completa ordine`; non è stato creato un ordine.
  `CHECKOUT_COMPLETION` resta verificato dal bundle e dalle fixture automatiche,
  ma in questa sessione non è stato nuovamente invocato live sui due metodi
  manuali.
- La UI embedded del candidato è stata verificata dai test browser locali. Il
  preview Shopify avviato con `--no-update` ha mantenuto l'URL web del Worker
  Development già distribuito, quindi non costituisce una prova live della
  nuova pagina Regole checkout.

Non sono stati eseguiti merge, deploy Production, transazioni o addebiti.
