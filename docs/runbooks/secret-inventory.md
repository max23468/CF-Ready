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
| `CLOUDFLARE_API_TOKEN` | CI Production | GitHub Actions | da creare con privilegi minimi |
| `SHOPIFY_CLI_PARTNERS_TOKEN` | CI Production | GitHub Actions | da creare con privilegi minimi |

`SHOPIFY_API_KEY`, ID account, ID database e nomi delle risorse non sono
segreti, ma non autorizzano alcun accesso.

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
