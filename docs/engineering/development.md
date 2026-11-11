# Sviluppo e rilascio

Ambienti, branch, versioni, CI, dipendenze e test. I comandi stanno qui e in
`package.json`, il ciclo di pubblicazione nell'[ADR 0009](../adr/0009-publication-cycle.md)
e nel [coordinatore](../runbooks/operations.md#coordinatore-di-pubblicazione),
le autorizzazioni in [AGENTS.md](../../AGENTS.md#pubblica).

## Ambienti

Le app Shopify e i dev store appartengono all'organizzazione Partner `Temisfera`.

| Nome | Identificatore | Uso |
|---|---|---|
| Development | `dev` | sviluppo, integrazione e collaudo sui dev store |
| Production | `prod` | merchant reali |

Due soli ambienti sono il minimo raccomandato da Shopify: una terza app richiede una
decisione basata su un bisogno reale. I dev store sono `cf-ready-dev` e
`cf-ready-polaris-2`, entrambi Basic. `ALLOWED_SHOP` contiene i due domini in
Development ed è vuota in Production; il preflight la vincola.

L'utility CLI di reset esiste solo per `dev`: chiede conferma, ha una guardia
strutturale che rifiuta `prod` e non compare nella UI.

## Branch

Regole in [AGENTS.md](../../AGENTS.md#git-e-ambienti). In più:

- un fast-forward di `develop` dopo la promozione lo esegue solo la GitHub App
  dedicata, dopo Production verde e con parent e tree verificati;
- se fallisce e `develop` avanza prima del retry, l'unico recupero ammesso è un merge
  di sola ascendenza con tree invariato, senza forzare il ref;
- la cancellazione automatica dei branch è disattivata e `develop` non si elimina;
- nessuna cancellazione automatica di estensioni Shopify;
- submission App Store e attivazioni commerciali richiedono un'autorizzazione
  esplicita.

## Versionamento

SemVer: patch per i fix, minor per funzionalità compatibili, major per cambi
incompatibili o sostanziali. `package.json#version` è la fonte canonica e coincide
con il lockfile e, in Production, con il tag `vX.Y.Z`.

La prossima versione si prepara nella PR verso `develop`: nuove funzionalità
compatibili incrementano la **minor**, soli fix incrementano la **patch**. Codice,
bump di manifest e lockfile, changelog e documentazione della modifica stanno
**nella stessa PR**, anche quando l’owner chiede “pubblica senza
promuovere”. Il numero identifica la release in preparazione e non dichiara un
rilascio Production già avvenuto, né lo autorizza.

Un lotto su `develop` porta una sola versione: la prepara la prima PR che cambia
Worker, app Shopify, migrazioni o `site/`, le successive la riusano o ne alzano il
livello rispetto a `main` (D-191). Documentazione interna, ADR, piani, governance
agentica, tooling, test e workflow non la cambiano.

Durante il collaudo si mantiene la stessa SemVer e si accumulano i fix nella
relativa voce del changelog; cambia soltanto il suffisso `dev.<tree>`.

Esempio: `package.json` e lockfile contengono `1.3.0`; Development rilascia
`1.3.0-dev.<tree>`; la promozione porta lo stesso tree in `main` e Production
rilascia `1.3.0`. Non si modifica la versione durante la promozione: il candidato
completo supera i gate e il deploy Development prima del merge.

Se un candidato è già stato integrato con il numero della precedente release, si
corregge subito su `develop` con una PR preparatoria limitata a manifest, lockfile,
changelog e policy di release pertinenti, senza attendere il via alla
Production. Anche questa correzione richiede gate completi e un nuovo deploy
Development prima della promozione.

Ogni snapshot Shopify rilasciato ha un identificatore esplicito con `shopify app
deploy --version`:

- Development: `<versione>-dev.<prime 12 cifre del tree Git>`, che rende idempotente
  lo stesso contenuto;
- Production: la versione esatta, mai riusata.

Tutti i deploy Shopify rilasciati passano dal workflow dell'ambiente. Un deploy
locale diretto è solo una preview non rilasciata.

Ogni release Production ha tag, changelog, note IT/EN, artifact riproducibile,
migrazioni versionate, commit deployato e piano di rollback. Tag e GitHub Release
nascono solo dopo deploy, smoke e readback riusciti sul medesimo commit. La ricevuta
di deploy è un artifact JSON legato a commit e tree, attestato in Production, e non
si ricopia nel repository. Registra ambiente, configurazione, versione Shopify,
commit, ID della versione rilasciata e versione di rollback.

## CI

GitHub Actions è l'unico CI/CD. Il workflow `CI` calcola una corsia dal diff con
`scripts/ci-lane.mjs` e mantiene stabili i required check; un percorso sconosciuto
usa il gate completo. Il workflow `React Doctor` blocca warning ed errori nelle
modifiche delle PR. `Promotion guard` è separato perché deve ascoltare anche
`edited`, l'unico evento che scatta quando cambia il base branch di una PR.

| Corsia | Quando | Gate minimo |
|---|---|---|
| `docs` | contenuto documentale senza effetto operativo | controllo documentazione, formato, `git diff --check` |
| `standard` | TypeScript, route, config o test ordinari | docs gate, lint, typecheck, test mirati, build, coverage |
| `full` | governance, workflow, auth, webhook, cifratura, migrazioni, manifest o lockfile | standard, audit, lockfile, test operativi, coverage e regressione mirata |
| `promotion` | PR `develop` → `main` con ascendenza valida | provenienza PR/review, tree e gate esatti di `develop`, `promotion-guard` |
| `deploy` | provider, migrazioni, Worker, Function o Pages | gate completo, preflight provider, backup se applicabile, smoke, readback e rollback |

Il repository pubblico usa branch protection su `develop` e `main`, applicata anche
agli admin, con conversazioni risolte e required check `verify`, `coverage`,
`mutation`, `react-doctor`, `dependency-review`, `e2e` e `ci-policy`; su `main` anche
`promotion-guard` e base aggiornata. `ci-policy` è attestato sullo SHA da un workflow
`pull_request_target` del branch attendibile, senza eseguire codice della PR.

Sono attivi Secret Scanning, Push Protection, CodeQL, Dependabot e private
vulnerability reporting. Le Action di terze parti sono vincolate a commit, con
permessi minimi. L'auto-merge vale per le sole PR Dependabot minor e patch verso
`develop`.

## Preflight e ricevute

Prima di una scrittura remota: identificare ambiente, account, organizzazione, app,
store e risorse; leggere lo stato remoto; controllare la sola presenza delle
credenziali; confermare autorizzazione, backup e rollback. Se target o identità non
coincidono, ci si ferma.

Dopo: readback dalla fonte autorevole, registrazione di commit, deployment ID,
migrazioni e smoke, target di rollback. Un comando terminato con exit code `0` non è,
da solo, prova del risultato live.

## Dipendenze

- Versioni dirette con pin esatto, `package-lock.json` committato, `npm ci` in CI.
- Node.js bloccato in `mise.toml`. TypeScript nativo, senza flag sperimentali non
  misurati.
- Nessuna beta o RC, salvo le eccezioni approvate: CLI `cf` e plugin Vite Cloudflare
  (D-183).
- Dependabot settimanale senza cooldown, per npm e GitHub Actions. `.npmrc`
  fissa `min-release-age=0` (D-208).
- `npm audit` ammette eccezioni temporanee legate a un solo avviso e con scadenza
  (D-175).
- Aggiornamenti Shopify, React Router, Cloudflare e Function solo con test completi;
  revisione trimestrale allineata alle API Shopify.
- Un alert senza percorso vulnerabile attivo si chiude solo con motivazione
  verificabile.

Non si usano: ESLint, Prettier, Prisma, Drizzle o altri ORM, Express,
`@react-router/node`, `@react-router/serve`, Hono, Next.js, Remix, `@shopify/polaris`
React, Tailwind, shadcn/ui, Bootstrap, Material UI, Sass, Redux, Zustand, Axios,
i18next, librerie fiscali o date, SDK email esterni, Sentry, Stripe, database esterni.
`zod` esiste solo come override di dipendenze transitive. Nuovi runtime, provider o
dipendenze richiedono una decisione esplicita.

## Test

La soglia e il perimetro stanno in `scripts/coverage-report.mjs`,
`config/coverage-policy.json` e `scripts/coverage-scope.mjs`.

- Vitest nel runtime Workers: logica, route, D1, sessioni, webhook, billing, cifratura.
- Test Function: fixture JSON, `shopify app function run`, build Wasm.
- Playwright mirato: Chromium, più WebKit per i percorsi pubblici e una selezione delle
  superfici embedded.
- Verifica manuale: pagamenti Shopify, checkout accelerati, review App Store.

Per i diff runtime, inclusi dipendenze e configurazioni condivise:

- almeno il 95% delle linee eseguibili modificate;
- almeno il 90% sul totale di statement, branch, funzioni e linee;
- 100% per ogni file del bundle Validation Function;
- 95% per i domini billing, webhook e Validation, con mutation score minimo dell'80%.

Non esistono baseline committate. La percentuale non sostituisce la matrice esplicita
degli esiti su fiscalità, geografia, billing, entitlement, webhook, notifiche e
migrazioni. Il tooling operativo senza runtime usa il 90% per metrica e il 95% sulle
righe modificate (D-187). I gate mutation riusano il report incrementale di `develop`,
mentre la campagna completa gira ogni lunedì (D-163).

Le migrazioni si provano con binding D1 isolati per gli snapshot intermedi, sequenza
completa locale, verifica di schema, vincoli, indici e dati, e un secondo passaggio
senza pendenze. Nessun database remoto partecipa al test.

I deploy Development non partono per sole modifiche a metadati, tooling,
documentazione, test, benchmark o sito.

### Matrici

Dati sintetici o pubblicamente documentati, mai CF di clienti reali.

**Codice Fiscale**

| Caso | Atteso |
|---|---|
| vuoto + non gestito | pass |
| vuoto + facoltativo | pass |
| vuoto + obbligatorio | errore required |
| minuscolo valido | pass dopo normalizzazione |
| spazi esterni | pass dopo trim |
| lunghezza diversa da 11/16 | invalid |
| caratteri illeciti | invalid |
| mese non ammesso | invalid |
| giorno 00 | invalid |
| giorno > 71 | invalid |
| giorno incompatibile con mese | invalid |
| 29 febbraio | accettato se struttura e checksum sono validi |
| codice catastale malformato | invalid |
| checksum errato | invalid |
| omocodia ammessa | pass |
| omocodia in posizione illecita | invalid |
| 11 cifre con carattere di controllo corretto | pass come numerico |
| 11 cifre con carattere di controllo errato | invalid |
| `00000000000` | invalid |
| trasposizione adiacente rilevabile | invalid |
| 11 caratteri con lettera | invalid |

**PEC**

| Caso | Atteso |
|---|---|
| vuota + non gestita | pass |
| vuota + facoltativa | pass |
| vuota + obbligatoria | required |
| vuota + `required_when_company` con Azienda compilata | required |
| vuota + `required_when_company` senza Azienda | pass |
| email semplice valida | pass |
| maiuscole | pass |
| spazi esterni | pass dopo trim |
| spazio interno | invalid |
| doppia `@` | invalid |
| dominio senza label valida | invalid |
| punto iniziale o finale nel dominio | invalid |
| trattino in posizione illecita | invalid |
| casella non realmente PEC ma formato email valido | pass |

**Geografia**

| Consegna | Fatturazione | Campi presenti | Regole |
|---|---|---:|---|
| Italia | Italia | sì | applicate |
| Italia | estero | sì | non applicate |
| estero | Italia | qualsiasi | non applicate |
| estero | estero | qualsiasi | non applicate |
| Italia | assente | sì | applicate |
| solo ritiro Italia | Italia/assente | sì | applicate |
| solo ritiro Italia | estero | sì | non applicate |
| ordine misto con consegna Italia | Italia/assente | sì | applicate |
| Italia | Italia/assente | no | errore globale per i campi obbligatori |
| nessuna consegna osservabile | Italia/assente | no | fail-open; con D-192 e fatturazione Italia, errore globale a Completion |

Si provano più delivery group e i tipi `SHIPPING`, `LOCAL`, `PICK_UP`, `PICKUP_POINT`,
`RETAIL` se esposti dalla versione Function.

**Configurazione**, per ogni campo e per tutte le combinazioni CF × PEC, con due
errori simultanei:

| Stato | Vuoto | Valido | Invalido |
|---|---|---|---|
| Non gestito | pass | pass | pass |
| Facoltativo e validato | pass | pass | errore invalid |
| Obbligatorio e validato | errore required | pass | errore invalid |

**Entitlement**

| Stato | `enabled` | Atteso |
|---|---:|---|
| prova valida | true | regole attive |
| ultimo giorno prova | true | regole attive fino a fine giorno locale |
| prova scaduta | true | fail-open |
| abbonamento attivo | true | regole attive |
| abbonamento ending prima di fine periodo | true | regole attive |
| abbonamento terminato | true | fail-open |
| una tantum attiva | true | regole attive |
| rimborso totale una tantum | true | fail-open |
| qualsiasi entitlement | false | fail-open |
| entitlement sconosciuto | true | fail-open |
| Function genera eccezione runtime | qualsiasi | checkout consentito tramite `blockOnFailure: false` |

Le verifiche su checkout reale non creano ordini, clienti, prodotti, selling plan o
pagamenti artificiali. Se un wallet o una modalità non è disponibile, si documenta il
limite e si copre il blocco lato server nei test automatici.

## Documentazione

`docs/index.md` è il catalogo. Un concetto vive in un solo documento; gli altri
rimandano. Ogni modifica che cambia comportamento, configurazione o operatività
aggiorna il documento di tema nella stessa PR. Un controllo CI verifica link e anchor
locali, script `npm run` citati e assenza di output generati tracciati.

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

Per Cloudflare si usa la CLI `cf` del progetto: `npx cf auth login` una volta,
poi i comandi in [operations.md](../runbooks/operations.md#cli-cloudflare).
La configurazione Workers sta in `cloudflare.config.ts`, con le mode `dev` e
`prod`.

I test usano Vitest 5. Durante `npm ci`, `postinstall` applica al runner Stryker
10.0.0 il backport della [PR #6247](https://github.com/stryker-mutator/stryker-js/pull/6247),
necessario per i nomi dei test annidati. Il backport è in
`scripts/patch-stryker-vitest.mjs` e va rimosso quando una versione pubblicata
del runner include la correzione; codice o versione inattesi interrompono
l'installazione. Non saltare gli script di installazione nei gate mutation.

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

`site:dev` usa Vite in modalità multipagina per l’anteprima statica e gli E2E,
senza caricare la configurazione Cloudflare del Worker dell’app né cancellarne
gli artefatti. Gli header e il comportamento del provider Pages sono verificati
dal workflow di deploy e dal relativo readback.

## Verifica

```sh
mise exec -- npm run verify:change
mise exec -- npm run quality:knip
mise exec -- npm run quality:workflows
mise exec -- npm test
mise exec -- npm run test:function
mise exec -- npm run test:e2e
mise exec -- npm run coverage:check
mise exec -- npm run preflight:dev
mise exec -- npm run docs:check
mise exec -- npm run check:docs
mise exec -- npm run check
```

`verify:change` è il gate locale prima del push: controlli statici, politica di
versione e test legati al diff, compresi quelli browser Chromium se cambia la UI
embedded. La CI esegue coverage, WebKit e mutation.

Knip e actionlint sono bloccanti nel gate locale e nel job CI `verify` per le
modifiche non documentali. `quality:knip` genera prima i tipi delle route e
controlla app, Worker, sito, script, test e workspace Function. Gli ingressi e le
eccezioni motivate sono in `knip.jsonc`: non usare `--fix` o esclusioni generiche
per azzerare le segnalazioni. Le dipendenze di codegen fornite da Shopify CLI e
i moduli virtuali Cloudflare non sono pacchetti mancanti.

Per actionlint eseguire `mise install actionlint`: la versione è fissata in
`mise.toml` e verificata dal comando; la CI verifica anche il checksum
dell'archivio ufficiale. ShellCheck e Pyflakes opzionali sono disabilitati per
avere lo stesso risultato in locale e CI. Una versione errata, un tool assente
o una violazione fanno fallire il controllo.

`coverage:check` misura tutto il codice eseguibile first-party, unisce i report
senza duplicare i sorgenti condivisi e scrive il report in `.coverage/global/`.
Richiede almeno il 90% sul totale, il 100% per ciascun file del bundle Shopify
Validation Function e il 95% per i domini critici billing, webhook e Validation,
sempre su statement, branch, funzioni e linee. In CI, con gli SHA di base e head,
richiede inoltre che almeno il 95% delle righe eseguibili modificate sia coperto.
Le soglie vivono in `config/coverage-policy.json`; non c'è una baseline da
aggiornare o committare.

Per ispezionare il collegamento Shopify senza permettere alla CLI di
normalizzare i file TOML del repository:

```sh
mise exec -- npm run shopify:info -- shopify.app.dev.toml
```

## Report operativi

```sh
npm run report:launch -- production
npm run report:performance -- production
npm run report:performance -- production --compare 1.2.1 1.2.2
npm run owner-control:telegram -- --check
```

Sostituisci `production` con `development` per il database Development. Sono letture
remote aggregate: le coorti descrivono i passaggi osservati negli ultimi 28 giorni,
non un abbandono certo. `rules_saved` viene raccolto soltanto dalla pubblicazione
dell’intervento D-144. Il confronto prestazioni usa versioni esplicite, richiede
100 campioni per gruppo e restituisce gli avvisi nell’output JSON, senza invii esterni.
Politiche e limiti sono in [security-privacy.md](security-privacy.md#telemetria) e D-144.

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

Lo stesso bot può esporre il Control Center privato di sola lettura tramite
`POST /internal/telegram/webhook`. I comandi disponibili sono `/dashboard`,
`/shops`, `/shop`, `/growth`, `/billing`, `/trials`, `/funnel`, `/issues`,
`/errors`, `/notifications`, `/activity`, `/health`, `/performance`, `/version`
e `/help`. D1 fornisce stato corrente, commerciale e operativo; gli aggregati
Growth 7/28 giorni e i ricavi cumulati di `/billing` arrivano dalla Partner API e
usano una cache D1 breve. I ricavi richiedono il permesso Partner `View financials`.
Le viste `/shops` e `/shop` leggono il piano Shopify corrente degli store attivi
dall'Admin API; un token non disponibile non blocca gli altri risultati.

Il Control Center richiede anche `TELEGRAM_WEBHOOK_SECRET` e
`TELEGRAM_OWNER_USER_ID`; il webhook secret contiene almeno 32 caratteri casuali.
Rimane spento finché
`OWNER_TELEGRAM_CONTROL_ENABLED` vale `false`. Il comando `--check` sopra legge
webhook e menu senza modificarli; `npm run owner-control:telegram -- --apply`
configura webhook e shortcut owner e richiede l’autorizzazione Production
descritta nel runbook.

Il dettaglio `/shop` distingue inoltre la prima apertura dell’app e il primo
ingresso nell’onboarding dai progressi successivi. Per gli store disinstallati
mostra il motivo e il commento forniti a Shopify e consente una rilettura
esplicita; i dati storici mancanti non vengono interpretati come mancate visite.
Contratto e limiti sono in `docs/runbooks/installation-diagnostics.md`.

## Riferimenti ufficiali

Le API e i requisiti cambiano: si riverificano prima di implementare o pubblicare.

### Shopify

- [Shopify Functions](https://shopify.dev/docs/apps/build/functions/index)
- [Cart and Checkout Validation Function API — latest](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation)
- [Cart and Checkout Validation Function API 2026-10](https://shopify.dev/docs/api/functions/2026-10/cart-and-checkout-validation)
- [Monitoring and handling errors in production](https://shopify.dev/docs/apps/build/functions/monitoring-and-errors) e [Test and debug Shopify Functions](https://shopify.dev/docs/apps/build/functions/test-debug-functions) — riverificare visibilità di input/output, scope richiesti, supporto di `console.log` per JavaScript e limite dei log
- [Admin GraphQL API 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10)
- [`validationCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/validationCreate)
- [`validationUpdate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/validationUpdate)
- [`ShopAddress`](https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopAddress)
- [`CheckoutAndAccountsConfiguration`](https://shopify.dev/docs/api/admin-graphql/latest/objects/CheckoutAndAccountsConfiguration) e [`TranslatableResourceType`](https://shopify.dev/docs/api/admin-graphql/latest/enums/TranslatableResourceType) — verificare se le opzioni modulo del checkout diventano leggibili (§34 punto 8)
- [Opzioni modulo del checkout](https://help.shopify.com/en/manual/checkout-settings/checkout-form-options)
- [Scaffold an app](https://shopify.dev/docs/apps/build/scaffold-app)
- [App Home](https://shopify.dev/docs/apps/build/app-home)
- [Polaris web components](https://shopify.dev/docs/api/app-home/web-components)
- [Manual pricing](https://shopify.dev/docs/apps/launch/billing/manual-pricing)
- [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
- [Billing overview](https://shopify.dev/docs/apps/launch/billing)
- [Revenue share e fee App Store](https://shopify.dev/docs/apps/launch/distribution/revenue-share)
- [`appSubscriptionCancel`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/appsubscriptioncancel)
- [`appPurchaseOneTimeCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/appPurchaseOneTimeCreate)
- [`currentAppInstallation`](https://shopify.dev/docs/api/admin-graphql/latest/queries/currentAppInstallation)
- [Offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [App distribution](https://shopify.dev/docs/apps/launch/distribution)
- [App Store visibility](https://shopify.dev/docs/apps/launch/distribution/visibility)
- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [App review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process)
- [Unique app name requirement](https://shopify.dev/changelog/updated-app-store-requirements-4-1-2-use-a-unique-name-for-your-app)

### Normativa italiana

- [D.M. 23 dicembre 1976, articolo 9](https://def.finanze.it/DocTribFrontend/executePrintArticolo.do?articolo=Articolo+9&codiceOrdinamento=200000900000000&id=%7B8D93A450-E5FE-47FC-A6F0-F938769051BF%7D) — calcolo del carattere numerico di controllo
- [D.M. 23 dicembre 1976, articolo 10](https://def.finanze.it/DocTribFrontend/executePrintArticolo.do?articolo=Articolo+10&codiceOrdinamento=200001000000000&id=%7B8D93A450-E5FE-47FC-A6F0-F938769051BF%7D) — applicazione al Codice Fiscale provvisorio

### Cloudflare

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing and logs](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
