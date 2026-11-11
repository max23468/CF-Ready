# Billing e pricing

Shopify Billing è autorevole per sottoscrizioni e acquisti; D1 per la prova. La
gestione delle eccezioni finanziarie è nel
[runbook di riconciliazione](../runbooks/billing-financial-reconciliation.md).

## Requisiti

**FR-070** — Trial completo di 14 giorni senza piano o metodo di pagamento iniziale.

**FR-071** — Trial unico per store.

**FR-072** — Il giorno iniziale è il giorno 1 e l’accesso resta valido fino alle 23:59 del giorno 14 nel fuso dello store.

**FR-073** — Durante il trial tutte le funzioni sono disponibili.

**FR-074** — Se viene scelto mensile o annuale durante il trial, passare a Shopify solo i giorni residui, anche dopo un piano già approvato e poi disdetto o cambiato entro la fine della prova.

**FR-075** — L’acquisto una tantum richiede approvazione immediata e non ha una seconda prova.

**FR-076** — A trial scaduto senza piano:

- la Function non blocca più;
- configurazione e messaggi restano salvati;
- la Home chiede di scegliere un piano;
- il pagamento riattiva senza riconfigurare.

**FR-077** — Avvisi trial solo in app a 7 giorni, 3 giorni, ultimo giorno e scadenza.

**FR-078** — Nessuna email automatica di trial.

**FR-079** — Passaggi mensile/annuale seguono Shopify `STANDARD`.

**FR-080** — Cancellazione ordinaria: accesso fino a fine periodo, senza pro-rata.

**FR-081** — Passaggio a una tantum:

1. mostra prezzo, periodo residuo, credito stimato e costo economico netto stimato;
2. crea acquisto una tantum al prezzo dell’offerta assegnata allo store (FR-086);
3. aspetta approvazione;
4. verifica l’acquisto;
5. cancella l’abbonamento con proratazione nativa;
6. registra entitlement una tantum.

**FR-082** — Nessun credito storico; solo quota residua del ciclo in corso.

**FR-083** — Acquisto abbandonato o rifiutato non cancella l’abbonamento.

**FR-084** — Rimborso completo una tantum revoca entitlement; rimborso parziale lo mantiene salvo accordo diverso.

**FR-085** — Shopify Billing è fonte autorevole; D1 viene riconciliato.

**FR-086** — Il pagamento unico si vende solo su richiesta (D-221). L’owner
concorda il prezzo con il merchant e lo assegna allo store con `/lifetime` nel
Control Center; l’offerta resta valida finché non la revoca. Solo lo store con
un’offerta attiva vede il pagamento unico e il suo prezzo; gli altri vedono
l’invito a richiederla al supporto. Senza offerta l’app non crea l’acquisto.

## Modello

Tutte le funzionalità sono uguali per tutti i piani commerciali:

- nessun limite ordini;
- nessun piano Free;
- nessuna differenza Basic/Pro;
- nessuna funzione riservata a Shopify Plus;
- prova comune di 14 giorni;
- mensile o annuale; pagamento unico su richiesta (FR-086).

L’inclusione di un acquisto una tantum richiede Manual Pricing tramite Shopify Billing API. Non mescolare Shopify App Pricing e Billing API manuale.
Il 10 novembre 2026 l’owner ha valutato e respinto la migrazione a Shopify App
Pricing (D-221): prezzi solo in USD, convertiti con l’1,5% di cambio a carico
del merchant o dell’owner, e nessun acquisto una tantum.


## Prezzi

| Generazione | Mensile | Annuale | Una tantum | Uso |
|---|---:|---:|---:|---|
| Launch | €2,99 / 30 giorni | €29,90 / 365 giorni | €89,90 | prove richieste fino al rilascio della 2.8.0 |
| Balanced | €3,99 / 30 giorni | €39,90 / 365 giorni | su richiesta | prove richieste dal rilascio della 2.8.0 |

Codice e fonte dei valori: `app/plans.server.ts`. Gli importi una tantum del
listino restano solo per riconoscere la generazione degli acquisti già fatti:
dal rilascio della 2.8.0 il prezzo è quello dell’offerta (FR-086).

**Valuta.** Tutti gli addebiti sono in euro: l’app li crea con la Billing API
passando `currencyCode: EUR` in `appSubscriptionCreate` e
`appPurchaseOneTimeCreate`, e la valuta dell’addebito è quella che l’app invia.
Non interroghiamo `shopBillingPreferences` e non adeguiamo il prezzo alla valuta
di fatturazione del merchant (D-131). Quattro fatti confermati dal supporto
Shopify il 4 agosto 2026:

- il prezzo in valuta locale è disponibile **solo** tramite Billing API: i piani
  gestiti di Shopify App Pricing hanno un prezzo unico in USD per tutti;
- l’editor dei piani del Partner Dashboard **non ha un campo valuta** e si
  esprime in USD;
- un merchant fatturato in una valuta diversa dall’euro vede in fattura un
  importo convertito da Shopify, quindi diverso da quello annunciato;
- i piani pubblici creati nel Partner Dashboard **non addebitano nessuno**: con
  manual pricing l’addebito nasce solo dalla chiamata dell’app e
  dall’approvazione del merchant sull’URL di conferma.

Dal 28 ottobre 2026 l’App Store e l’admin mostrano ai merchant fatturati in EUR,
e in altre 13 valute, una **stima** dei prezzi USD della listing nella loro
valuta, con il cambio indicato accanto. Chi è fatturato in USD vede ancora i
dollari. La pagina di approvazione mostra invece l’importo esatto in EUR, perché
l’addebito nasce in EUR dalla Billing API
([changelog Shopify](https://shopify.dev/changelog/estimated-local-currency-prices)).

Il controvalore USD della listing è quindi il più piccolo importo che termina
in `,x9` e la cui stima in euro supera l’addebito di almeno lo 0,5%, così la
vetrina non promette mai meno della fattura. Valori al cambio EUR/USD 1,1246 del
5 novembre 2026; si ricalcolano quando il cambio sale oltre il margine o cambia
la generazione in vetrina (D-207):

| Generazione | Mensile | Annuale | In vetrina |
|---|---:|---:|---|
| Launch | $3.39 (≈ €3,01) | $33.89 (≈ €30,14) | fino al rilascio della 2.8.0 |
| Balanced | $4.59 (≈ €4,08) | $45.19 (≈ €40,18) | dal rilascio della 2.8.0 |

Il prezzo esatto in euro resta ripetuto nella descrizione dei piani, che è
dentro *Pricing details* e perciò l’unica area della listing dove i requisiti
4.2.2 e 4.2.3 consentono di indicare importi.

La listing ha due piani pubblici: «Mensile» (`cf-ready-monthly-subscription`,
mensile con opzione annuale, così Shopify mostra il risparmio annuale) e
«Annuale» (`cf-ready-annual-subscription`, solo annuale), entrambi con prova
di 14 giorni. Sono solo vetrina: gli addebiti li crea l’app.

Il pagamento unico non è più un piano della listing. Lo dichiara l’ultima
funzionalità di entrambi i piani, dentro *Pricing details*: «Pagamento unico
disponibile su richiesta» / «One-time payment available on request». Il campo
degli addebiti aggiuntivi resta vuoto, perché Shopify lo mostra come costo extra
del piano.


## Prezzo di lancio

La finestra Launch è partita il **1 settembre 2026** e, invece che il 29
novembre, si chiude con il rilascio Production della 2.8.0 (D-221). Da quel
momento ogni nuova prova riceve la generazione `balanced`
(`NEW_CUSTOMER_GENERATION` in `app/billing/domain.ts`).

Restano al prezzo Launch:

- chi ha richiesto la prova prima del rilascio, fino alla fine naturale dei
  suoi 14 giorni (D-061), e oltre se acquista entro quella data;
- chi ha già un piano Launch, finché esiste continuità commerciale (D-059, D-060).


## Pricing generation acquisita

- registrata quando il merchant richiede la prova;
- materializzata al primo acquisto;
- mantenuta passando tra mensile, annuale e una tantum;
- mantenuta finché esiste continuità commerciale;
- persa dopo cessazione completa e successiva nuova sottoscrizione;
- un acquisto una tantum non perde mai il prezzo o diritto già approvato;
- nessun prezzo viene cambiato retroattivamente.

La lettura degli acquisti una tantum percorre l'intera connessione Shopify:
l'assenza nelle sole transazioni più recenti non dimostra un rimborso. Un
acquisto pendente impedisce di crearne un secondo e protegge la conversione da
una cancellazione ordinaria concorrente.


## Prova comune

1. Lo store apre per la prima volta l’app.
2. Il merchant avvia esplicitamente una prova completa di 14 giorni.
3. Non viene richiesto piano o metodo di pagamento.
4. Il merchant può configurare e attivare la Validation.
5. Può scegliere una modalità in qualsiasi momento.
6. Senza piano approvato, alla scadenza la Function diventa fail-open.
7. Impostazioni e messaggi restano salvati.
8. Un pagamento successivo permette la riattivazione senza riconfigurare.

Nessuna nuova prova dopo disinstallazione/reinstallazione.


## Sottoscrizione durante la prova

Per mensile o annuale:

- creare la sottoscrizione con i soli giorni di prova residui;
- calcolarli dalla fine della prova anche quando è già `converted`: disdire e
  riattivare o cambiare piano prima di quella data non anticipa il primo addebito;
- non riavviare 14 giorni;
- mostrare chiaramente la data di primo addebito;
- al ritorno da Shopify, verificare lo stato prima di concedere entitlement.

Per una tantum:

- l’addebito avviene all’approvazione;
- i giorni residui sono rinunciati;
- non esiste addebito automatico al termine della prova;
- il merchant deve approvare espressamente.


## Cambio mensile e annuale

Usare il replacement behavior Shopify `STANDARD`:

- mensile → annuale: comportamento nativo e approvazione Shopify;
- annuale → mensile: cambio alla fine del periodo già pagato;
- nessun calcolo custom;
- mantenimento della pricing generation.


## Fonti e stato normalizzato

| Informazione | Fonte |
| --- | --- |
| Sottoscrizioni e acquisti attivi | Shopify, letti a ogni riconciliazione |
| Prova e giorni residui | D1 |
| Generazione acquisita | prezzo e valuta dell'addebito Shopify attivo; D1 durante prova e continuità commerciale |
| Diritto usato dal checkout | metafield della Validation, scritto dalla riconciliazione |
| Periodo pagato dopo una cancellazione | D1, come stato `ending` |
| Offerta di pagamento unico | D1 `one_time_offers`, assegnata dall’owner (D-221) |
| Concessione omaggio | D1, assegnazione manuale dell'owner (D-135) |

Il diritto non viene mai concesso dal ritorno di un redirect di approvazione: si
rilegge sempre da Shopify. Un webhook fuori ordine è quindi innocuo, perché conta
l'ultimo stato letto. `billing_accounts` è una cache operativa, non la verità.
`billing_events` è append-only, con un vincolo univoco su identificatore Shopify
e tipo evento.

Precedenza del diritto, dal più forte:

1. acquisto una tantum attivo: `one_time`, senza scadenza;
2. sottoscrizione `active` o `ending` con periodo non concluso: `subscription`,
   valida fino a fine periodo;
3. prova attiva: `trial`, valida fino all'ultimo giorno;
4. altrimenti `none`, e la Function non blocca nulla.

Alla scadenza non serve un job: la Function confronta la data locale e si spegne
da sola. Se Shopify non è raggiungibile (`billing_read_failed`) la cache D1 resta
informativa per la UI, il metafield riceve `none` e la Validation resta
fail-open. Shopify non espone l'inizio del ciclo: `current_period_start` resta
vuota e un valore dedotto non viene scritto come osservato.

## Passaggio a “Pagamento unico”

La logica approvata è credito pro rata del solo ciclo corrente non usufruito, non cumulo storico.

Flusso, solo per uno store con un’offerta attiva (FR-086):

1. mostra il prezzo dell’offerta;
2. legge inizio e fine ciclo corrente;
3. calcola e mostra un credito pro rata stimato;
4. chiarisce che l’acquisto una tantum può apparire a prezzo pieno e il credito separatamente nella fattura Shopify;
5. crea l’acquisto una tantum;
6. il merchant approva su Shopify;
7. l’app verifica `ACTIVE`;
8. solo allora cancella la sottoscrizione con proratazione;
9. riconcilia entrambi gli stati;
10. aggiorna entitlement;
11. in caso di acquisto abbandonato, lascia la sottoscrizione invariata.

La riconciliazione legge anche le sottoscrizioni non attive, conserva stato Shopify e
flag `test`, e nega subito il diritto quando lo stato più recente è `FROZEN`, `EXPIRED`
o `DECLINED`. Lo stato `ending` richiede inoltre una cancellazione ordinaria richiesta
dall'app, confermata da Shopify e legata allo stesso `currentPeriodEnd`: una risorsa
`CANCELLED` esterna o ambigua non inventa accesso residuo. Il Control Center presenta
separatamente diritto, contratto Shopify, addebito di test, vendita Partner osservata e
credito della conversione; fattura merchant riscossa e payout liquidato restano prove
manuali del Partner Dashboard. Il poll finanziario Partner lega ogni vendita al charge
e al ciclo corrente, con un giorno di tolleranza perché la vendita porta un istante UTC e
l'inizio ciclo una data locale dello store; per la conversione conserva una
ricevuta minimizzata con ID tecnico, tipo, importo, valuta e timestamp. Una rettifica
con charge, importo o valuta incompatibili passa a revisione invece di confermare il
credito. Il poll interroga Partner solo quando esiste una voce da osservare e solo dalla
più vecchia: una voce mai controllata dal suo riferimento, una conversione da 400 giorni
prima della richiesta per coprire un ciclo annuale, una voce già controllata dall'ultimo
controllo meno sette giorni di ritardo Partner.
Dopo 37 giorni senza vendita o credito osservabile apre un alert Telegram owner
e lo risolve quando l'osservazione arriva. Il riferimento è l'accettazione o attivazione
Partner e, se successivo, l'inizio del ciclo fatturabile per trial e rinnovi. La prova
gratuita resta quella comune di 14 giorni definita da D-044 e non usa questa finestra
finanziaria come estensione.

La riconciliazione Admin API non dipende dalle notifiche Telegram: il ciclo periodico
seleziona prima i rinnovi dovuti, poi, una sola volta, le righe mai tentate dopo la
migrazione `0026`, quindi gli account obsoleti; `is_test` resta ignoto per chi non ha mai
avuto un addebito e non decide la priorità. Usa la sessione offline, aggiorna anche il
diritto nel metafield della Validation (D-160) e registra tentativo ed errore senza
dedurre lo stato dalle transazioni Partner. Un suo errore non ferma le fasi owner dello
stesso ciclo. Le conversioni storiche ricostruibili da acquisto una tantum attivo
e sottoscrizione cancellata restano `needs_review`; non generano retroattivamente né una
cancellazione ordinaria né un credito.

Dal 30 ottobre 2026, su richiesta dell'owner, il Control Center può registrare
la verifica manuale di una conversione con vendita o rettifica osservata, senza
attendere il payout o la finestra di 37 giorni. Una ricevuta separata conserva
data, riferimenti finanziari e l'eventuale prova del registro eventi; non cambia
lo stato letto dalla Partner API né emette rimborsi. La scheda mostra
«Verificato manualmente» e la conversione non alimenta più gli incidenti e il
conteggio delle verifiche aperte. Il recupero API prosegue senza annullare la
ricevuta. Questa conferma estende D-170: la chiusura come `not_applicable`
resta riservata ai casi senza vendita né credito, trascorsi 37 giorni.

Formula informativa:

```text
credito stimato =
canone del ciclo corrente × tempo residuo / durata del ciclo corrente
```

Non generano credito:

- mesi o anni precedenti;
- parte già trascorsa del ciclo corrente;
- giorni di prova;
- importi rimborsati;
- tasse.

Il calcolo visibile è una stima: Shopify resta la fonte dell’importo effettivo.
L'interfaccia mostra sempre il prezzo integrale del pagamento unico e il credito come
movimento separato, con stato `in attesa`, `confermato`, `non applicabile` o `da
verificare`; non presenta il credito stimato come sconto immediato o costo netto.


## Cancellazione ordinaria

- fine periodo, non immediata;
- nessun rimborso pro rata;
- uso consentito fino a `currentPeriodEnd`;
- alla scadenza Function fail-open;
- configurazione conservata;
- proratazione riservata al passaggio alla modalità una tantum.


## Rimborsi

- nessun rimborso automatico;
- valutazione manuale;
- casi tipici: duplicazione, problema tecnico grave non risolvibile, errore imputabile all’app;
- normalmente nessun rimborso per ripensamento dopo la prova;
- rimborso totale di una tantum revoca il diritto;
- rimborso parziale mantiene il diritto salvo accordo diverso;
- prima di un rimborso parziale verificare nel Partner Dashboard eventuali crediti o
  rettifiche già applicati, per evitare un doppio beneficio;
- rimborsare soltanto charge già pagate; una charge non pagata richiede un credito;
- la commissione di elaborazione Shopify non viene restituita;
- ogni eccezione segue il runbook di riconciliazione finanziaria e conserva una prova
  manuale di fattura, rettifiche e payout;
- policy definitiva approvata dall'owner il 2 agosto 2026.


## Comunicazione “Pagamento unico”

Testo pubblico:

> Pagamento unico per questo store Shopify, senza rinnovi. Include gli
> aggiornamenti dell’app e l’assistenza, senza costi aggiuntivi.

La resa in-app può aggiungere una frase di chiusura che orienta la scelta e non
fa parte del testo contrattuale; i Termini pubblicati in `site/` riportano la
formulazione qui sopra.

Regole interne:

- valido per un singolo store;
- non trasferibile;
- riconosciuto dopo reinstallazione;
- include gli aggiornamenti della stessa app;
- nessuna menzione pubblica di versioni future o “2.x”;
- evitare “lifetime” come titolo contrattuale.


## Criteri di accettazione Billing

- prova comune testata senza charge iniziale;
- giorni residui corretti;
- nessuna doppia prova;
- mensile/annuale/una tantum approvati in modalità test;
- una tantum creata solo con offerta attiva e al prezzo dell’offerta;
- rifiuto e abbandono non concedono accesso;
- webhook duplicati innocui;
- riconciliazione corregge stato locale;
- passaggio ricorrente → una tantum annulla solo dopo conferma;
- credito pro rata mostrato come stima;
- cancellazione ordinaria mantiene accesso fino a fine periodo;
- scadenza rende il checkout fail-open;
- pricing generation conservata nei cambi;
- addebiti reali in Production: `BILLING_TEST` vale `"false"` (D-129).


## Costi e trattenute Shopify

Snapshot ufficiale verificato il 9 settembre 2026:

- registrazione Shopify App Store: **19 USD una tantum per Partner account**;
- revenue share ordinaria: **0% sui primi 1.000.000 USD** di ricavi lordi app conteggiati secondo le regole Shopify vigenti dal 1° gennaio 2025;
- revenue share: **15%** oltre tale soglia, salvo categorie di sviluppatori a cui Shopify applica condizioni diverse;
- commissione di elaborazione: **2,9%** su tutti gli addebiti;
- commissione operativa regolamentare: dipende dal Paese dello store; per
  l'Italia è il 3% riletto negli accrediti Partner (D-154);
- imposte ed eventuali oneri regolamentari restano separati.

Il Control Center usa questi tassi come snapshot nominato (`SHOPIFY_APP_FEES` in
`app/plans.server.ts`) per mostrare il valore dopo le fee dei soli abbonamenti
ricorrenti attivi; i netti Telegram sottraggono anche lo 0,5% Hyperwallet
(D-194). I tassi vanno
ricontrollati prima di ogni loro modifica e quando cambia la fascia applicabile
al Partner account; imposte, rimborsi e oneri regionali restano separati. Fonte:
[Revenue share for Shopify App Store developers](https://shopify.dev/docs/apps/launch/distribution/revenue-share).
