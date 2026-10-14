# AGENTS.md

CF Ready è una public app Shopify che valida Codice Fiscale e PEC nei localized
fields del checkout italiano: React Router e TypeScript su Cloudflare Workers,
Queues per i webhook, D1 per dati e sessioni, R2 per i backup, Pages per il sito
e una Cart and Checkout Validation Function.

Fonti, in ordine: codice, test e configurazioni per il comportamento attuale;
`docs/plans/2026-07-28-CF-Ready-Master-Plan.md` per requisiti e decisioni
(`D-nnn`); `docs/adr/` per l'architettura; `README.md` e `package.json` per i
comandi. Un deliverable pianificato non è implementato finché il codice non lo
prova. Se due fonti si contraddicono, correggi quella canonica nella stessa
modifica.

## Invarianti di prodotto

- Solo Codice Fiscale e PEC, tramite `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`.
  Partita IVA, SDI, fatturazione elettronica, POS, temi, Theme App Extension e
  Checkout UI Extension sono fuori perimetro; il campo “Interno” non si rinomina.
- Ogni campo è `unmanaged`, `optional` o `required`, in modo indipendente.
  Salvare le regole e attivare la Validation restano azioni separate.
- La validazione è formale: non attesta a chi appartiene un Codice Fiscale né
  che una casella sia davvero una PEC.
- Un errore dell'app non blocca vendite legittime: configurazione o entitlement
  incerti ed errori runtime sono fail-open. Un campo obbligatorio assente blocca
  soltanto se Shopify espone almeno una consegna italiana.
- Shopify è autorevole per Validation e billing; D1 conserva stato operativo.
  Una sola Validation per store, mai toccare risorse di altre app.
- Scope Shopify minimo: niente ordini, clienti, prodotti o inventario senza un
  requisito approvato. Nuovi runtime, provider o dipendenze richiedono una
  decisione esplicita.

## Sicurezza e dati

- Segreti, token, `.env` reali, dati fiscali e personali non finiscono in
  commit, output, log, telemetria o provider esterni. Verifica le env senza
  stamparne il valore e usa fixture sintetiche.
- Le uniche eccezioni sono le notifiche Telegram private dell'owner (D-134) e il
  feedback di disinstallazione (D-159), nei limiti fissati da quelle decisioni.
- Telemetria e prestazioni conservano solo esiti, durate e aggregati
  allowlistati.
- Ai confini Shopify valida HMAC, firma, stato o nonce. Webhook e callback
  ritentabili sono idempotenti; i webhook seguono claim D1, Queue, ACK, con DLQ
  per gli errori durevoli (ADR 0002).
- Le migrazioni applicate sono immutabili: forward-fix, e mai una migrazione
  distruttiva in una release non verificata.

## Lavoro nel repository

Preserva modifiche, branch e worktree non tuoi. Una richiesta di analisi o
review si risponde senza modificare; una richiesta di fix o implementazione si
porta a termine in locale con i controlli pertinenti. Il formattatore è solo
`oxfmt` (`npm run format`): Prettier non si usa, nemmeno tramite `npx`, perché
riscrive righe estranee che `oxfmt` poi conserva. Per Cloudflare usa `cf`
(`npx cf`, D-183): `cloudflare.config.ts` è l'unica configurazione Workers e
ogni build o deploy passa `--mode dev` o `--mode prod`. Wrangler si usa solo
per i comandi elencati in
[operations.md](docs/runbooks/operations.md#cli-cloudflare). Commit, push e PR
arrivano con una richiesta esplicita o con `Pubblica`. Un bug si corregge nel punto
condiviso, con il test minimo che falliva prima del fix. Il ciclo di
pubblicazione (`publish.mjs`, `ci-lane.mjs`, `version-policy.mjs`, workflow
di CI e deploy) cambia solo per un errore riprodotto o su richiesta dell'owner,
non per affinamenti (D-191).

Per la UI embedded usa Polaris e App Bridge Web Components prima di markup o
CSS custom. UI merchant e testi checkout sono bilingui con fallback inglese,
mai a metà. Le decisioni di prodotto vanno nel Master Plan, le deviazioni
architetturali stabili in un ADR. Per incarichi delegati vedi
[CONTRIBUTING.md](CONTRIBUTING.md#preparare-un-incarico).

## Verifica

`scripts/ci-lane.mjs` classifica rischio e superficie del diff. Durante lo
sviluppo esegui test mirati; per la verifica finale usa `npm run verify:change`,
che include modifiche locali ed esegue lo stesso gate del coordinatore: controlli
statici, politica di versione e test legati al diff. Coverage, browser, build,
dry-run e mutation li esegue la CI in parallelo; in locale servono solo per
diagnosticare un errore, non prima di `Pubblica`.

| Corsia | Quando | Gate locale |
| --- | --- | --- |
| `docs` | documenti senza effetto operativo | `npm run check:docs` |
| `standard` | TypeScript, route, config, test | `npm run verify:change` |
| `full` | governance, workflow, auth, webhook, cifratura, migrazioni, manifest, lockfile | `npm run verify:change` |

Metadati non distribuiti usano solo il gate documentale; script e governance
operativa senza runtime aggiungono i test delle operazioni. In CI runtime,
dipendenze, manifest, migrazioni e configurazioni condivise mantengono
coverage globale, build e regressione browser. Percorsi sconosciuti usano il
gate completo. `npm run check` resta disponibile per una diagnosi completa.

Coverage (`npm run coverage:check`) e mutation (`npm run mutation:critical`)
valgono quando il diff tocca il loro perimetro; le soglie stanno in
`scripts/coverage-report.mjs` e in CI entrambe bloccano il merge. Provider, database remoto, browser e deploy
richiedono prove fresche: un exit code `0` non dimostra lo stato live.
Dichiara i controlli non eseguiti.

Se tocchi Function, versione API, query o CLI Shopify, riconferma il contratto
Function API `2026-10` sulle fonti Shopify correnti e rigenera con la CLI.

## Git e ambienti

| Ambiente | Branch | Versione Shopify |
| --- | --- | --- |
| Development (`dev`, `cf-ready-dev.myshopify.com`, `cf-ready-polaris-2.myshopify.com`) | `develop` | `X.Y.Z-dev.<tree>` |
| Production (`prod`) | `main` | SemVer di `package.json` |

- PR ordinarie verso `develop` in squash, titoli e commit in Conventional
  Commits, niente push diretti su `develop` o `main`.
- `main` riceve solo promozioni da `develop` unite con metodo `MERGE`: l'head
  della PR è il tip di `develop` e il commit a due parent nasce solo dal merge
  GitHub. In review verifica head e parent dalla PR GitHub, non da un commit
  sintetico locale. `develop` non si elimina mai; il riallineamento dopo la
  promozione è compito di `reconcile-develop.yml`.
- Un lotto su `develop` porta una sola SemVer. La prepara, con manifest,
  lockfile e changelog, la prima PR che cambia una superficie distribuita
  (Worker, app Shopify, migrazioni o `site/`): minor per funzionalità, patch
  per fix. Le PR successive la riusano o ne alzano il livello rispetto alla
  versione su `main`. Tooling, test, workflow e documentazione non la cambiano.
  `scripts/version-policy.mjs` lo verifica in CI e nel gate locale (D-191).
- Prima di usare il connettore Shopify leggi l'identità dello store: in
  sviluppo scrivi soltanto su `cf-ready-dev.myshopify.com` o sullo store di
  preview autorizzato `cf-ready-polaris-2.myshopify.com`.
- Prima di una scrittura remota identifica ambiente, account e store target e
  verifica credenziali, backup e rollback senza esporre segreti.

## `Pubblica`

Una richiesta affermativa e inequivocabile di pubblicare la modifica corrente
autorizza il ciclo tecnico verso Development senza seconda conferma;
“Promuovi” autorizza allo stesso modo la promozione Production del lotto su
`develop`. Domande, ipotesi e negazioni non li autorizzano. Il ciclo lo esegue
il coordinatore:

```sh
npm run publish:development   # Pubblica: PR → develop, squash, deploy Development se serve
npm run promote:production    # Promuovi: lotto develop → main, deploy applicabili, release
npm run publish:production    # Pubblica in Production: i due passi insieme
```

`Pubblica` porta la modifica su Development dal worktree pulito del branch,
anche quando prepara una SemVer. `Promuovi` parte da qualsiasi checkout e
promuove tutto ciò che è su `develop`, riusando la ricevuta Development se
dopo l'ultimo deploy non è cambiata una superficie distribuita. “Pubblica in
Production” serve a un fix urgente e promuove anche il lotto già presente.
La promozione distribuisce solo ciò che cambia: senza Worker o app Shopify
salta il deploy Production, senza `site/` salta Pages, senza nuova versione
non crea release. Dopo un errore si rilancia lo stesso comando; dettagli in
[operations.md](docs/runbooks/operations.md#coordinatore-di-pubblicazione).
Tag e GitHub Release esistono solo dopo deploy, smoke e readback verdi delle
superfici cambiate dello stesso commit. Chiudi riportando ambiente, commit, deployment ID, migrazioni e
versione di rollback, e rimuovi soltanto branch e worktree temporanei del ciclo già assorbiti.

`Pubblica` e “Promuovi” non autorizzano mai: temi Shopify live, submission App Store, billing
o nuove attivazioni produttive, TestFlight o App Store, invii Aruba, email o
scansioni reali, aggiornamenti Notion. Ognuna richiede una richiesta separata.
Fuori da “Promuovi” o da una pubblicazione in Production, deploy Production e
release richiedono un'autorizzazione esplicita.
