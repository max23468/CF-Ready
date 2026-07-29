# Inventario secret

Questo inventario registra solo i nomi. I valori restano negli secret store
dei rispettivi provider e non devono comparire nel repository o nei log.

| Secret | Ambiente | Destinazione | Stato M0 |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `SESSION_ENCRYPTION_KEY` | Development | Cloudflare Workers, GitHub Actions | configurato il 29 luglio 2026 |
| `SHOPIFY_APP_AUTOMATION_TOKEN` | Development | GitHub Actions | configurato il 29 luglio 2026 |
| `SHOPIFY_API_SECRET` | Production | Cloudflare Workers | da configurare |
| `SESSION_ENCRYPTION_KEY` | Production | Cloudflare Workers | da generare |
| `CLOUDFLARE_API_TOKEN` | CI Production | GitHub Actions | da creare con privilegi minimi |
| `SHOPIFY_CLI_PARTNERS_TOKEN` | CI Production | GitHub Actions | da creare con privilegi minimi |

`SHOPIFY_API_KEY`, ID account, ID database e nomi delle risorse non sono
segreti, ma non autorizzano alcun accesso.
