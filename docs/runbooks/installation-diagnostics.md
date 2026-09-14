# Diagnosi di apertura, onboarding e disinstallazione

Decisione owner del 14 settembre 2026: distinguere una prima apertura dell'app,
l'ingresso nell'onboarding anche senza superare il passo 1 e l'avanzamento già
registrato. Mostrare inoltre il motivo e l'eventuale commento della
disinstallazione inseriti nel modulo nativo Shopify, senza contattare il merchant.

## Rilevazioni

`InstallationReporter` segnala il componente montato e visibile nelle pagine
merchant. OAuth, webhook, loader, prefetch e route tecniche non sono aperture.
La fetch same-origin viene autenticata da App Bridge; il server riusa
`authenticateAdmin` e ricava lo store esclusivamente dalla sessione verificata.
L'endpoint accetta soltanto `app_opened` e `onboarding_started`, senza body.
Il timestamp di installazione letto dal loader impedisce a una scheda precedente
alla reinstallazione di aggiornare la nuova installazione.

D1 registra una volta per installazione la prima apertura e il primo ingresso
nell'onboarding. L'accesso diretto all'onboarding registra anche l'apertura
applicativa, senza cambiare lo stato o il passo del wizard, attivare la Validation
o avviare una prova. Eventi e riepilogo sono scritti nello stesso batch atomico.
Non partono notifiche aggiuntive per ogni visita.

Le date indicano la prima rilevazione ricevuta dal server, non il tempo di lettura
della schermata. Un segnale assente non dimostra che la schermata non sia stata
aperta: JavaScript, autenticazione o trasporto possono fallire. `/shop` usa
"Non rilevata" oppure "Dato storico non disponibile" per le installazioni
precedenti all'introduzione della raccolta. Nessun backfill inventa aperture.

## Motivo e commento Shopify

Il poll Partner richiede `reason` e `description` sul tipo
`RelationshipUninstalled`. I campi vengono salvati prima della deduplicazione:
un webhook locale che abbia già prodotto la notifica non fa perdere il commento.
Le notifiche ancora pending vengono arricchite; quelle già inviate non sono
reinviate né modificate. Il dettaglio `/shop` mostra il feedback disponibile.

Per gli store disinstallati `/shop` può rileggerlo anche oltre il replay ordinario
delle ultime 24 ore. La ricerca è limitata all'installazione corrente e alla
finestra da un giorno prima della ricezione della disinstallazione fino a cinque
minuti dopo; verifica il dominio tecnico dello store e tutte le pagine restituite,
fino a cinque pagine da 100 eventi. Una lettura troncata o fallita resta "non
verificata", non diventa "nessun commento". La cache positiva dura cinque minuti;
"Aggiorna dettaglio" forza la rilettura. Il dettaglio richiede ancora che il record
dello store non sia stato cancellato.

`null` o testo vuoto in una risposta valida significano nessun motivo/commento
fornito. Campi mancanti o di tipo errato non provano che il merchant abbia lasciato
vuoto il modulo. Una risposta fallita conserva l'ultima lettura riuscita e ne
indica il mancato aggiornamento.

## Dati e ciclo di vita

La migrazione `0024_installation_diagnostics.sql` aggiunge due piccole tabelle,
una riga per installazione corrente dello store, e il limite temporale della
raccolta. La disinstallazione conserva i dati per la diagnosi; una reinstallazione
azzera i riepiloghi. `shop/redact` e la retention dello store li cancellano tramite
foreign key con `ON DELETE CASCADE`. Un replay non ricrea uno store cancellato.

Il commento è testo libero del merchant: viene mostrato soltanto nel Control
Center e nelle notifiche private dell'owner, su sua richiesta. Vengono rimossi
caratteri di controllo e direzioni invisibili, limitando motivo e commento a 300
e 1200 caratteri. Il testo non è interpretato come markup e non va copiato in
log, analytics, fixture, issue o repository pubblici. Questa normalizzazione
non è un anonimizzatore: eventuali dati personali scritti nel commento restano
contenuto riservato e seguono la stessa cancellazione dello store.

Non si aggiungono provider, dipendenze, scope Shopify, letture di ordini/clienti
o modifiche al checkout e al billing.

## Verifica e rilascio

Applicare la migrazione prima del Worker. Pubblicazione e prove su provider
richiedono l'autorizzazione prevista da `AGENTS.md`; la presenza del codice in un
branch o in una PR non significa che il bot Production sia già aggiornato.

```sh
npm test -- tests/installation-diagnostics.test.ts tests/owner-control.test.ts tests/owner-notifications.test.ts
npm run test:ui -- tests/browser/installation-reporter.test.tsx
npm run check
npm run coverage:check
```

I test mirati coprono la prima schermata, retry e concorrenza, disinstallazione,
reinstallazione, cancellazione, campi nullable e mancanti, recupero storico,
paginazione, deduplicazione e protezione della rotta. Il browser verifica anche
visibilità, StrictMode e retry senza avanzamento nel wizard. I test sintetici
non sostituiscono il collaudo Shopify embedded e Telegram privato dopo il deploy.

Fonti API:
- [RelationshipUninstalled](https://shopify.dev/docs/api/partner/2026-07/objects/RelationshipUninstalled)
- [App.events](https://shopify.dev/docs/api/partner/2026-07/objects/App)
- [Fetch autenticata App Bridge](https://shopify.dev/docs/api/app-home/latest/apis/authentication-and-data/resource-fetching-api)
