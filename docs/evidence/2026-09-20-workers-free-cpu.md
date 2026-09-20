# Qualificazione CPU Workers Free

Data: 20 settembre 2026.

Stato: **release `1.12.0` distribuita, readback immediato compatibile; conferma
su 24 ore ancora necessaria**.

Questa ricevuta riguarda soltanto CPU Worker. La precedente anomalia D1 della
query di monitoraggio su `webhook_events` è esclusa dal dimensionamento. Tempo
CPU, attesa D1 o rete e durata complessiva restano grandezze distinte.

## Contratto e metodo

Le [quote Workers](https://developers.cloudflare.com/workers/platform/limits/)
correnti assegnano al piano Free 10 ms CPU per invocazione. La CPU non include
l'attesa di rete o storage. Le
[metriche Workers](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
espongono separatamente CPU e wall time e riportano percentili campionati. Il
target prudenziale di CF Ready è p95 non oltre 8 ms oppure, quando Cloudflare
espone solo p50/p90/p99, p90 non oltre 8 ms e p99 non oltre 10 ms.

Sono state usate soltanto route, esiti, tempi e aggregati tecnici. Nessun
payload webhook, dominio merchant, token o dato personale è stato stampato o
persistito.

## Baseline Production

Il Worker letto prima delle modifiche era `cf-ready-prod`, deployment del
commit `c28ca642bf8d23d1710e66a0e40ae68656d667ba`. La baseline Cloudflare delle
ultime 24 ore fornita dall'owner era:

| Invocazioni | CPU media | CPU p50 | CPU p90 | CPU p99 |
| ---: | ---: | ---: | ---: | ---: |
| circa 15.990 | 7,67 ms | 6,82 ms | 22,63 ms | 36,67 ms |

La media non qualifica il piano Free: p90 e p99 superano il limite per singola
invocazione.

Due tail read-only brevi hanno attribuito la coda osservata:

| Campione | Percorso | Invocazioni osservate | CPU osservata | Wall time osservato |
| --- | --- | ---: | --- | --- |
| 130 secondi | webhook HTTP | 21 | p50 6 ms, p90 20 ms, massimo 21 ms | p50 33 ms |
| 130 secondi | cron notifiche, ogni minuto | 3 | p50 8 ms, massimo 9 ms | p50 1.406 ms |
| 75 secondi | `POST /webhooks/shop/update` | 9 | p50 7 ms, massimo 25 ms | non usato come CPU |
| 75 secondi | cron notifiche | 1 | 8 ms | non usato come CPU |

Tutte le invocazioni osservate avevano esito applicativo positivo. Nei due
intervalli non sono comparsi consumer Queue né altre route HTTP, quindi non
esiste una misura Production sufficiente per attribuire loro un percentile.
Nella baseline il cron girava ogni minuto: non generava la coda principale e
ridurne la frequenza avrebbe abbassato il numero di invocazioni, non la CPU della
singola esecuzione.

`SHOP_UPDATE` è il percorso concreto dominante. Quando il Paese non cambia,
esegue già HMAC, parsing JSON e una sola lettura D1 prima dell'early return. Il
wall time D1 non spiega quindi da solo i 20-25 ms CPU. Il profilo del bundle ha
mostrato invece che ogni webhook inizializzava l'intero server React Router e
il bootstrap Shopify Admin prima di raggiungere il relativo handler.

## Correzione candidata

Il candidato mantiene firme, limiti del corpo, status HTTP, claim D1,
idempotenza, ACK dopo accettazione Queue, retry e DLQ. Cambia soltanto il lavoro
necessario per raggiungerli:

- l'entrypoint Worker intercetta le cinque route webhook esatte prima di React
  Router e risponde senza caricarlo anche a metodi o percorsi webhook non
  ammessi;
- la verifica HMAC SHA-256 usa Web Crypto sul corpo grezzo e confronto
  timing-safe, senza inizializzare il client Shopify Admin;
- ingresso e claim webhook sono separati dal consumer e dal processing, caricati
  soltanto quando servono;
- React Router, contesto merchant, owner control, notifiche, retention e job
  Queue sono importati in modo differito per il rispettivo tipo di evento;
- l'early return `SHOP_UPDATE` per Paese invariato resta prima del claim e
  dell'accodamento.

Non cambiano UX merchant, checkout, semantica fiscale o dati persistiti. Il
trade-off è un primo import differito sui percorsi meno frequenti e un bundle
complessivo più grande per il code splitting.

Il candidato successivo porta l'intero ciclo owner da ogni minuto a ogni cinque
minuti. Poll Partner, cursori locali, riconciliazione incidenti e consegna outbox
restano nello stesso ordine e con la stessa idempotenza. Le invocazioni periodiche
scendono dell'80%; notifiche e risoluzioni operative possono arrivare con circa
quattro minuti di ritardo aggiuntivo. Webhook, Queue, retention oraria e percorsi
merchant non cambiano. Questa variazione non è ancora distribuita.

## Misure locali prima e dopo

La baseline è stata ricostruita in un worktree temporaneo sul commit Production
e confrontata con lo stesso toolchain del candidato.

| Misura | Prima | Candidato | Lettura |
| --- | ---: | ---: | --- |
| entrypoint server iniziale | 178,18 kB | 13,04 kB | -92,7% sul bootstrap comune |
| bundle Worker gzip | 352,96 KiB | 403,71 KiB | +50,75 KiB per chunk differiti |
| `wrangler check startup`, CPU attiva mediana su 5 run | 20,0 ms | 0,0 ms | campionamento locale troppo granulare per un percentile runtime |
| `wrangler check startup`, intervallo CPU attiva | 5,1-105,2 ms | 0,0-19,0 ms | prova di attribuzione, non soglia Cloudflare |

I profili locali hanno pochi campioni e includono rumore del processo host. Lo
zero indica che il campionatore non ha intercettato lavoro attivo, non CPU
realmente nulla. La riduzione dell'entrypoint e la scomparsa dell'inizializzazione
React dal percorso comune sono prove strutturali; non dimostrano da sole p90 o
p99 dopo deploy.

Il benchmark sintetico riproducibile `npm run benchmark:worker-cpu` isola lavoro
computazionale, senza D1 o rete:

| Operazione | Payload | Media locale | p99 locale |
| --- | ---: | ---: | ---: |
| HMAC e header | piccolo | 0,0122 ms | 1 ms |
| `JSON.parse` | piccolo | 0,0003 ms | sotto la risoluzione di 1 ms |
| HMAC e header | 32 KiB | 0,0381 ms | 1 ms |
| `JSON.parse` | 32 KiB | 0,0047 ms | sotto la risoluzione di 1 ms |

Il benchmark misura durata locale del solo calcolo e non va convertito in un
percentile Cloudflare. Serve a escludere HMAC e parsing, per payload
rappresentativi, come spiegazione plausibile di una coda di decine di
millisecondi.

## Deploy e readback Production

La release `1.12.0`, commit `be88a341bad2121f2f16c9266c98f38b137cc893`, è
stata distribuita sul Worker Production con deployment
`e7a34a09-f266-4cc3-97a3-82ee5fb5e525`. Il readback immediato ha osservato:

- 120 richieste HTTP sintetiche: p95 1 ms, massimo 3 ms, nessun errore;
- 22 invocazioni `/webhooks/shop/update`: CPU p50 2 ms, p90 3 ms, p99 e massimo
  4 ms, tutte riuscite;
- due esecuzioni del cron owner: CPU 9 ms, durata complessiva mediana 2.554 ms;
- una retention oraria: CPU 7 ms, durata complessiva 199 ms.

Le durate complessive includono attese D1 e rete e non sono attribuite alla CPU.
Il campione webhook rispetta il target prudenziale, mentre il cron owner resta
vicino al limite per singola invocazione. La riduzione della frequenza a cinque
minuti riduce volume e consumo aggregato, ma non costituisce una riduzione della
CPU della singola esecuzione.

## Esito e blocco residuo

- **Prova locale: PASS strutturale.** Bootstrap comune ridotto e benchmark
  sintetici escludono HMAC e parsing come cause della vecchia coda.
- **Release `1.12.0`: PASS sul readback immediato.** I webhook osservati restano
  sotto il target p90 8 ms e sotto il limite di 10 ms anche al p99.
- **Workers Free: compatibilità condizionata.** Manca ancora il percentile
  Cloudflare su una finestra rappresentativa di 24 ore; due soli cron non
  qualificano la loro distribuzione.
- **Candidato cron a cinque minuti: non distribuito.** Configurazione, preflight
  e documentazione sono preparati localmente.

La prossima azione reale è pubblicare il candidato quando autorizzato e leggere
le metriche Cloudflare su almeno 24 ore, separando HTTP, cron e Queue. Un p99
sopra 10 ms resta rischio e non è un PASS.
