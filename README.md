# CF Ready

Public app Shopify per validare formalmente Codice Fiscale e PEC nei campi
nativi del checkout italiano.

Versione e stato corrente si leggono da `package.json`, `CHANGELOG.md`, codice e
configurazioni. Le ricevute storiche chiuse sono in `docs/evidence/`; i deploy
correnti producono artifact JSON del workflow legati a commit e tree, attestati
in Production. Il sito pubblico è
[cf-ready.pages.dev](https://cf-ready.pages.dev/).

## Sviluppo locale

Prerequisiti: [mise](https://mise.jdx.dev/), Shopify CLI, una chiave AES-256 in
`SESSION_ENCRYPTION_KEY` e una chiave HMAC dedicata in
`TRIAL_LEDGER_HMAC_KEY`, entrambe codificate in base64. La versione Node.js è
bloccata in `mise.toml`.

```sh
mise trust mise.toml
mise install
mise exec -- npm ci
mise exec -- npx playwright install chromium webkit
mise exec -- npm run db:migrate:local
mise exec -- npm run dev
```

## Sito pubblico

Le pagine statiche bilingui stanno in `site/` e non hanno passo di build né
dipendenze: si servono così come sono. Home, assistenza e otto guide sono
indicizzabili; Privacy, Termini e la pagina 404 restano fuori dall'indice.
`robots.txt`, `sitemap.xml`, canonical e hreflang sono mantenuti insieme alle
pagine.

Cloudflare Web Analytics è attivo sul progetto Pages con iniezione automatica:
il token resta nella configurazione Cloudflare e non va aggiunto agli HTML. La
CSP in `site/_headers` consente il beacon e l'invio a `cloudflareinsights.com`.

```sh
mise exec -- npm run site:dev
```

Il deploy Pages Production non ha un comando locale. Il workflow manuale
`Deploy Pages Production`, serializzato e vincolato a `main`, esegue il gate
completo, pubblica soltanto `site/`, verifica commit e target tramite API, prova
le sedici URL pubbliche, i file SEO e una risposta 404 reale, quindi ripristina
il deployment precedente se readback o smoke falliscono. L'integrazione Git di
Pages resta disattivata.

`site/tokens.css` è una copia di `docs/brand/assets/tokens.css`, che resta la
fonte canonica dei token di brand: se cambiano i token, va aggiornata anche la
copia.

`site:dev` rimuove prima `.wrangler/deploy/config.json`, l'artefatto che
`react-router build` lascia per il Worker: finché esiste, Wrangler dirotta anche
i comandi Pages sulla configurazione dell'app e il sito non parte. Pages
non accetta un file di configurazione alternativo, quindi si toglie di mezzo
quello sbagliato; viene rigenerato alla build successiva.

## Verifica

```sh
mise exec -- npm test
mise exec -- npm run test:function
mise exec -- npm run test:e2e
mise exec -- npm run coverage:check
mise exec -- npm run preflight:dev
mise exec -- npm run docs:check
mise exec -- npm run check:docs
mise exec -- npm run check:standard
mise exec -- npm run check
```

`coverage:check` misura tutto il codice eseguibile first-party nei cinque gruppi
canonici, unisce i report senza duplicare i sorgenti condivisi e verifica la
baseline committata. Dopo una modifica che cambia la misura, esegui
`npm run coverage:update`, controlla il report in `.coverage/global/` e committa
anche `config/coverage-baseline.json`; la CI impedisce di abbassare la baseline
rispetto al branch di partenza.

Per ispezionare il collegamento Shopify senza permettere alla CLI di
normalizzare i file TOML del repository:

```sh
mise exec -- npm run shopify:info -- shopify.app.dev.toml
```

## Notifiche owner

Production può inviare a una chat Telegram privata una notifica per installazione,
reinstallazione, disinstallazione, prova gratuita e per l'intero ciclo dei piani:
accettazione, attivazione, cambio, disdetta, sospensione, riattivazione, rifiuto e
scadenza, oltre a completamento dell'onboarding e attivazione/disattivazione della
Validation. Ogni notifica usa una Rich Message Telegram con tabelle compatte,
nome pubblico e URL tecnico dello store, stato operativo, piano, dettagli
economici disponibili e pulsanti per aprire o copiare l'URL. Copia e inoltro del
messaggio restano consentiti; non contiene nome dell'owner, email, identificatori
Shopify o dati checkout.

La funzione è attiva soltanto in Production con
`OWNER_NOTIFICATIONS_ENABLED=true`; Development non invia notifiche. Servono un
bot dedicato, una chat privata avviata e i secret Production `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `SHOPIFY_PARTNER_ORGANIZATION_ID`,
`SHOPIFY_PARTNER_APP_ID` e `SHOPIFY_PARTNER_ACCESS_TOKEN`; seguire il runbook
operativo per configurazione, verifica e rollback.

## Documentazione e contributi

La documentazione parte da [`docs/INDEX.md`](docs/INDEX.md). Versioni e commit
storici restano nelle ricevute e nel changelog e non descrivono lo stato
corrente. Il
[Master Plan](docs/plans/2026-07-28-CF-Ready-Master-Plan.md) resta la fonte
decisionale; codice, test e configurazioni descrivono lo stato implementato.

Prima di contribuire leggi [`CONTRIBUTING.md`](CONTRIBUTING.md). Le
vulnerabilità vanno segnalate privatamente seguendo [`SECURITY.md`](SECURITY.md),
mai tramite issue pubblica.

La visibilità pubblica del repository non equivale a una licenza open-source:
finché non è presente `LICENSE`, non sono concessi diritti di riuso impliciti.
