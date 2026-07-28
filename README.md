# CF Ready

App pubblica Shopify per validare Codice Fiscale e PEC al checkout.

## Sviluppo locale

Prerequisiti: Node.js `>=26.5.0 <27`, Shopify CLI e una chiave AES-256 in
`SESSION_ENCRYPTION_KEY`, codificata in base64.

```sh
npm install
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
