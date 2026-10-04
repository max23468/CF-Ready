# M12 — Built for Shopify

Data di avvio: 26 agosto 2026.

Stato: **avviata, adozione e recensioni ancora insufficienti; Web Vitals e
incorporamento superati nella checklist Shopify; status non ancora ottenuto**.
Ultimo readback: 3 ottobre 2026.

M12 combina i requisiti Built for Shopify con i segnali di consolidamento
specifici di CF Ready. Si chiude quando Shopify assegna effettivamente lo status
e il readback lo conferma nel Partner Dashboard e sulla listing, purché non
restino bug critici o rischi aperti non accettati.
Idoneità automatica, pulsante disponibile, candidatura inviata o review in
corso sono condizioni intermedie e non costituiscono chiusura.

## Fonti e autorità

I requisiti sono stati riletti il 26 agosto 2026 e riconfermati il 20 settembre
e il 3 ottobre 2026 nelle fonti ufficiali:

- [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements);
- [About Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify);
- pagina Distribution dell'app nel Partner Dashboard, autorevole per stato,
  applicabilità e criteri assegnati a CF Ready.

Shopify modifica i criteri nel tempo. Prima della candidatura e della chiusura
si ripetono la lettura delle fonti e il readback della pagina Distribution; una
checklist locale non sostituisce lo status Shopify.

## Contratto di chiusura

### Prerequisiti Built for Shopify correnti

- requisiti App Store continuativamente rispettati;
- Partner account senza infrazioni attive o pendenti;
- almeno 50 installazioni nette da store attivi su piani Shopify a pagamento;
- almeno 5 recensioni autentiche;
- rating di almeno 4 stelle, soglia assegnata a CF Ready;
- ultimi App Bridge e autenticazione embedded, flussi primari dentro Shopify e
  nessuna registrazione aggiuntiva;
- LCP ≤ 2,5 s, CLS ≤ 0,1 e INP ≤ 200 ms al 75º percentile, ciascuno con almeno
  100 chiamate negli ultimi 28 giorni;
- criteri applicabili di integrazione e design superati, inclusi navigazione
  nativa, Home utile, UX familiare, mobile e disinstallazione pulita;
- nessun uso della Asset API. CF Ready non modifica il tema, non fornisce
  carrier rates e non ricade oggi nelle categorie specialistiche elencate; il
  Partner Dashboard resta autorevole se Shopify valuta diversamente un criterio.

### Segnali operativi CF Ready

- almeno 5 store con Validation attiva;
- billing reale verificato;
- disinstallazione/reinstallazione verificata;
- checkout standard e accelerato verificati organicamente quando disponibili;
- cliente italiano ed esenzione per fatturazione estera verificati;
- supporto operativo;
- backup e rollback provati;
- listing italiana pienamente visibile.

Questi segnali misurano il consolidamento e restano documentati, ma non formano
una seconda certificazione e non tengono aperta M12 dopo l'assegnazione dello
status. Restano bloccanti soltanto bug critici e rischi aperti non accettati.

Installazioni, checkout, pagamenti, uso e recensioni devono essere autentici.
Non si creano transazioni, merchant o recensioni artificiali e non si
incentivano recensioni positive. La candidatura Built for Shopify è un'azione
esterna separata: quando tutti i prerequisiti saranno verdi richiederà una
nuova autorizzazione esplicita dell'owner.

## Baseline iniziale

La lettura aggregata Production del 26 agosto 2026 alle `13:30:18` ha eseguito
una sola `SELECT`, senza scritture, e ha restituito:

| Segnale interno | Valore |
| --- | ---: |
| Store attivi | 1 |
| Validation attive | 1 |
| Onboarding completati | 1 |
| Store paganti o con acquisto concluso | 0 |
| Concessioni omaggio | 1 |
| Errori aperti | 0 |
| Eventi di errore negli ultimi 7 giorni | 0 |
| Webhook falliti visibili in D1 negli ultimi 7 giorni | 0 |

Questi conteggi interni non misurano le installazioni nette BFS, le recensioni,
il rating, i Web Vitals o i fallimenti avvenuti prima dell'ingresso nel Worker.
Non dimostrano quindi idoneità. Installazioni qualificate, recensioni, rating,
campioni Web Vitals e consegne webhook vanno riletti nei rispettivi pannelli
Shopify.

## Checklist Shopify assegnata a CF Ready

La pagina Distribution di CF Ready è stata riletta in Chrome il 26 agosto 2026
senza modifiche né invio della candidatura. La listing risulta `Pubblicato`, il
pulsante `Iscriviti oggi` è disabilitato e la checklist mostra:

| Criterio Shopify | Stato osservato |
| --- | --- |
| Core Web Vitals | aperto: LCP, CLS e INP riportano tutti `Dati non sufficienti`; servono almeno 100 chiamate in 28 giorni |
| Impatto sulla velocità storefront | valutazione manuale, non una bocciatura osservata |
| App incorporata nell'Admin | aperto: session token e ultima versione App Bridge non sono ancora accreditati dalla checklist |
| App ben integrata | valutazione manuale |
| Linee guida Shopify per il design | valutazione manuale |
| Nessun uso Asset API | valutazione manuale |
| Categoria specifica | nessuna categoria assegnata e nessun criterio di categoria mostrato |
| 50 installazioni nette qualificate | aperto |
| 5 recensioni dal lancio | aperto |
| Rating di almeno 4 stelle | ✅ soddisfatto |

Shopify dichiara che i criteri automatizzati sono controllati ogni giorno
intorno alle `17:00 UTC` e usano gli ultimi 28 giorni salvo diversa indicazione.
Il codice e gli audit locali già provano session token, App Bridge corrente e
assenza di Asset API, ma non sostituiscono l'accreditamento della checklist o la
successiva valutazione Shopify. Il mancato accredito dell'incorporamento va
quindi monitorato e, se persiste dopo il ciclo giornaliero con uso Production,
diagnosticato prima della candidatura.

Alla partenza risultano già disponibili come prove storiche: listing italiana
visibile dal 25 agosto, checkout standard organico riuscito, ciclo
disinstallazione/reinstallazione in Development, supporto pubblico, backup con
restore drill e rollback coordinato. Le prove restano da rivalutare contro la
matrice applicabile mostrata da Shopify prima della candidatura.

## Controllo tecnico Production del 26 agosto

Alle `15:58 CEST`, prima del ciclo automatico Shopify previsto intorno alle
`17:00 UTC`, la Home `1.0.0` installata su Numisleo è stata ricaricata in Chrome
senza modificare configurazione o dati. Il documento embedded espone:

- un solo meta `shopify-api-key`, con contenuto presente ma non riportato nella
  ricevuta; il candidato locale successivo sposta la stessa chiave pubblica
  nell'attributo `data-api-key` dello script, come nello scaffold Shopify
  corrente;
- un solo bootstrap CDN App Bridge;
- un solo bootstrap CDN Polaris;
- navigazione Home, Regole checkout, Messaggi al cliente e Guida e FAQ dentro
  la cornice Admin.

La telemetria emessa dal contenitore Shopify per una singola apertura fredda ha
riportato TTFB `2.090 ms`, FCP `2.936 ms`, LCP `2.952 ms` e CLS `0`. Una seconda
apertura ha riportato inizializzazione in `1.194 ms` e stato pronto all'uso in
`1.537 ms`, senza un secondo campione LCP nello stesso intervallo di osservazione.
Questi sono campioni diagnostici isolati del contenitore embedded: non sono il
75º percentile Built for Shopify, non distinguono da soli il tempo dell'Admin
da quello dell'app e non sostituiscono i contatori della pagina Distribution.

Il build locale della stessa versione ha trasformato `380` moduli in `350 ms`
e misura `126 KiB` gzip di JavaScript client complessivo, entro il budget
bloccante di `350 KiB`. Il loader Home parallelizza già riconciliazione Shopify
e lettura D1 e pubblica il dettaglio `Server-Timing`; da questo controllo non
emerge quindi una modifica prestazionale specifica giustificata da un impatto
misurato. Resta necessario rileggere la checklist dopo il ciclo giornaliero e
indagare l'accredito embedded soltanto se App Bridge e session token rimangono
aperti.

Una navigazione client-side dalla Home a Regole checkout ha inoltre caricato
correttamente la route autenticata e i suoi sei controlli senza uscire dalla
cornice Admin. Il backend usa la strategia token exchange di
`@shopify/shopify-app-react-router` `2.0.0`, versione npm corrente al momento
del controllo. Rimane quindi una sola divergenza plausibile dal percorso
canonico del rilevatore: lo scaffold Shopify corrente configura App Bridge con
`data-api-key` sullo script, mentre la `1.0.0` live usa il meta equivalente. Il
candidato locale adotta la forma canonica; nessun deploy è stato eseguito.

## Primo merchant pagante — 29 agosto 2026

Alle `12:50:35 UTC` il comando `npm run report:launch -- production` ha eseguito
una sola lettura aggregata D1, senza scritture, e ha restituito:

| Segnale interno | Valore |
| --- | ---: |
| Store registrati | 4 |
| Store attivi | 2 |
| Installazioni negli ultimi 7 giorni | 2 |
| Installazioni negli ultimi 30 giorni | 4 |
| Onboarding completati | 1 |
| Validation attive | 2 |
| Store paganti o con acquisto concluso | 1 |
| Concessioni omaggio | 1 |
| Errori aperti | 0 |
| Eventi di errore negli ultimi 7 giorni | 0 |
| Webhook falliti visibili in D1 negli ultimi 7 giorni | 0 |

Una seconda `SELECT` mirata, eseguita alle `12:54:41 UTC` senza riportare
dominio, identificativi Shopify o condizioni economiche, ha verificato per
l'unico store pagante attivo:

- installazione ed entitlement attivi, con riferimento della charge Shopify
  presente;
- Validation attiva, riferimento della risorsa e configurazione versionata
  presenti;
- nessun errore applicativo aperto, evento di errore o webhook fallito visibile
  negli ultimi 7 giorni;
- riconciliazione billing e Validation registrata il 28 agosto 2026 alle
  `08:33:18 UTC`;
- evento billing attivo registrato il 27 agosto alle `13:23:06 UTC` e
  attivazione della Validation 35 secondi dopo;
- onboarding formale non completato.

L'onboarding incompleto non prova un malfunzionamento: l'implementazione
consente intenzionalmente di acquistare e attivare il controllo direttamente
dalla Home. Resta un segnale di customer success da osservare per capire se il
percorso guidato è stato saltato per scelta o perché poco visibile.

Questa evidenza porta da zero a uno il segnale operativo «billing reale
verificato» e da uno a due le Validation attive. Non prova installazioni nette
qualificate, recensioni, Web Vitals o idoneità Built for Shopify e non modifica
il contratto di chiusura di M12. Il readback odierno nel Partner Dashboard non è
stato completato perché il browser richiedeva la selezione dell'account Shopify;
non sono stati eseguiti accesso, candidatura o altre modifiche remote.

Il merchant non ha fornito volontariamente recapiti. Non vengono quindi
ricercati contatti personali né usati il dominio del negozio o superfici
pubbliche per un messaggio non richiesto; il supporto resta disponibile sui
canali pubblicati e un eventuale ringraziamento seguirà soltanto un contatto
diretto o un altro canale legittimo già esistente.

Come follow-up locale è stato scelto un check-in in-app, senza invio esterno:
compare una sola volta ai merchant paganti con Validation attiva, apre il
`mailto:` di assistenza già previsto e può essere chiuso definitivamente. Il
testo ringrazia il merchant, conferma lo stato operativo e offre feedback o
assistenza diretta senza chiedere una recensione. Il candidato riconosce inoltre
come completato, senza attese artificiali, lo setup operativo concluso nella
Home quando esistono regole gestite, accesso attivo, Validation attiva e nessun
errore; aprire il confronto piani non basta da solo e l'evento automatico resta
distinto dal completamento manuale. Questa modifica è evidenza locale e non è
stato eseguito alcun deploy Production.

## Readback del 20 settembre 2026

Il readback è stato eseguito senza scritture, candidature o modifiche remote.
La pagina Distribution nel Partner Dashboard continua a mostrare la sezione
`Ottieni lo status Built for Shopify per la tua app` con il pulsante
`Iscriviti oggi` disabilitato. M12 resta quindi aperta e CF Ready non è ancora
candidabile.

### Stato Shopify autorevole

La listing risulta `Pubblicato`. La panoramica dell'app mostra `12` merchant con
l'app e, per gli ultimi 30 giorni, `18` installazioni, `7` disinstallazioni e
`11` installazioni nette cumulative. Questi valori descrivono la crescita
osservata nel Partner Dashboard, ma non sostituiscono il contatore BFS delle
installazioni nette da store attivi su piani Shopify a pagamento. Il requisito
di `50` installazioni qualificate risulta ancora aperto.

La listing pubblica non mostra recensioni: il requisito di almeno `5`
recensioni autentiche resta aperto. Il rating minimo non è un risultato utile
finché manca il numero minimo di recensioni.

Nella pagina Distribution:

- LCP, CLS e INP riportano tutti `Dati non sufficienti`;
- Shopify richiede almeno `100` chiamate per ciascuna metrica negli ultimi 28
  giorni;
- il requisito di impatto sulla velocità storefront e i criteri di app
  incorporata, integrazione, design e assenza di uso della Asset API restano
  soggetti alla valutazione Shopify;
- non è assegnata alcuna categoria specifica.

Non è stata osservata una bocciatura dei criteri manuali. Il loro stato aperto
non equivale però a superamento e sarà valutato da Shopify soltanto nel percorso
di candidatura.

### Segnali operativi Production

Alle `13:17:17 UTC`, `npm run report:launch -- production` ha restituito:

| Segnale interno | Valore |
| --- | ---: |
| Store registrati | 14 |
| Store attivi | 12 |
| Installazioni negli ultimi 7 giorni | 5 |
| Installazioni negli ultimi 30 giorni | 12 |
| Onboarding completati | 7 |
| Validation attive | 8 |
| Store paganti o con acquisto concluso | 5 |
| Concessioni omaggio | 1 |
| Errori aperti | 0 |
| Eventi di errore negli ultimi 7 giorni | 8 |
| Webhook falliti visibili in D1 negli ultimi 7 giorni | 0 |

Gli `8` eventi di errore non sono errori attualmente aperti. Questo report resta
una lettura D1 interna: non prova installazioni qualificate, recensioni o stato
Built for Shopify.

Il report prestazioni Production sugli ultimi 28 giorni aggrega tutte le
versioni e mostra:

| Metrica | Campioni | p75 interno | Soglia BFS | Esito |
| --- | ---: | ---: | ---: | --- |
| CLS | 41 | 0,0072 | ≤ 0,1 | campioni insufficienti |
| INP | 52 | 48 ms | ≤ 200 ms | campioni insufficienti |
| LCP | 44 | 2.508 ms | ≤ 2.500 ms | campioni insufficienti |

Il p75 interno non è il dato autorevole Shopify. CLS e INP sono entro soglia
nel campione disponibile; LCP è marginalmente oltre soglia, ma nessuna metrica
ha ancora i `100` campioni necessari. La priorità è continuare a osservare LCP
mentre cresce l'uso reale, senza dichiarare superato o fallito il gate sulla
base di questo campione.

### Stato tecnico e residui

Production è alla release `v1.11.7`, commit
`c28ca642bf8d23d1710e66a0e40ae68656d667ba`. Il workflow Deploy Production e la
GitHub Release dello stesso commit sono riusciti il 20 settembre 2026; `main`,
`develop` e i rispettivi riferimenti remoti risultavano allineati al readback.
Questo prova lo stato della release tecnica, non l'idoneità BFS.

Restano quindi tre prerequisiti automatici osservabili da colmare:

1. raggiungere le `50` installazioni nette qualificate;
2. ottenere almeno `5` recensioni autentiche e il rating richiesto;
3. accumulare almeno `100` chiamate per LCP, CLS e INP mantenendo i p75 entro
   soglia.

Dopo questi prerequisiti resteranno la candidatura autorizzata dall'owner e la
valutazione Shopify dei criteri manuali. Soltanto l'assegnazione dello status e
il readback nel Partner Dashboard e sulla listing chiuderanno M12.

## Readback del 3 ottobre 2026

La pagina Distribution dell'app Production nell'organizzazione Partner
Temisfera è stata letta senza candidatura o cambi di configurazione. La listing
è pubblicata e il pulsante `Candidati ora` resta disabilitato.

| Criterio Shopify | Stato osservato |
| --- | --- |
| LCP, CLS e INP | tutti verdi; benchmark Web Vitals superato |
| Incorporamento, token di sessione e App Bridge corrente | superati; highlight di app incorporata ottenuto |
| 50 installazioni nette da store attivi su piani Shopify a pagamento | aperto; conteggio qualificato esatto non esposto nella checklist |
| Almeno 5 recensioni autentiche | aperto; listing pubblica con 0 recensioni |
| Rating di almeno 4 stelle | aperto, senza recensioni |
| Impatto storefront, integrazione, design e assenza di Asset API | valutazione manuale; nessuna bocciatura osservata |
| Categoria specialistica | nessuna assegnata |

La panoramica Partner mostra 18 installazioni nette cumulative negli ultimi 30
giorni. Il valore non è il contatore delle installazioni qualificate BFS. Il
link al dettaglio numerico delle prestazioni nella Dev Dashboard ha restituito
`Store unavailable` anche dopo aggiornamento: il superamento è provato dalle
icone verdi nella checklist, non da numeri Shopify ricostruiti localmente.

La lettura aggregata D1 Production delle `13:19:41 UTC`, eseguita con il report
locale corretto, restituisce:

| Segnale interno | Valore |
| --- | ---: |
| Store registrati | 25 |
| Store attivi | 22 |
| Installazioni negli ultimi 7 / 30 giorni | 8 / 20 |
| Onboarding completati | 17 |
| Validation attive | 18 |
| Store paganti o con acquisto concluso, esclusi addebiti test | 8 |
| Prove gratuite attive | 8 |
| Concessioni omaggio | 1 |
| Store attivi con errore applicativo o di sincronizzazione etichette registrato | 1 |
| Eventi di errore negli ultimi 7 giorni | 52 |
| Webhook falliti visibili in D1 negli ultimi 7 giorni | 0 |

Il report precedente contava soltanto `app_state.last_error_code` e mostrava 0,
omettendo l'errore etichette. La correzione locale usa lo stesso predicato del
Control Center e non conta conferme guidate pendenti o gestione disattivata.
Non è stata applicata alcuna modifica al database remoto.

Il report prestazioni interno sui 28 giorni, aggregando tutte le versioni,
mostra CLS p75 `0,02655` su 150 campioni, INP `64 ms` su 113 e LCP `1.720 ms`
su 152. Tutti sono entro soglia e hanno almeno 100 campioni. Restano misure CF
Ready separate dall'accreditamento Shopify.

### Incidente etichette e limiti della prova

Un incidente `checkout_labels_partial_sync` è attivo su uno store ancora
installato. La prima osservazione del monitor è del 16 settembre; i testi
conservati hanno ultima lettura del 16 settembre. La Validation risulta attiva
in D1, senza errore generale, e non è registrata una sincronizzazione completa
delle etichette. Questi dati non dimostrano che oggi il checkout abbia testi
errati o sia bloccato: manca una nuova lettura Shopify dello store interessato.
Altri cinque store attendono conferme guidate, stato distinto dall'incidente.

La verifica del codice ha trovato che il readback finale veniva conservato
soltanto in caso di esito completo. Il fix locale conserva anche i testi letti
con esito parziale, prima di registrare il risultato. Gli avvisi owner dichiarano
che il monitor rilegge D1, riportano l'ultima lettura Shopify disponibile e non
presentano la scomparsa del codice come una nuova verifica del checkout.
La correzione non aggiorna retroattivamente osservazioni o incidenti Production.

I 52 eventi sono 30 `billing_event_invalid_payload` nel ciclo notifiche owner
(ultimo 26 settembre), 15 fallimenti di rinnovo token offline, 4 richieste
Partner fallite e 3 eventi Partner esclusi per dominio invalido. Non sono stati
osservati incidenti billing attivi. Il conteggio non prova da solo un bug
corrente: cause e impatto dei fallimenti recenti restano da riconfermare, senza
eliminare eventi o indebolire i controlli dei payload.
Una lettura aggiuntiva delle `13:22:50 UTC` conferma acquisizione Partner
aggiornata alle `13:20:18 UTC`, zero notifiche fallite e zero notifiche in attesa
o in elaborazione. Non è quindi osservato un blocco corrente della pipeline
notifiche; gli errori storici restano conservati.

### Release, acquisizione e verifiche residue

Durante la ricognizione Production è passata da `1.15.23`, commit `b1a0840`,
alla `1.15.24`, commit `83b5b591c34d81fcad4fe7df46b34cec5eabc1c2`. Il relativo
[workflow Production](https://github.com/max23468/CF-Ready/actions/runs/37125142772)
risulta riuscito. La nuova release non costituisce assegnazione BFS.

Il [backup del 28 settembre](https://github.com/max23468/CF-Ready/actions/runs/36406225373)
comprende restore drill riuscito. Le 12 pagine della sitemap pubblica rispondono
200 e dichiarano canonical e hreflang; comprendono le quattro guide in IT/EN.
Clic, query e checkpoint di acquisizione non sono stati verificati in Google
Search Console. Non sono stati riconfermati separatamente infrazioni Partner,
checkout express, mobile reale, nuovi acquisti, reinstallazione o rollback.
L'audit Safari del 3 ottobre conserva i limiti dei percorsi live osservati.

Restano adozione qualificata, recensioni e rating, poi candidatura autorizzata,
valutazione manuale e status assegnato. Prima della candidatura va chiarito
l'incidente etichette con un nuovo readback Shopify. I fix di questo aggiornamento
sono locali: pubblicazione e chiusura dell'incidente remoto non sono avvenute.

### Verifica dei fix locali

Le regressioni sono state eseguite anche su una copia del commit precedente:
falliscono sul contatore incompleto, sul readback parziale non conservato e
sull'avviso che confonde controlli D1 con nuove letture Shopify; passano con i
fix. `npm run check` è verde, con 689 test app, 179 UI e 195 Function.
`npm run coverage:check` è verde: righe 98,59%, branch 95,99%.
La corsia selezionata è `full`, senza domini mutation selezionati; mutation non
eseguita. Nessun commit, push, deploy o invio Telegram è stato eseguito.
