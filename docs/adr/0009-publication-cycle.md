# ADR 0009: ciclo di pubblicazione

Stato: accettato il 9 novembre 2026 (D-220). Riunisce e sostituisce gli ADR
0005, 0006 e 0007, ora in [archivio](../archive/adr/), e descrive il ciclo
stabilito da D-138, D-191, D-197, D-198 e D-217. Il manuale operativo è in
[operations.md](../runbooks/operations.md#coordinatore-di-pubblicazione).

## Contesto

Ogni PR con bump veniva promossa subito, il push su `develop` ripeteva gate già
verdi sullo stesso tree, modifiche di soli metadati avviavano browser e deploy,
e il coordinatore era un processo locale che si fermava con il Mac o con la
sessione cloud. Le regole erano cresciute in tredici decisioni e tre ADR.

## Decisione

**Due passi.** `publish:development` porta la modifica su `develop` e su
Development; `promote:production` promuove il tip di `develop` quando l'owner
lo chiede; `publish:production` esegue i due passi insieme per un fix urgente.
I comandi npm sono l'unico percorso, sul Mac come nel cloud.

**Coordinatore in Actions.** Il comando esegue il gate locale, riallinea e
pubblica il branch, avvia `publish.yml` su `develop` tramite REST e lo segue
fino all'esito. Rilanciarlo riaggancia il run attivo o ne avvia uno nuovo; il
titolo del run, con operazione, branch e commit, fa da legame. Il workflow usa
il PAT dell'owner in `PUBLISH_TOKEN` (environment `Publication`), perché con il
`GITHUB_TOKEN` PR e merge non avvierebbero CI né riallineamento, e copia il
coordinatore da `develop` prima di passare al candidato. Usa solo le API REST
di GitHub, senza auto-merge, perché il proxy delle sessioni cloud rifiuta
GraphQL.

**Superficie e versione.** `releaseSurface` in `ci-lane.mjs` è l'unica
definizione di superficie distribuita: Worker, app Shopify, migrazioni,
configurazioni runtime e `site/`. Un lotto porta una sola SemVer:
`version-policy.mjs` chiede il bump alla prima PR distribuita del lotto, lascia
le successive riusarla o alzarne il livello e rifiuta un bump senza superficie.
La promozione distribuisce solo le superfici cambiate e crea la release solo
per una nuova versione.

**Prove riusabili.** `ci-lane.mjs` sceglie corsia e superficie; percorsi
sconosciuti e diff misti usano il gate più ampio. Il push su `develop` riusa la
CI della PR solo con tree identico, ultimo run verde e artifact completi; la
promozione riusa la ricevuta Development se dopo l'ultimo deploy non è cambiata
una superficie distribuita. Policy sul commit esatto, controlli provider,
readback, smoke e rollback non si ereditano mai. Il gate locale
(`verify:change`) lascia una ricevuta per tree, così `Pubblica` non lo ripete;
cosa esegue è descritto in
[operations.md](../runbooks/operations.md#coordinatore-di-pubblicazione).

**Riallineamento.** Dopo una promozione una GitHub App dedicata riporta
`develop` sul merge Production solo per fast-forward a tree identico. È l'unica
identità che oltrepassa il ruleset di `develop`.

**Pulizia.** Il coordinatore conserva la ricevuta del ciclo e rimuove soltanto
il branch temporaneo, `codex/` o di un worktree in `.claude/worktrees/`, ancora
fermo sul candidato, con checkout pulito e tree identico allo squash. I branch uniti li elimina `dependabot-automerge.yml`.

## Conseguenze

Production cambia quando l'owner promuove, non al merge; un fix urgente porta
con sé il lotto già su `develop`. Chiudere la sessione dopo l'avvio non ferma la
pubblicazione. Il ciclo segue le regole ordinarie del repository (D-217): si
modifica con test mirati come il resto del codice, e una modifica che cambia
questo quadro aggiorna questo ADR nella stessa PR.
