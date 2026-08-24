# M10 — Canary reale Numisleo

Data: 25 agosto 2026.

Target: app CF Ready Production installata su `numisleo.myshopify.com`, store
italiano dell'owner su piano Shopify Basic. Questa ricevuta registra gli esiti
osservati che chiudono M10.

## Candidato Production

| Voce | Evidenza |
| --- | --- |
| Versione | `0.9.40` |
| Commit | `bd80fb745c1bfab83dfbf730142e83e3b7da3777`, merge commit a due parent della promozione [#314](https://github.com/max23468/CF-Ready/pull/314) |
| Deploy | run Production [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670), concluso con successo; gate completo, preflight, D1, Worker, smoke, Shopify e readback verdi |
| Worker | deployment `21f591be-4d20-4722-98b7-e66ed9b74755`, versione `dbc15dfb-3d8c-4d73-961b-8de3e6601094`, 100% del traffico e commit verificato |
| Shopify | versione `0.9.40` attiva, ID `1101700857857`, associata allo stesso commit |
| Release | [`v0.9.40`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.40), pubblicata sul commit candidato dopo deploy, smoke e readback riusciti |

## Installazione, configurazione e diritto commerciale

Il readback D1 Production successivo al deploy ha restituito una sola riga per
lo store target, senza scritture:

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

Il readback manuale finale in Chrome, dopo il deploy della `0.9.40`, ha ricaricato
la Home Production nell'Admin reale e ha osservato il testo «Controlla i prossimi
ordini per verificare che le regole siano applicate come previsto.». Non resta
alcun invito a creare una transazione appositamente per il test.

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

`npm run test:function` sull'HEAD Production `0.9.40` ha concluso con 109 test
verdi. Le fixture coprono consegna italiana, fatturazione e destinazioni estere,
checkout senza spedizione, ritiro senza indirizzo, ordine misto ed entitlement
in abbonamento. La Function non distingue il provider di pagamento: Shopify la
applica al checkout standard e agli express checkout, perciò la stessa regola
server-side copre i wallet.

Il readback D1 ripetuto dopo il deploy della `0.9.40` ha restituito, per
Numisleo:

- zero eventi applicativi di classe `error`;
- zero webhook falliti;
- zero notifiche owner fallite;
- nessun `last_error_code` nello stato dell'app.

## Esito finale del gate

Sono verdi:

- installazione, piano Shopify Basic, Validation e configurazione sono state
  verificate live;
- la concessione omaggio soddisfa il diritto commerciale senza charge o
  rinnovi;
- la matrice server-side è verde sull'HEAD Production;
- le superfici storefront disponibili sono state ricognite senza transazioni;
- il monitoraggio non mostra errori critici;
- deploy e release `0.9.40` sono associati allo stesso commit;
- il readback live in Chrome conferma il testo generico sui prossimi ordini.

M10 è completata il 25 agosto 2026. Non sono stati creati ordini, clienti,
prodotti, selling plan o pagamenti per chiudere il gate.

Restano osservazioni non bloccanti, da acquisire solo quando l'ambiente o il
traffico reale le rende disponibili:

- Apple Pay su Safari/dispositivo compatibile;
- primi ordini autentici idonei ricevuti dal merchant;
- prodotto digitale, ordine misto, ritiro e abbonamento, se introdotti dallo
  store per esigenze commerciali reali.
