# M10 — Canary reale Numisleo

Data: 25 agosto 2026.

Target: app CF Ready Production installata su `numisleo.myshopify.com`, store
italiano dell'owner su piano Shopify Basic. Questa ricevuta registra solo gli
esiti osservati e il gap che la `0.9.40` deve correggere prima della chiusura.

## Candidato Production

| Voce | Evidenza |
| --- | --- |
| Versione | `0.9.39` |
| Commit | `15655a60642c33b755900c41d2228696a7044cb1` |
| Deploy | run Production [32781055852](https://github.com/max23468/CF-Ready/actions/runs/32781055852), concluso con successo; gate completo, migrazione `0012_complimentary_entitlements.sql`, Worker, smoke, Shopify e readback verdi |
| Shopify | versione `0.9.39` attiva, ID `1101646659585`, associata allo stesso commit |
| Release | [`v0.9.39`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.39), pubblicata dopo il deploy riuscito |

## Installazione, configurazione e diritto commerciale

Il readback D1 Production ha restituito una sola riga per lo store target, senza
scritture:

| Voce | Esito |
| --- | --- |
| Installazione | `active`, paese `IT` |
| Onboarding | `completed` |
| Validation | attiva; configurazione schema `2` |
| Ultimo errore applicativo | assente |
| Concessione omaggio D-135 | `active` |
| Billing Shopify | entitlement `none`, piano `none`, nessuna charge associata, zero eventi billing |

Il readback manuale in Chrome dell'Admin embedded conferma la stessa semantica:
Validation attiva, Codice Fiscale richiesto, PEC opzionale e piano omaggio
permanente esplicitamente indicato come privo di rinnovi e addebiti. Questo
chiude il criterio commerciale del canary dell'owner; cancellazione, credito pro
rata e rimborso live restano attribuiti al primo merchant pagante di M11.

La stessa Home `0.9.39` invita però ancora a fare un ordine di prova. Il testo è
incompatibile con il criterio non transazionale approvato dall'owner e impedisce
la chiusura al 100% finché la `0.9.40` non viene pubblicata e riletta live.

## Ricognizione checkout in Chrome

È stata inizialmente predisposta una sessione checkout con un prodotto fisico,
consegna in Italia e dati sintetici. Prima dell'invio l'owner ha chiarito che lo
store reale non deve ricevere ordini fake creati soltanto per il test. La
sessione è stata quindi chiusa senza premere il pulsante finale, senza aprire un
provider wallet e senza creare ordini o pagamenti. La predisposizione non è
usata come prova di superamento del gate.

Superfici osservate nel checkout:

- percorso standard e pulsante finale `Completa ordine`;
- Shop Pay;
- PayPal;
- Google Pay;
- tre opzioni di spedizione, senza ritiro in negozio;
- Apple Pay non esposto in Chrome. Shopify lo rende disponibile solo su Safari
  e dispositivi compatibili: la verifica va eseguita nel relativo ambiente.

La ricognizione successiva, eseguita senza entrare in un nuovo checkout, ha
confermato inoltre:

- pagina prodotto: voce dinamica `Altre opzioni di pagamento` disponibile;
- carrello: solo percorso standard `Check-out`, senza pulsanti wallet dedicati;
- checkout: Shop Pay, PayPal e Google Pay esposti;
- footer storefront: Visa, Mastercard, PayPal, Apple Pay, Google Pay e Shop Pay
  dichiarati come metodi accettati.

La presenza delle superfici prova soltanto la configurazione commerciale e la
raggiungibilità del checkout. Il blocco server-side è dimostrato dalle fixture
automatiche della Function; sul canary si osservano passivamente solo ordini
autentici eventualmente ricevuti.

Riferimenti Shopify:

- [Cart and Checkout Validation](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation), inclusa l'applicazione agli express checkout;
- [accelerated checkout buttons](https://help.shopify.com/en/manual/online-store/dynamic-checkout), la cui disponibilità dipende anche da browser e configurazione pagamenti;
- [Apple Pay](https://help.shopify.com/en/manual/payments/accelerated-checkouts/apple-pay), disponibile su Safari e dispositivi compatibili.

## Prodotti e selling plan disponibili

Una query Admin GraphQL validata sullo schema corrente ha restituito zero
selling plan group. Una lettura paginata dei primi 2.500 prodotti attivi ha
trovato soltanto varianti che richiedono spedizione; il campione non prova
l'assenza assoluta di prodotti digitali nell'intero catalogo, ma non fornisce
alcuna fixture digitale controllata. Non sono stati creati o modificati
prodotti, selling plan o configurazioni di ritiro sullo store reale.

Di conseguenza non sono oggi eseguibili senza preparare fixture commerciali
esplicite:

- prodotto digitale;
- ordine misto fisico/digitale;
- checkout iniziale in abbonamento;
- ritiro in negozio.

## Prova server-side e monitoraggio

`npm run test:function` sull'HEAD Production `0.9.39` ha concluso con 109 test
verdi. Le fixture coprono consegna italiana, fatturazione e destinazioni estere,
checkout senza spedizione, ritiro senza indirizzo, ordine misto ed entitlement
in abbonamento. La Function non distingue il provider di pagamento: Shopify la
applica al checkout standard e agli express checkout, perciò la stessa regola
server-side copre i wallet.

Il readback D1 dal 24 agosto 2026 ha restituito, per Numisleo:

- zero eventi applicativi di classe `error`;
- zero webhook falliti;
- zero notifiche owner fallite;
- nessun `last_error_code` nello stato dell'app.

## Esito del gate prima della `0.9.40`

Sono già verdi:

- installazione, piano Shopify Basic, Validation e configurazione sono state
  verificate live;
- la concessione omaggio soddisfa il diritto commerciale senza charge o
  rinnovi;
- la matrice server-side è verde sull'HEAD Production;
- le superfici storefront disponibili sono state ricognite senza transazioni;
- il monitoraggio non mostra errori critici.

Resta bloccante il readback live della Home `0.9.40` senza invito a creare un
ordine di prova. Fino ad allora M10 è in chiusura, non completata.

Restano osservazioni non bloccanti, da acquisire solo quando l'ambiente o il
traffico reale le rende disponibili:

- Apple Pay su Safari/dispositivo compatibile;
- primi ordini autentici idonei ricevuti dal merchant;
- prodotto digitale, ordine misto, ritiro e abbonamento, se introdotti dallo
  store per esigenze commerciali reali.
