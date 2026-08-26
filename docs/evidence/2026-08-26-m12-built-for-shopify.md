# M12 — Built for Shopify

Data di avvio: 26 agosto 2026.

Stato: **avviata, status non ancora ottenuto**.

M12 combina i requisiti Built for Shopify con i segnali di consolidamento
specifici di CF Ready. Si chiude quando Shopify assegna effettivamente lo status
e il readback lo conferma nel Partner Dashboard e sulla listing, purché non
restino bug critici o rischi aperti non accettati.
Idoneità automatica, pulsante disponibile, candidatura inviata o review in
corso sono condizioni intermedie e non costituiscono chiusura.

## Fonti e autorità

I requisiti sono stati riletti il 26 agosto 2026 nelle fonti ufficiali:

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
