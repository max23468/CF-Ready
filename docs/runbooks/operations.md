# Operazioni — capacità, backup, osservabilità e verifiche

Le operazioni Production restano vincolate all'autorizzazione separata
dell'owner; i workflow non rendono implicita tale autorizzazione.

## Capacità Development

`npm run capacity:dev` apre un tail Cloudflare filtrato lato provider da un
header sintetico univoco, riscalda il Worker, invia 120 richieste alla rotta
pubblica e misura la CPU delle sole invocazioni marcate. Il comando fallisce se
raccoglie meno di 100 eventi o più dei 120 emessi, incontra un errore Worker o
HTTP, oppure supera `5 ms` al `p95`, metà del limite Free per richiesta. Il
massimo resta nella ricevuta per rendere visibili eventuali cold start, ma non
sostituisce il percentile operativo. Gli eventi non sintetici non attraversano
il confine Cloudflare-runner.

L'avvio del tail può richiedere fino a 60 secondi; il carico non parte finché
una probe marcata non torna dal provider. La soglia riguarda soltanto la
connessione al tail e non allenta numero di eventi, errori o limiti CPU.

Il workflow Development esegue il controllo dopo il deploy Worker e prima dello
snapshot Shopify. Un fallimento attiva il rollback coordinato già previsto. La
prova riguarda il costo base del routing React Router; i percorsi autenticati,
le query D1 e le chiamate Shopify si controllano anche con metriche reali e con
la matrice sotto, perché un test sintetico non deve generare traffico artificiale
verso Shopify.

### Soglie Free tier

| Risorsa | Quota Free di riferimento | Stop point operativo |
| --- | --- | --- |
| Worker HTTP | 100.000 richieste/giorno | 50.000/giorno per due giorni |
| CPU Worker | 10 ms/richiesta | `p95 > 5 ms` per sette giorni |
| Memoria Worker | 128 MB | un solo `exceededMemory` |
| D1 letture | 5 milioni righe/giorno | 2,5 milioni/giorno per due giorni |
| D1 scritture | 100.000 righe/giorno | 50.000/giorno per due giorni |
| D1 storage per database | 500 MB | 250 MB |
| D1 storage account | 5 GB totali | 2,5 GB |
| R2 Standard storage | 10 GB-mese/mese | 5 GB-mese per due mesi |
| R2 operazioni Class A | 1 milione/mese | 500.000/mese per due mesi |
| R2 operazioni Class B | 10 milioni/mese | 5 milioni/mese per due mesi |

Al raggiungimento di uno stop point: fermare nuovi store, verificare che il
contatore appartenga a CF Ready, controllare indici e richieste anomale, quindi
scegliere fra ottimizzazione mirata e passaggio al piano adatto. Nessuna soglia
avvia automaticamente una migrazione. Le quote vanno confrontate con le fonti
Cloudflare prima di una decisione commerciale o di capacità.

## Verifica browser

Gli E2E non conservano una sessione staff nel repository o in GitHub Actions.
`npm run test:e2e` prova la superficie pubblica e il login senza sessione;
i flussi embedded restano una matrice Development eseguita con una sessione
staff aperta dall'owner. Questo evita una credenziale browser persistente e una
infrastruttura di autenticazione per percorsi che richiedono comunque Shopify
reale. Il job `e2e` è un controllo richiesto sui rami protetti.

| Superficie | Controllo | Browser e viewport |
| --- | --- | --- |
| Sito pubblico | home IT/EN, cambio lingua, skip link, landmark, CTA disabilitate, supporto e legali | WebKit stretto e largo |
| Login app | copy IT/EN, label, errore campo vuoto, ordine focus campo → pulsante | Chromium stretto e largo |
| Admin embedded | prima installazione, onboarding, completa senza attivare, riapertura | browser Admin, stretto e largo |
| Regole e messaggi | Save Bar/Annulla, radio/anteprima, tab lingue, reset separato | browser Admin, tastiera |
| Validation | attivazione, disattivazione, errore sync e riparazione fail-open | browser Admin |
| Stato merchant | store non italiano, prova 7/3/1/0, billing e reinstallazione | test automatici; stato reale quando disponibile |

Per la chiusura di una release annotare nella ricevuta commit, browser,
viewport, righe eseguite, esito e limiti non riproducibili. Checkout standard,
wallet e canary seguono la matrice dedicata del Master Plan e non vengono
simulati da questi E2E.

La ricevuta riga per riga della chiusura M8 è in
[`docs/evidence/2026-08-02-m8-hardening.md`](../evidence/2026-08-02-m8-hardening.md).

## Backup D1 in R2

Il workflow `Backup D1 Production` esporta `cf-ready-db-prod`, cifra l'export
con AES-256-GCM e lo scrive nel bucket `cf-ready-backups-prod` con jurisdiction
`eu`. Il formato `.cfrb` contiene IV, tag autenticato e checksum SHA-256; la
chiave `D1_BACKUP_KEY` resta nell'environment GitHub `Production Backups` e non
nel bucket. Il file SQL in chiaro esiste soltanto nel runner effimero.

Il cron del lunedì vive sul branch predefinito, ma può soltanto avviare
`backup-production.yml` sulla revisione promossa in `main`; il workflow reale
rifiuta ogni altro branch. Aggiorna uno di otto slot settimanali e, il primo
lunedì del mese, uno di dodici slot mensili. Le chiavi sono circolari e
mantengono esattamente 8+12 copie dopo il riempimento iniziale, senza job di
cancellazione né permessi R2 aggiuntivi. Un marker tecnico non cifrato contiene
soltanto l'ultimo mese completato: se il primo tentativo mensile fallisce o
resta in attesa, il cron settimanale ritenta finché backup e marker non sono
stati pubblicati.

Ogni esecuzione:

1. verifica account, UUID e jurisdiction D1 e nome/jurisdiction R2;
2. esporta il database remoto con `wrangler d1 export --remote`;
3. cifra prima dell'upload;
4. decifra e importa la copia in un D1 locale effimero, quindi verifica
   separatamente l'export con `PRAGMA integrity_check` del runtime SQLite
   incluso in Node.js e richiede tutte le tabelle applicative minime;
5. soltanto dopo il restore riuscito sovrascrive gli slot R2, riscarica quello
   settimanale e ne verifica identità, autenticità e uguaglianza con l'export;
6. registra chiave R2, checksum e risultato nel riepilogo GitHub.

La prima esecuzione remota richiede: environment `Production Backups`, secret
`CLOUDFLARE_API_TOKEN` con i permessi minimi sufficienti a export D1 e oggetti
R2, secret `D1_BACKUP_KEY` di 32 byte in base64 conservato anche in un secret
store recuperabile e autorizzazione dell'owner. La chiave resta stabile finché
esistono slot cifrati con quella versione; una rotazione conserva la versione
precedente per almeno dodici mesi. Il workflow non ripristina mai sopra
Production.

### Ripristino di emergenza

Entro la finestra disponibile, preferire D1 Time Travel. Per una copia R2:

1. ottenere autorizzazione Production e identificare timestamp e slot;
2. scaricare e decifrare l'oggetto su un runner o host effimero;
3. ripetere il restore drill locale e verificare le tabelle attese;
4. creare un nuovo database D1 con jurisdiction `eu` e importare lì l'export;
5. fare readback sul nuovo database;
6. cambiare il binding Production con un deploy coordinato e relativo smoke;
7. conservare il vecchio database come rollback finché la verifica è chiusa.

Non importare un export sopra il database Production esistente: un errore a
metà import lascerebbe uno stato misto difficile da annullare.

## Workers Logs

`wrangler.json` mantiene Workers Logs attivi al 100% e gli invocation log
disattivati. Il 100% evita di perdere errori e webhook; è l'app a inviare
sempre errori e webhook e a campionare al 10% gli eventi ordinari. Ogni oggetto
log contiene `event`, `class`, `occurredAt`, `correlation_id`, `webhook` e la
sola allowlist di metadati tecnici. Non contiene URL, query string, shop domain,
payload, header, token, Codice Fiscale o PEC.

Creare nel Query Builder Cloudflare queste query account-level dopo il primo
deploy che abilita questi log:

| Nome | Filtro | Vista |
| --- | --- | --- |
| `CF Ready — errori` | `class = "error"` | Count, group by `event` e `error_code` |
| `CF Ready — webhook` | `webhook = true` | Count, group by `event` |
| `CF Ready — correlation` | `correlation_id = "<id>"` | Events, ordine temporale |
| `CF Ready — scrittura eventi fallita` | `event = "app_event_write_failed"` | Count |

Soglie iniziali:

- un solo `app_event_write_failed`: P2 e controllo D1;
- tre `webhook_failed` con lo stesso `error_code` in 15 minuti: P1;
- cinque `session_decrypt_failed` in 15 minuti fuori da una rotazione nota: P1;
- qualunque sequenza compatibile con checkout legittimi bloccati: P0 e runbook
  §26.2 del Master Plan.

La retention nativa del piano corrente è breve: il correlation ID va copiato
nella ricevuta dell'incidente, non i log completi. Query e retention vanno
riverificate trimestralmente sulle fonti Cloudflare correnti.

## Traces Development temporanee

Traces resta `enabled: false`. Si usa solo per riprodurre un difetto con dati
sintetici sul dev store:

1. eseguire preflight e annotare commit/versione Worker attivi;
2. creare fuori dal repository una copia di `wrangler.json` con
   `observability.traces.enabled: true` e `head_sampling_rate: 1`;
3. distribuire quella configurazione su `cf-ready-dev`, con messaggio che
   include il commit Development attivo;
4. verificare via API `GET /accounts/<account>/workers/scripts/cf-ready-dev/script-settings`
   che Traces sia attivo, quindi generare soltanto traffico sintetico;
5. ridistribuire immediatamente `wrangler.json` senza modifiche;
6. ripetere il readback API e chiudere solo con `traces.enabled == false` e
   Worker/Shopify ancora riferiti allo stesso commit.

Non abilitare Traces su Production o durante traffico merchant. Se la
disattivazione non supera il readback, trattare l'operazione come P1.

## Ricevuta deploy/readback

Ogni riepilogo GitHub di deploy usa questi campi, con `non applicabile` quando
la superficie non li possiede:

- ambiente e configurazione;
- versione repository/Shopify e commit;
- deployment/version ID di Worker, Shopify o Pages;
- migrazioni e backup applicabili;
- smoke e readback osservati;
- target di rollback verificato.

La ricevuta dell'ultimo snapshot della milestone entra nella PR di chiusura;
non apre una PR autonoma.

## Deploy Production

Il workflow `deploy-production.yml` è manuale e parte solo da `main`, tramite
l'environment GitHub `Production` che ne limita i branch. I due freni sono
questi: nessun evento lo avvia da sé e nessun branch diverso da `main` può
raggiungerlo. L'environment non chiede un'approvazione interattiva — sarebbe un
terzo passaggio sullo stesso intento, dato che il lancio è già manuale.

**L'ambiente si sceglie a build time, non a deploy time.** Il Vite plugin di
Cloudflare appiattisce la configurazione nel bundle, quindi
`CLOUDFLARE_ENV=production npm run build` è ciò che decide dove si va a finire;
`wrangler deploy --env production` dopo una build ordinaria pubblicherebbe le
variabili Development sotto il nome sbagliato senza dirlo. Per questo il
workflow ricostruisce dopo `npm run check` — che termina con una build
Development — e il preflight legge `build/server/wrangler.json` prima di
lasciar proseguire.

I comandi che leggono la configurazione sorgente, migrazioni e secret, usano
`--config wrangler.json --env production`; il deploy del Worker non passa
`--env`, perché il bundle è già quello giusto.

Il primo deploy Production non ha un Worker da ripristinare: il workflow lo
riconosce, lo dichiara nella ricevuta e prosegue senza rollback armato del
Worker. La versione Shopify resta ripristinabile fin dal primo giro.

Il Worker `cf-ready-prod` viene creato materialmente dal primo
`wrangler secret put --env production`: finché non esiste, il preflight si
ferma e lo dice.

Fonti operative correnti: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[D1 export](https://developers.cloudflare.com/d1/wrangler-commands/#d1-export),
[R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/),
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/),
[Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)
e [Traces](https://developers.cloudflare.com/workers/observability/traces/).
