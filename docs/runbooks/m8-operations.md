# Operazioni M8 — backup, osservabilità e ricevute

Questo runbook copre il layer durabilità e osservabilità di M8. Le operazioni
Production restano vincolate all'autorizzazione separata dell'owner; i workflow
non rendono implicita tale autorizzazione.

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
mantengono esattamente 8+12 oggetti dopo il riempimento iniziale, senza job di
cancellazione né permessi R2 aggiuntivi.

Ogni esecuzione:

1. verifica account, UUID e jurisdiction D1 e nome/jurisdiction R2;
2. esporta il database remoto con `wrangler d1 export --remote`;
3. cifra prima dell'upload;
4. scarica lo slot appena scritto e ne verifica checksum, autenticità e
   uguaglianza con l'export;
5. importa la copia in un D1 locale effimero e verifica separatamente l'export
   con `PRAGMA integrity_check` del runtime SQLite incluso in Node.js;
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
deploy Development del layer:

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

Fonti operative correnti: [D1 export](https://developers.cloudflare.com/d1/wrangler-commands/#d1-export),
[R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/),
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/),
[Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)
e [Traces](https://developers.cloudflare.com/workers/observability/traces/).
