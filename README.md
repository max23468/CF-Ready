# CF Ready

Public app Shopify per validare formalmente Codice Fiscale e PEC nei campi
nativi del checkout italiano.

> Il progetto è in sviluppo: M0–M6 sono completate per il perimetro Development
> e lo snapshot Development corrente è `0.4.34`, con motore di validazione,
> billing, interfaccia merchant
> e onboarding implementati. Production, submission App Store e gate wallet
> M10 non sono ancora completati.

## Sviluppo locale

Prerequisiti: [mise](https://mise.jdx.dev/), Shopify CLI e una chiave AES-256
in `SESSION_ENCRYPTION_KEY`, codificata in base64. La versione Node.js è
bloccata in `mise.toml`.

```sh
mise trust mise.toml
mise install
mise exec -- npm ci
mise exec -- npm run db:migrate:local
mise exec -- npm run dev
```

## Verifica

```sh
mise exec -- npm test
mise exec -- npm run test:function
mise exec -- npm run preflight:dev
mise exec -- npm run docs:check
mise exec -- npm run check
```

Per ispezionare il collegamento Shopify senza permettere alla CLI di
normalizzare i file TOML del repository:

```sh
mise exec -- npm run shopify:info -- shopify.app.dev.toml
```

## Documentazione e contributi

La documentazione parte da [`docs/INDEX.md`](docs/INDEX.md). Il
[Master Plan](docs/plans/2026-07-28-CF-Ready-Master-Plan.md) resta la fonte
decisionale; codice, test e configurazioni descrivono lo stato implementato.

Prima di contribuire leggi [`CONTRIBUTING.md`](CONTRIBUTING.md). Le
vulnerabilità vanno segnalate privatamente seguendo [`SECURITY.md`](SECURITY.md),
mai tramite issue pubblica.

La visibilità pubblica del repository non equivale a una licenza open-source:
finché non è presente `LICENSE`, non sono concessi diritti di riuso impliciti.
