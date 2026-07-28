# CF Ready

App pubblica Shopify per validare Codice Fiscale e PEC al checkout.

## Sviluppo locale

Prerequisiti: [mise](https://mise.jdx.dev/), Shopify CLI e una chiave AES-256
in `SESSION_ENCRYPTION_KEY`, codificata in base64. La versione Node.js è
bloccata in `mise.toml`.

```sh
mise install
npm ci
npm run db:migrate:local
npm run dev
```

## Verifica

```sh
npm test
npm run check
```

La documentazione parte da [`docs/INDEX.md`](docs/INDEX.md); il
[Master Plan](docs/plans/2026-07-28-CF-Ready-Master-Plan.md) resta la fonte
decisionale.
