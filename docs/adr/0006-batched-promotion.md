# ADR 0006: promozione a lotti e superficie di rilascio

Stato: accettato il 14 ottobre 2026, D-191.

## Contesto

Ogni modifica con bump SemVer veniva promossa subito: 34 promozioni in quindici
giorni, 7 in un giorno, ciascuna con PR, deploy Production, versione Shopify e
release. Le PR alzavano la versione anche quando quella del lotto non era
ancora stata promossa, bruciando la 2.2.9 e la 2.2.12, e modifiche di solo
tooling portavano una release. Il gate locale ripeteva in serie i controlli che
la CI esegue subito dopo in parallelo.

## Decisione

La pubblicazione si divide in due passi. `publish:development` porta la modifica
su `develop` e Development; `promote:production` promuove il tip di `develop`
quando l'owner lo chiede. `publish:production` li esegue insieme per un fix
urgente.

`releaseSurface` in `ci-lane.mjs` è l'unica definizione di superficie
distribuita: Worker, app Shopify, migrazioni e configurazioni runtime per il
deploy, più `site/` per la release. `package.json` conta solo se cambia oltre
la versione e gli script di tooling; gli script di build, install e prepare
restano distribuiti. Development, promozione e politica di versione usano la
stessa funzione.

`version-policy.mjs` confronta la versione di `main`, della base e della PR: il
primo cambiamento distribuito del lotto richiede un bump di un passo, gli altri
riusano la versione o ne alzano il livello, e un bump senza superficie
distribuita è rifiutato. Le PR Dependabot sono esenti dal bump obbligatorio; la
promozione rifiuta superfici distribuite senza nuova versione.

La promozione riusa la ricevuta dell'ultimo deploy Development riuscito se poi
non cambia una superficie distribuita. Dopo il merge avvia solo i deploy delle
superfici cambiate rispetto al primo parent e crea la release solo per una
nuova versione. Senza deploy, il collegamento di `develop` resta alla modalità
`no-deploy-promotion` della promozione successiva.

## Conseguenze

Le release seguono i lotti e non le singole PR; Production riceve una modifica
quando l'owner promuove, non al merge. Un fix urgente porta con sé il lotto già
su `develop`. Il gate locale non misura più la coverage: un calo emerge nella
CI della PR, che resta bloccante con le stesse soglie.
