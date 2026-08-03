# Inventario secret

Questo inventario registra solo i nomi. I valori restano negli secret store
dei rispettivi provider e non devono comparire nel repository o nei log.

| Secret | Ambiente | Destinazione | Stato M0 |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `SESSION_ENCRYPTION_KEY` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `TRIAL_LEDGER_HMAC_KEY` | Development | Cloudflare Workers | configurato il 2 agosto 2026 |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | Development | GitHub Actions | configurato il 29 luglio 2026 |
| `SHOPIFY_API_SECRET` | Production | Cloudflare Workers | da configurare |
| `SESSION_ENCRYPTION_KEY` | Production | Cloudflare Workers | da generare |
| `TRIAL_LEDGER_HMAC_KEY` | Production | Cloudflare Workers | da generare prima del lancio |
| `CLOUDFLARE_API_TOKEN` | CI Pages Production | GitHub Actions | configurato il 1 agosto 2026; accesso verificato dal preflight del workflow |
| `CLOUDFLARE_API_TOKEN` | Backup Production | GitHub Actions | configurato il 3 agosto 2026; da limitare a export D1 e oggetti R2 |
| `D1_BACKUP_KEY` | Backup Production | GitHub Actions | configurato il 3 agosto 2026; copia recuperabile nel Portachiavi macOS |
| `SECURITY_AUDIT_TOKEN` | Security Maintenance | GitHub Actions | sostituito il 3 agosto 2026 con un PAT fine-grained senza scadenza sul solo `CF-Ready`, in sola lettura su metadati, Actions e i tre alert; environment limitato a `develop`, copia recuperabile nel Portachiavi macOS |
| `SHOPIFY_CLI_PARTNERS_TOKEN` | CI Production | GitHub Actions | da creare con privilegi minimi |

`SHOPIFY_API_KEY`, ID account, ID database e nomi delle risorse non sono
segreti, ma non autorizzano alcun accesso.

`TRIAL_LEDGER_HMAC_KEY` è un identificatore stabile del ledger, non una chiave
di sessione: non va ruotata ordinariamente. Va conservata nel secret store con
backup recuperabile; in caso di compromissione, la vecchia versione resta
necessaria per riconoscere le prove già registrate e la migrazione a una nuova
chiave richiede una procedura dedicata prima della sostituzione.

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
