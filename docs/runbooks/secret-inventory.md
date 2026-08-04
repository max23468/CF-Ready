# Inventario secret

Questo inventario registra solo i nomi. I valori restano negli secret store
dei rispettivi provider e non devono comparire nel repository o nei log.

| Secret | Ambiente | Destinazione | Stato M0 |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `SESSION_ENCRYPTION_KEY` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `TRIAL_LEDGER_HMAC_KEY` | Development | Cloudflare Workers | configurato il 2 agosto 2026 |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | Development | GitHub Actions | configurato il 29 luglio 2026 |
| `SHOPIFY_API_SECRET` | Production | Cloudflare Workers | da configurare sul Worker `cf-ready-prod` con `wrangler secret put --env production` |
| `SESSION_ENCRYPTION_KEY` | Production | Cloudflare Workers | da generare con `openssl rand -base64 32` e caricare sul Worker `cf-ready-prod` |
| `TRIAL_LEDGER_HMAC_KEY` | Production | Cloudflare Workers | da generare con `openssl rand -base64 32` e caricare sul Worker `cf-ready-prod`; non ruotabile ordinariamente |
| `CLOUDFLARE_API_TOKEN` | CI Pages Production | GitHub Actions | configurato il 1 agosto 2026; accesso verificato dal preflight del workflow |
| `CLOUDFLARE_API_TOKEN` | Backup Production | GitHub Actions | configurato il 3 agosto 2026; da limitare a export D1 e oggetti R2 |
| `D1_BACKUP_KEY` | Backup Production | GitHub Actions | configurato il 3 agosto 2026; copia recuperabile nel Portachiavi macOS |
| `SECURITY_AUDIT_TOKEN` | Security Maintenance | GitHub Actions | sostituito il 3 agosto 2026 con un PAT fine-grained senza scadenza sul solo `CF-Ready`, in sola lettura su metadati, Actions e i tre alert; environment limitato a `develop`, copia recuperabile nel Portachiavi macOS |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | CI Production | GitHub Actions | creato il 4 agosto 2026 dal Dev Dashboard dell'app CF Ready, environment `Production`. **Scade il 4 febbraio 2027**, vedi «Scadenze» |
| `CLOUDFLARE_API_TOKEN` | CI Production | GitHub Actions | creato il 4 agosto 2026 con Workers Scripts Edit e D1 Edit sul solo account, environment `Production`; senza scadenza |
| `OWNER_LEGAL_NAME` | Pages Production | GitHub Actions | configurato il 3 agosto 2026 nell'environment `Pages Production`, iniettato dal workflow e verificato dallo smoke |

`SHOPIFY_API_KEY`, ID account, ID database e nomi delle risorse non sono
segreti, ma non autorizzano alcun accesso.

Il reviewer non riceve credenziali: D-132 stabilisce l'installazione su un suo
development store italiano, perché CF Ready non ha un login proprio.

`cfready@icloud.com` resta la casella dell'assistenza e dei documenti legali.

`OWNER_LEGAL_NAME` non protegge un accesso: è il nome della persona fisica che
Privacy e Termini devono dichiarare come titolare. Sta nel secret store per non
lasciarlo in chiaro in un repository pubblico. Nel repository resta il
segnaposto `__OWNER_NAME__`, che il workflow Pages sostituisce prima del deploy
e lo smoke verifica assente nelle pagine pubblicate. Il nome resta visibile sul
sito e nella listing: `X-Robots-Tag: noindex` sui quattro documenti legali lo
tiene fuori dai motori di ricerca, non lo rende riservato.

`TRIAL_LEDGER_HMAC_KEY` è un identificatore stabile del ledger, non una chiave
di sessione: non va ruotata ordinariamente. Va conservata nel secret store con
backup recuperabile; in caso di compromissione, la vecchia versione resta
necessaria per riconoscere le prove già registrate e la migrazione a una nuova
chiave richiede una procedura dedicata prima della sostituzione.

## Scadenze

Gli App Automation Token di Shopify non possono essere perpetui: la scadenza
massima è sei mesi. Alla scadenza il deploy fallisce sull'autenticazione, e
l'unico modo per accorgersene in anticipo è averla scritta.

| Credenziale | Ambiente | Scade | Cosa fare |
| --- | --- | --- | --- |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | CI Production | **4 febbraio 2027** | rigenerare dal Dev Dashboard dell'app CF Ready, Settings → App Automation Token, e sostituire il secret nell'environment `Production` |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | Development | da verificare: creato il 29 luglio 2026, scadenza non registrata | leggere la scadenza nel Dev Dashboard dell'app Development e annotarla qui |

Il token si vede una sola volta, al momento della creazione: se va perso si
revoca e se ne genera un altro, non si recupera.

## Rotazione di `SESSION_ENCRYPTION_KEY`

Le sessioni sono rigenerabili: non esiste una doppia chiave e non serve
migrare i record esistenti. Una riga cifrata con la chiave precedente non è
più leggibile, viene ignorata con l'evento `session_decrypt_failed` e Shopify
ripete l'autenticazione in modo trasparente.

1. genera 32 byte casuali codificati in base64, fuori dal repository;
2. scrivi il secret nell'ambiente bersaglio con `wrangler secret put` e, dove
   previsto, nel secret store di GitHub Actions;
3. ridistribuisci il Worker dell'ambiente;
4. verifica con un login embedded che una nuova sessione venga scritta e
   ricaricata;
5. facoltativo, elimina le righe residue di `shopify_sessions` dello store di
   prova: nessun dato applicativo dipende da esse.

Rollback: rimetti il valore precedente dal secret store e ridistribuisci. Le
sessioni scritte con la chiave nuova diventano a loro volta inutilizzabili e
vengono rigenerate al primo accesso. Chiavi diverse fra `dev` e `prod`; il
valore non compare mai in log, PR o documenti.
