# Riconciliazione finanziaria billing

Questo runbook separa quattro fatti che non sono intercambiabili:

1. il contratto e il diritto letti dalla Shopify Admin API;
2. la vendita o la rettifica osservata nella Shopify Partner API;
3. l'incasso della fattura merchant;
4. il payout liquidato al Partner.

Il Control Center automatizza i primi due fatti. Incasso e payout richiedono la
verifica manuale nel Partner Dashboard. Una vendita Partner osservata non basta
da sola a dichiarare riscossa la fattura o liquidato il payout.

La riconciliazione considera una vendita dovuta soltanto quando il ciclo pagato
è iniziato. Un abbonamento ancora in prova compare come `Non ancora dovuta`, non
come vendita mancante. `In attesa della transazione Shopify` indica invece un
ciclo iniziato per cui la Partner API non espone ancora una vendita abbinabile.
Il comando `Aggiorna` della vista Billing forza una nuova lettura finanziaria
prima di ricostruire il riepilogo.

## Riconciliazione ordinaria

1. Identificare lo store e il charge ID senza copiare dati personali nei log.
2. Leggere contratto, stato `test`, ciclo corrente e diritto dalla Admin API.
3. Confrontare vendita o rettifica Partner per charge ID, tipo, importo, valuta
   e data. Un dato incompatibile resta `needs_review`.
4. Aprire Partner Dashboard, cercare lo store e verificare i dettagli della
   charge e della fattura merchant.
5. Aprire **Payouts**, selezionare il periodo e verificare stato, line item,
   commissioni e payout. Se serve, esportare il CSV del payout.
6. Registrare nella ricevuta operativa: charge ID, prova dell'incasso, eventuali
   crediti o rettifiche, importo e valuta, stato payout, operatore e timestamp.
7. Se una prova non è disponibile o i dati divergono, non dedurre lo stato e
   lasciare aperto l'incidente owner.

La Partner API espone transazioni come `AppSubscriptionSale` e
`AppOneTimeSale`; il relativo importo netto è destinato al payout, ma la prova
autorevole dello stato del payout resta il dettaglio in Partner Dashboard.

## Diritto non sincronizzato nel checkout

L'alert `Diritto non sincronizzato nel checkout` indica che il ciclo periodico
ha letto il billing ma Shopify non ha accettato o confermato il diritto nel
metafield della Validation (D-160). Finché resta aperto, la Function può essere
fail-open anche per un merchant pagante.

1. Controllare nella vista store del Control Center stato della Validation ed
   errore aperto; l'alert riporta l'ultimo tentativo di riconciliazione.
2. Il ciclo riprova ogni ora; l'alert si chiude da solo al primo tentativo
   riuscito.
3. Se persiste, verificare sessione offline, lock della Validation e presenza di
   Validation duplicate, senza modificare risorse di altre app.

## Rimborso o credito manuale

CF Ready non emette rimborsi o crediti automatici.

Prima di qualunque rimborso parziale:

1. verificare nella charge e nei Payouts se Shopify ha già applicato un credito
   pro-rata o una rettifica, così da evitare un doppio beneficio;
2. confermare che la charge sia stata pagata. Shopify consente il rimborso solo
   per charge pagate; per una charge non pagata va usato un credito;
3. verificare saldo residuo, valuta e limiti temporali applicabili;
4. considerare che Shopify non restituisce la commissione di elaborazione;
5. annotare l'esito e chiedere al merchant di verificare la propria fattura,
   perché Shopify non invia una notifica automatica dell'esito del rimborso.

Se pagamento, rettifica preesistente o payout non sono verificabili, fermarsi:
non emettere né rimborso né credito finché il Partner Dashboard o Shopify
Support non forniscono una prova sufficiente.

## Conversioni storiche

Una conversione pregressa ricostruita da acquisto una tantum attivo e
sottoscrizione cancellata viene registrata come `historical_reconciliation` e
`needs_review`. Non prova una cancellazione ordinaria richiesta dall'app, non
crea un credito retroattivo e non viene confermata automaticamente. Si chiude
solo dopo la riconciliazione manuale descritta sopra.

## Fonti Shopify

- [Refund app charges](https://shopify.dev/docs/apps/launch/billing/billing-adjustments/refund-app-charges)
- [Award app credits](https://shopify.dev/docs/apps/launch/billing/billing-adjustments/award-app-credits)
- [Manage your payouts](https://help.shopify.com/en/partners/manage-account/manage-payouts-invoices/payouts)
- [Manage invoices](https://help.shopify.com/en/partners/manage-account/manage-payouts-invoices/invoices)
- [AppOneTimeSale nella Partner API](https://shopify.dev/docs/api/partner/latest/objects/AppOneTimeSale)
