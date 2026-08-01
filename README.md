# CF Ready

Public app Shopify per validare formalmente Codice Fiscale e PEC nei campi
nativi del checkout italiano.

> Il progetto è in sviluppo: M0–M7 sono completate per il perimetro Development.
> Lo snapshot Development corrente è `0.5.2` e la versione del repository è
> `0.5.3`, con motore di validazione, billing, interfaccia merchant, onboarding
> e sito pubblico implementati. Il sito è pubblicato su
> [cf-ready.pages.dev](https://cf-ready.pages.dev/); la revisione legale dei
> documenti pubblici, Production, submission App Store e gate wallet M10 non
> sono ancora completati.

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

## Sito pubblico

Le pagine statiche bilingui stanno in `site/` e non hanno passo di build né
dipendenze: si servono così come sono.

Cloudflare Web Analytics è attivo sul progetto Pages con iniezione automatica:
il token resta nella configurazione Cloudflare e non va aggiunto agli HTML. La
CSP in `site/_headers` consente il beacon e l'invio allo stesso dominio.

```sh
mise exec -- npm run site:dev
mise exec -- npm run site:deploy
```

`site/tokens.css` è una copia di `docs/brand/assets/tokens.css`, che resta la
fonte canonica dei token di brand: se cambiano i token, va aggiornata anche la
copia.

Entrambi i comandi rimuovono prima `.wrangler/deploy/config.json`, l'artefatto
che `react-router build` lascia per il Worker: finché esiste, Wrangler dirotta
anche i comandi Pages sulla configurazione dell'app e il sito non parte. Pages
non accetta un file di configurazione alternativo, quindi si toglie di mezzo
quello sbagliato; viene rigenerato alla build successiva.

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
