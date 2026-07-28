# Inventario secret

Questo inventario registra solo i nomi. I valori restano negli secret store
dei rispettivi provider e non devono comparire nel repository o nei log.

| Secret | Ambiente | Destinazione | Stato M0 |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | Development, Testing, Production | Cloudflare Workers | da configurare per ambiente |
| `SESSION_ENCRYPTION_KEY` | Development, Testing, Production | Cloudflare Workers | da generare separatamente per ambiente |
| `CLOUDFLARE_API_TOKEN` | CI Testing e Production | GitHub Actions | da creare con privilegi minimi |
| `SHOPIFY_CLI_PARTNERS_TOKEN` | CI Testing e Production | GitHub Actions | da creare con privilegi minimi |

`SHOPIFY_API_KEY`, ID account, ID database e nomi delle risorse non sono
segreti, ma non autorizzano alcun accesso.
