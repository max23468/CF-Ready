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
porta a termine in locale con i controlli pertinenti. Commit, push e PR
arrivano con una richiesta esplicita o con `Pubblica`. Un bug si corregge nel punto
condiviso, con il test minimo che falliva prima del fix.

Per la UI embedded usa Polaris e App Bridge Web Components prima di markup o
CSS custom. UI merchant e testi checkout sono bilingui con fallback inglese,
mai a metà. Le decisioni di prodotto vanno nel Master Plan, le deviazioni
architetturali stabili in un ADR. Per incarichi delegati vedi
[CONTRIBUTING.md](CONTRIBUTING.md#preparare-un-incarico).

## Verifica

`scripts/ci-lane.mjs` classifica il diff; esegui il gate della corsia:

| Corsia | Quando | Gate locale |
| --- | --- | --- |
| `docs` | documenti senza effetto operativo | `npm run check:docs` |
| `standard` | TypeScript, route, config, test | test mirati, `npm run check:standard` |
| `full` | governance, workflow, auth, webhook, cifratura, migrazioni, manifest, lockfile | `npm run check` |

Coverage (`npm run coverage:check`) e mutation (`npm run mutation:critical`)
valgono quando il diff tocca il loro perimetro; le soglie stanno in
`scripts/coverage-report.mjs` e in CI entrambe bloccano il merge. Il
coordinatore di `Pubblica` ripete da sé gate di corsia e coverage prima del push. Provider, database remoto, browser e deploy
richiedono prove fresche: un exit code `0` non dimostra lo stato live.
Dichiara i controlli non eseguiti.

Se tocchi Function, versione API, query o CLI Shopify, riconferma il contratto
Function API `2026-07` sulle fonti Shopify correnti e rigenera con la CLI.

## Git e ambienti

| Ambiente | Branch | Versione Shopify |
| --- | --- | --- |
| Development (`dev`, `cf-ready-dev.myshopify.com`) | `develop` | `X.Y.Z-dev.<tree>` |
| Production (`prod`) | `main` | SemVer di `package.json` |

- PR ordinarie verso `develop` in squash, titoli e commit in Conventional
  Commits, niente push diretti su `develop` o `main`.
- `main` riceve solo promozioni da `develop` unite con metodo `MERGE`: l'head
  della PR è il tip di `develop` e il commit a due parent nasce solo dal merge
  GitHub. In review verifica head e parent dalla PR GitHub, non da un commit
  sintetico locale. `develop` non si elimina mai; il riallineamento dopo la
  promozione è compito di `reconcile-develop.yml`.
- La SemVer si prepara nella PR verso `develop` (minor per funzionalità, patch
  per fix) con manifest, lockfile e changelog, e resta la stessa fino alla
  promozione. Documentazione e governance agentica da sole non la cambiano.
- Prima di usare il connettore Shopify leggi l'identità dello store: in
  sviluppo scrivi soltanto su `cf-ready-dev.myshopify.com`.
- Prima di una scrittura remota identifica ambiente, account e store target e
  verifica credenziali, backup e rollback senza esporre segreti.

## `Pubblica`

Una richiesta affermativa e inequivocabile di pubblicare la modifica corrente
autorizza l'intero ciclo tecnico senza seconda conferma. Domande, ipotesi e
negazioni non lo autorizzano. Il ciclo lo esegue il coordinatore, dal worktree
pulito del branch:

```sh
npm run publish:development   # PR → develop, squash, deploy Development
npm run publish:production    # + promozione, deploy, readback, release
```

`Pubblica` usa `publish:production` quando la modifica porta una nuova SemVer,
perché ogni promozione crea la release `v<versione>`. Senza bump (solo
documentazione o governance) o con “pubblica senza promuovere” usa
`publish:development`. Dopo un errore si rilancia lo stesso comando; dettagli
in [operations.md](docs/runbooks/operations.md#coordinatore-di-pubblicazione).
Tag e GitHub Release esistono solo dopo deploy, smoke e readback verdi dello
stesso commit. Chiudi riportando ambiente, commit, deployment ID, migrazioni e
versione di rollback, e rimuovi soltanto branch e worktree temporanei del ciclo già assorbiti.

`Pubblica` non autorizza mai: temi Shopify live, submission App Store, billing
o nuove attivazioni produttive, TestFlight o App Store, invii Aruba, email o
scansioni reali, aggiornamenti Notion. Ognuna richiede una richiesta separata.
Fuori da una richiesta di pubblicazione, deploy Production e release
richiedono un'autorizzazione esplicita.
