# Operazioni — capacità, backup, osservabilità e verifiche

Le operazioni Production richiedono l'autorizzazione dell'owner: una richiesta
affermativa di pubblicazione la concede per il ciclo tecnico applicabile; fuori
da tale richiesta serve una conferma separata. I workflow, da soli, non
costituiscono autorizzazione.

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
`npm run test:e2e` prova la superficie pubblica e l'ingresso pre-OAuth;
i flussi embedded restano una matrice Development eseguita con una sessione
staff aperta dall'owner. Questo evita una credenziale browser persistente e una
infrastruttura di autenticazione per percorsi che richiedono comunque Shopify
reale. Il job `e2e` è un controllo richiesto sui rami protetti.

| Superficie | Controllo | Browser e viewport |
| --- | --- | --- |
| Sito pubblico | home IT/EN, cambio lingua, skip link, landmark, CTA disabilitate, supporto e legali | WebKit stretto e largo |
| Ingresso app | `/`, `/app` e `/auth/login` inoltrano all'autenticazione senza UI o errori server | Chromium stretto e largo |
| Admin embedded | prima installazione, onboarding, completa senza attivare, riapertura | browser Admin, stretto e largo |
| Regole e messaggi | Save Bar/Annulla, radio/anteprima, tab lingue, reset separato | browser Admin, tastiera |
| Validation | attivazione, disattivazione, errore sync e riparazione fail-open | browser Admin |
| Stato merchant | store non italiano operativo, prova 7/3/1/0, billing e reinstallazione | test automatici; stato reale quando disponibile |

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

## Report prestazioni Built for Shopify

Il report operativo legge i campioni Web Vitals degli ultimi 28 giorni e
calcola il p75 con metodo nearest-rank per LCP, INP e CLS. Produce gruppi
complessivi, per versione e per coppia versione/rotta, senza esporre store,
sessioni, URL o singoli campioni:

```bash
npm run report:performance -- development
npm run report:performance -- production
```

Le soglie iniziali sono LCP ≤ 2.500 ms, INP ≤ 200 ms e CLS ≤ 0,1. Ogni gruppo
ha stato `insufficient_samples` finché non raggiunge 100 campioni; dopo quella
soglia è `pass` o `fail`. Il comando è di sola lettura e non sostituisce lo
stato Built for Shopify assegnato e riletto da Shopify.

La rotta del campione è quella che ha avviato il documento e condivide la
stessa origine temporale dei valori `Server-Timing`. Per un'analisi causale
separare sempre la shell Shopify Admin dall'iframe CF Ready: un LCP il cui
elemento appartiene alla shell non prova una regressione del bundle o del
loader dell'app.

## Notifiche owner

Il cron Production ogni cinque minuti acquisisce dalla Shopify Partner API gli
eventi di installazione, riattivazione, disattivazione e disinstallazione, oltre
all'intero ciclo degli abbonamenti e dei pagamenti unici: accettazione,
attivazione, disdetta, rifiuto, scadenza, sospensione e riattivazione. Ogni poll
rilegge le ultime 24 ore, così un evento pubblicato in ritardo non resta oltre il
checkpoint. In parallelo, cursori monotoni sugli ID locali recuperano
installazione, disinstallazione, prova, onboarding, Validation e tutte le
transizioni presenti in `billing_events`. Il readback Shopify Admin costituisce
quindi il fallback dell’attivazione commerciale anche se la Partner API non
restituisce l’evento; chiavi semantiche comuni impediscono il doppio messaggio
quando entrambe le fonti osservano la stessa transizione. Il passaggio tra piani
usa il precedente stato billing riconciliato per produrre una notifica esplicita
`Da`/`A`.

Il runtime mantiene separati i confini: `app/owner-notifications.server.ts`
orchestra polling, outbox e deduplicazione;
`app/owner-notifications/model.ts` valida payload e tipi di evento;
`app/owner-notifications/presentation.ts` costruisce copy e sezioni operative;
`app/owner-notifications/delivery.server.ts` gestisce claim, retry e trasporto
Telegram. Il bootstrap del cursore locale conserva il fallback dal checkpoint
temporale storico finché la chiave numerica non è stata materializzata, evitando
di ripartire dall’inizio o di perdere eventi durante il passaggio.

L'outbox viene consegnato tramite la Telegram Bot API. Development non configura
i secret e non invia notifiche. Il destinatario è la sola chat privata
identificata dal secret `TELEGRAM_CHAT_ID`; ogni messaggio riporta nome pubblico e
dominio tecnico `.myshopify.com` dello store, piano, stato operativo e istante
dell'evento. Le transizioni billing includono importo, cadenza e prossimo addebito
quando Shopify li espone. Il contenuto viene inviato con `sendRichMessage` in
tabelle native compatte e offre pulsanti
per aprire o copiare l'URL dello store. Il rilevamento automatico delle entità è
disattivato per evitare anteprime e `protect_content` non viene impostato, quindi
copia, salvataggio e inoltro restano consentiti. I valori dinamici sono campi di
testo strutturati e non markup interpretabile. La notifica non include nome
dell'owner, email, Codice Fiscale, PEC, shop ID o GID Shopify.

La configurazione distribuita è attiva soltanto in Production; Development non
configura i secret e non invia. Per configurare un nuovo ambiente o ruotare le
credenziali:

1. ottenere l’autorizzazione Production e identificare account Cloudflare,
   app e organizzazione Shopify Partner;
2. creare un bot Telegram dedicato, aprire la sua chat privata, premere
   **Avvia** e ricavare il relativo identificatore numerico senza registrare il
   token in file o cronologia shell;
3. scrivere nel secret store Worker `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
   `SHOPIFY_PARTNER_ORGANIZATION_ID`, `SHOPIFY_PARTNER_APP_ID` e
   `SHOPIFY_PARTNER_ACCESS_TOKEN`, senza stamparne i valori;
4. impostare `OWNER_NOTIFICATIONS_ENABLED=true`, eseguire preflight e gate
   completi, poi distribuire con il workflow Production autorizzato;
5. verificare che fixture controllate per lifecycle, prova e billing producano
   una sola riga `sent` per evento, che un secondo poll non le duplichi e che i
   messaggi contengano nome pubblico, dominio `.myshopify.com`, stato e piano senza
   shop ID o GID, che il nome resti testo letterale e che i pulsanti aprano e
   copino l'URL atteso senza bloccare l'inoltro del messaggio;
6. in rollback, riportare il flag a `false` e ridistribuire: le righe già
   acquisite restano in D1 e non vengono consegnate finché il flag è spento.

Un fallimento Partner non avanza il checkpoint. La risposta Telegram è valida
soltanto con HTTP riuscito e `ok: true`. La consegna tenta al massimo
cinque volte con backoff; una riga `failed` richiede diagnosi del codice
sanitizzato e una decisione esplicita prima del replay.
`shop/redact` elimina immediatamente tutte le righe dell'outbox associate al
dominio tecnico, comprese quelle già inviate, così nessuna notifica pendente può
partire dopo la cancellazione dei dati dello store. Una barriera HMAC conserva
soltanto l'istante di redazione e scarta replay Partner anteriori; un evento di
reinstallazione con istante successivo resta notificabile.

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

Il workflow genera anche una ricevuta JSON con commit, tree e identificatori di
readback. L'artifact resta legato al run per 90 giorni; in Production viene
attestato con la provenienza GitHub Actions. La chiusura collega run, artifact o
GitHub Release e non apre una PR per copiare la ricevuta nel repository.

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
variabili Development sotto il nome sbagliato senza dirlo. Il workflow riusa i
gate verdi dell'HEAD, costruisce una sola volta con `CLOUDFLARE_ENV=production`
e il preflight legge `build/server/wrangler.json` prima di lasciar proseguire.

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
