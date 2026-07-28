# CF Ready

App pubblica Shopify per validare Codice Fiscale e PEC al checkout.

## Sviluppo locale

Prerequisiti: Node.js 22+, Shopify CLI e una chiave AES-256 in
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

Il piano decisionale è in
[`docs/plans/2026-07-28-CF-Ready-Master-Plan.md`](docs/plans/2026-07-28-CF-Ready-Master-Plan.md).
