# Checkout Validation — rendering degli errori

**Data:** 29 luglio 2026

**Store:** `cf-ready-dev.myshopify.com`

## Esito

La Cart and Checkout Validation Function blocca correttamente il completamento
quando `TAX_CREDENTIAL_IT` è vuoto, ma il checkout ospitato non mostra il
messaggio restituito: il contenitore accessibile `alert` resta vuoto.

Il comportamento è stato riprodotto con:

- Function API `2026-07` e `2026-04`;
- target `$.cart.localizedFields.TAX_CREDENTIAL_IT` e, come controllo,
  `$.cart`;
- checkout nuovi;
- tema pubblicato e anteprima tema.

In ogni variante Shopify ha eseguito la Function a `CHECKOUT_COMPLETION`, ha
ricevuto un `validationAdd` con il messaggio atteso e ha impedito la creazione
dell’ordine. Un Codice Fiscale valido ha invece completato il checkout.

## Conclusione

Il motore CF Ready, la configurazione, il target documentato e l’attivazione
sono esclusi come causa. La parte ancora aperta è il rendering del messaggio da
parte del checkout Shopify. Non viene introdotta una Checkout UI Extension come
workaround perché è fuori perimetro; il gate richiede escalation a Shopify e
una nuova prova live dopo la risposta o una correzione della piattaforma.

La Validation è stata disattivata al termine delle prove.
