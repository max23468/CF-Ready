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

## Seconda verifica indipendente

Verifica successiva condotta solo in locale: nessuna prova live, nessun
`shopify app dev`, nessuna scrittura Shopify e nessun deploy.

### Prove locali

I log di esecuzione prodotti dalle prove live restano in `.shopify/logs`, che
Git ignora: sono artefatti locali, non versionati. La raccolta contiene 89
esecuzioni reali, di cui 52 a `CHECKOUT_INTERACTION` e 27 a
`CHECKOUT_COMPLETION`. Le esecuzioni Completion pertinenti riportano
`status: success` e `logs: []`, con output completo. Esempio osservato con
`TAX_CREDENTIAL_IT` vuoto:

```json
{
  "operations": [
    {
      "validationAdd": {
        "errors": [
          {
            "message": "Inserisci il Codice Fiscale per completare l’ordine.",
            "target": "$.cart.localizedFields.TAX_CREDENTIAL_IT"
          }
        ]
      }
    }
  ]
}
```

La stessa raccolta contiene le due esecuzioni di controllo con target `$.cart`
e messaggio identico: anche lì Shopify ha ricevuto un output completo e valido.

`npm run test:function` ricompila `dist/function.wasm` dai sorgenti ed esegue
le fixture con `function-runner`, quindi confronta l’output reale del Wasm con
quello atteso: 102 test verdi, apostrofi tipografici e accenti inclusi.

La query di input è stata validata contro lo schema ufficiale della Function
API `2026-07` senza errori.

Molte esecuzioni Interaction ricevono i localized fields già presenti ma
vuoti. Abilitare la validazione a questo step può quindi mostrare errori prima
che il cliente inizi a compilare. I log non permettono invece di ricostruire il
metodo di pagamento usato nelle prove precedenti.

### Ipotesi escluse

| Ipotesi | Perché è esclusa |
| --- | --- |
| Motore, regole, entitlement, geografia o lingua | l’input reale mostra `CHECKOUT_COMPLETION`, `IT` ovunque, config valida ed errore atteso |
| Forma dell’output | `operations[].validationAdd.errors[].message` e `.target` coincidono con l’esempio ufficiale della Function API |
| Serializzazione del messaggio nel Wasm | il Wasm reale emette i caratteri non ASCII intatti, confrontati byte a byte dalle fixture; resta da escludere una sensibilità del rendering con una prova live ASCII |
| Testo, lingua o lunghezza | Shopify non documenta vincoli; i messaggi restano sotto 200 caratteri per costruzione |
| Target globale come soluzione | anche `$.cart`, documentato come errore globale in cima al checkout, non ha reso il messaggio; la sintassi del target localized resta da verificare |
| Coerenza API version, schema, tipi, CLI e bundle | `2026-07` in `shopify.extension.toml` e nella query validata, schema con `poNumber` e `LocalizedField.title`, Shopify CLI 4.5.2, Wasm ricostruito a ogni test |
| Test che non eseguono il Wasm | `tests/default.test.js` chiama `buildFunction` e `runFunction`, non il sorgente TypeScript |
| `blockOnFailure` | Shopify documenta che gli errori di validazione bloccano sempre e che il campo governa solo le eccezioni runtime |

### Incoerenza nelle fonti Shopify

Le fonti ufficiali correnti indicano tre forme diverse per il target di un
localized field:

| Forma | Fonte |
| --- | --- |
| `$.cart.localizedFields.TAX_CREDENTIAL_USE_MX` | esempio della [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/2026-07/cart-and-checkout-validation) |
| `$.cart.localizedfield.key` | tabella “Supported checkout field targets” della stessa pagina |
| `$.cart.localizedField.${taxIdField.key}` | esempio della [Localized Fields API](https://shopify.dev/docs/api/checkout-ui-extensions/2026-07/target-apis/checkout-apis/localized-fields-api) |

CF Ready usa la prima, cioè quella dell’esempio ufficiale della Function API.
Le altre due, entrambe al singolare, provengono dalle fonti che descrivono il
lato rendering. La variante al singolare non è mai stata provata sul dev store.

### Difetti Shopify già riconosciuti della stessa classe

- [Errori Completion inghiottiti nella review con conferma ordine](https://community.shopify.dev/t/bug-cart-validation-functions-two-issues-blocking-migration-from-usebuyerjourneyintercept/31931):
  target `$.cart`, blocco applicato e messaggio presente nella risposta ma
  assente nella UI; Shopify ha confermato il bug il 9 marzo 2026. Lo stato della
  conferma ordine durante le prove CF Ready non è ancora stato registrato.
- [Errori non mostrati nel checkout accelerato Google Pay](https://community.shopify.dev/t/cart-and-checkout-validation-error-messages-not-displaying-during-google-pay-accelerated-checkout/23544):
  target `$.cart`, blocco applicato e messaggio assente; Shopify ha confermato
  il bug il 7 ottobre 2025.
- [Errori non mostrati su indirizzi precompilati per clienti autenticati](https://community.shopify.dev/t/cart-checkout-validation-error-message-not-showing-for-deliveryaddress-logged-in-users/32643):
  Shopify lo ha classificato come limite di piattaforma il 27 marzo 2026.

### Prove live ancora da eseguire

Le prove, il loro ordine, i rollback e i criteri di stop sono definiti nel
[piano di indagine](../plans/2026-07-29-checkout-validation-rendering-investigation.md).
Includono:

1. checkout standard guest con conferma ordine ON/OFF;
2. messaggio ASCII;
3. target localized al singolare nelle due forme documentate;
4. `CHECKOUT_INTERACTION` mantenendo Completion come gate finale;
5. Function minimale generata dalla CLI;
6. registrazione di layout, autenticazione, ingresso e metodo di pagamento.

## Conclusione

Il motore CF Ready, la configurazione, la forma dell’output e l’attivazione
sono esclusi come causa, ora anche sulla base dei log di esecuzione reali.
Restano da isolare sintassi del target, timing, configurazione della review e
superficie checkout. Non viene introdotta una Checkout UI Extension come
workaround perché non coprirebbe uniformemente i piani supportati; il gate
richiede il completamento del piano di indagine e, se non emerge una soluzione
accettabile, l’escalation a Shopify.

La Validation è stata disattivata al termine delle prove.
