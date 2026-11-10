# AGENTS.md

CF Ready è una public app Shopify che valida Codice Fiscale e PEC nei localized
fields del checkout italiano: React Router e TypeScript su Cloudflare Workers,
Queues per i webhook, D1 per dati e sessioni, R2 per i backup, Pages per il sito
e una Cart and Checkout Validation Function.

Fonti, in ordine: codice, test e configurazioni per il comportamento attuale;
i documenti di tema in `docs/product/` e `docs/engineering/` per ciò che deve valere
oggi; `docs/decisions.md` per le decisioni in vigore e il loro perché (`D-nnn`);
`docs/adr/` per le scelte architetturali stabili; `docs/engineering/development.md`
e `package.json` per i comandi. `docs/index.md` è il catalogo. `docs/archive/` è
storia e non è mai fonte di requisiti: una `D-nnn` assente dal registro si legge
in `docs/archive/decisions-2026.md`. Se documento di tema e registro si
contraddicono prevale il documento di tema; ogni contraddizione si corregge
nella stessa modifica.

## Invarianti di prodotto

- Solo Codice Fiscale e PEC, tramite `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`.
  Partita IVA, SDI, fatturazione elettronica, POS, temi, Theme App Extension e
  Checkout UI Extension sono fuori perimetro.
- Ogni campo è `unmanaged`, `optional` o `required`, in modo indipendente.
  Salvare le regole e attivare la Validation restano azioni separate.
- Shopify è autorevole per Validation e billing; D1 conserva stato operativo.
  Una sola Validation per store, mai toccare risorse di altre app.
- Scope Shopify minimo: niente ordini, clienti, prodotti o inventario senza un
  requisito approvato. Nuovi runtime, provider o dipendenze richiedono una
  decisione esplicita.

## Lavoro nel repository

Ogni modifica si fa in un worktree dedicato creato da `origin/develop`, mai nel
checkout principale, che è condiviso con altre sessioni; lì si fanno solo
letture. Un fix o un'implementazione si porta a termine in locale con i
controlli pertinenti. Un bug si corregge nel punto condiviso, con il test minimo
che falliva prima del fix.

Il formattatore è solo `oxfmt` (`npm run format`): Prettier non si usa, nemmeno
tramite `npx`, perché riscrive righe estranee. Per Cloudflare usa `cf`
(`npx cf`, D-183): `cloudflare.config.ts` è l'unica configurazione Workers e
ogni build o deploy passa `--mode dev` o `--mode prod`. Wrangler si usa solo
per i comandi elencati in [operations.md](docs/runbooks/operations.md#cli-cloudflare).

Prima di `Pubblica` il lavoro resta locale: implementazione, controlli e commit
nel worktree. Push e PR, anche in bozza, li fa `Pubblica` con il coordinatore,
che poi unisce e distribuisce (D-222).

Per la UI embedded usa Polaris e App Bridge Web Components prima di markup o
CSS custom. UI merchant e testi checkout sono bilingui con fallback inglese,
mai a metà.

Una decisione nuova entra in `docs/decisions.md` solo se c'era un'alternativa
reale, nella stessa PR che aggiorna il documento di tema; le regole del
registro sono in testa al file. Una deviazione architetturale stabile va in un
ADR. Chi aggiunge o cambia una regola toglie le copie negli altri documenti
nella stessa PR; una regola applicata da uno script si descrive citando lo
script. Le idee non ancora decise stanno in `docs/roadmap.md`.

## Verifica

`scripts/ci-lane.mjs` classifica rischio e superficie del diff. Durante lo
sviluppo esegui test mirati; per la verifica finale usa `npm run verify:change`,
che include modifiche locali ed esegue lo stesso gate del coordinatore: controlli
statici, politica di versione e test legati al diff, compresi quelli browser
Chromium se cambia la UI embedded. Un tree già verde non ripete il gate.
Coverage, WebKit, build, dry-run e mutation li esegue la CI in parallelo; in
locale servono solo per diagnosticare un errore, non prima di `Pubblica`.

| Corsia | Quando | Gate locale |
| --- | --- | --- |
| `docs` | documenti senza effetto operativo | `npm run check:docs` |
| `standard` | TypeScript, route, config, test | `npm run verify:change` |
| `full` | governance, workflow, auth, webhook, cifratura, migrazioni, manifest, lockfile | `npm run verify:change` |

Percorsi sconosciuti usano il gate completo; `npm run check` resta disponibile
per una diagnosi completa. Le soglie di coverage e mutation stanno in
`scripts/coverage-report.mjs` e in CI bloccano il merge. Provider, database
remoto, browser e deploy richiedono prove fresche: un exit code `0` non dimostra
lo stato live. Dichiara i controlli non eseguiti.

Se tocchi Function, versione API, query o CLI Shopify, riconferma il contratto
Function API `2026-10` sulle fonti Shopify correnti e rigenera con la CLI.

Le prove manuali dell'app embedded si fanno in Chrome, con la scheda in primo
piano: con la scheda nascosta le View Transitions e `web-vitals` non
funzionano. Si scrive solo su `cf-ready-dev` o `cf-ready-polaris-2` in
Development e solo su `numisleo.myshopify.com` in Production. Dopo ogni
pubblicazione si percorrono le pagine toccate sullo store reale (`cf-ready-polaris-2`
per il nuovo Admin, `cf-ready-dev` per il precedente, `numisleo` in Production)
e gli screenshot vengono da lì, non dai test browser locali.

## Git e ambienti

| Ambiente | Branch | Versione Shopify |
| --- | --- | --- |
| Development (`dev`, `cf-ready-dev.myshopify.com`, `cf-ready-polaris-2.myshopify.com`) | `develop` | `X.Y.Z-dev.<tree>` |
| Production (`prod`) | `main` | SemVer di `package.json` |

- PR ordinarie verso `develop` in squash, titoli e commit in Conventional
  Commits, niente push diretti su `develop` o `main`.
- `main` riceve solo promozioni da `develop` unite con metodo `MERGE`: in review
  verifica head e parent dalla PR GitHub, non da un commit sintetico locale.
  `develop` non si elimina mai; il riallineamento dopo la promozione è compito
  di `reconcile-develop.yml`.
- Un lotto su `develop` porta una sola SemVer, preparata dalla prima PR che
  cambia una superficie distribuita e verificata da `scripts/version-policy.mjs`
  (D-191, [development.md](docs/engineering/development.md#versionamento)).
- Prima di una scrittura remota identifica ambiente, account e store target e
  verifica credenziali, backup e rollback senza esporre segreti.

## `Pubblica`

Una richiesta affermativa e inequivocabile di pubblicare la modifica corrente
autorizza il ciclo tecnico verso Development senza seconda conferma;
“Promuovi” autorizza allo stesso modo la promozione Production del lotto su
`develop`, e “Pubblica in Production” i due passi insieme per un fix urgente.
Domande, ipotesi e negazioni non li autorizzano. La parola vale ovunque l'owner
la scriva: chat del progetto, thread o sessione locale. Chi la inoltra a
un'altra sessione (thread, Remote Control sul Mac) cita testo, autore, ora e id
del messaggio originale; chi la riceve così la tratta come autorizzazione
dell'owner e non la richiede di nuovo. Senza la citazione del messaggio
originale serve una conferma.

```sh
npm run publish:development   # Pubblica
npm run promote:production    # Promuovi
npm run publish:production    # Pubblica in Production
```

Il ciclo è descritto nell'[ADR 0009](docs/adr/0009-publication-cycle.md) e in
[operations.md](docs/runbooks/operations.md#coordinatore-di-pubblicazione); dopo
un errore si rilancia lo stesso comando. Chiudi riportando ambiente, commit,
deployment ID, migrazioni e versione di rollback, e rimuovi soltanto branch e
worktree temporanei del ciclo già assorbiti.

`Pubblica` e “Promuovi” autorizzano anche i controlli di sicurezza Shopify locali
obbligatori sul candidato e la review dell'agente corrente, senza una seconda
conferma. Nuovi provider o invio del codice a servizi esterni richiedono invece
un'autorizzazione specifica. Fuori da “Promuovi” o da una pubblicazione in
Production, deploy Production e release richiedono un'autorizzazione esplicita.
