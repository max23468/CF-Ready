# ADR 0007: coordinatore di pubblicazione in GitHub Actions

Stato: accettato il 25 ottobre 2026, D-198. Supera in parte D-197.

## Contesto

Con D-197 il coordinatore usa solo le API REST di GitHub e gira anche in una
sessione Claude Code nel cloud, ma resta un processo della sessione per tutto il
ciclo: PR, check, merge, deploy, promozione e release, anche per più di un'ora.
Nel cloud un comando in background vive al massimo trenta minuti, o due ore con
un timeout esplicito, e la VM va in pausa dopo pochi minuti senza attività: un
ciclo lungo si interrompe e va rilanciato. Sul Mac il processo si ferma se il
Mac si spegne. Il deploy vero gira già in Actions con i segreti dei workflow.

## Decisione

Il coordinatore gira nel workflow `publish.yml`, avviato da `develop` con
`workflow_dispatch`. I comandi npm restano gli stessi e sono l'unico percorso,
sul Mac come nel cloud: eseguono il gate locale, riallineano e pubblicano il
branch, avviano il workflow tramite REST e lo seguono fino all'esito. Rilanciare
lo stesso comando riaggancia il run attivo, o ne avvia uno nuovo dopo un
fallimento; il titolo del run (`run-name`) contiene operazione, branch e commit
e fa da legame, perché `workflow_dispatch` non restituisce l'ID del run.

Il workflow usa un PAT fine-grained dell'owner, solo su `CF-Ready`, nel secret
`PUBLISH_TOKEN` dell'environment `Publication`, limitato a `develop`. PR, merge
e push fatti con il `GITHUB_TOKEN` non avvierebbero CI né `reconcile-develop`, e
la GitHub App di riconciliazione non si riusa perché ha il bypass del ruleset di
`develop`. Il workflow copia il coordinatore da `develop` prima di passare al
candidato, così un branch non esegue la propria versione del ciclo. Non installa
dipendenze npm: il coordinatore usa solo moduli Node e `gh`.

Il gate locale resta nel comando, prima del push, con la ricevuta per tree di
D-196. La ricevuta del ciclo nasce nel run, anche dopo un errore, come artifact
`publication-record`; il comando la scarica, la riassume e la conserva in
`cf-ready-publications`, poi pulisce il checkout locale come prima.

Le sessioni cloud si preparano con `.claude/cloud-setup.sh`, richiamato dallo
setup script dell'ambiente, messo in cache, e dall'hook `SessionStart`, che
rende disponibile il PATH. Lo script scarica Node e actionlint nelle versioni di
`mise.toml` dai rilasci ufficiali con verifica del checksum, installa npm, le
dipendenze del lockfile e Chromium di Playwright, e salta i passi già fatti.
Il comando completa un clone superficiale o a branch singolo prima del gate e
considera facoltativa la ricevuta scaricata come artifact, perché il download
passa da uno storage che la rete cloud può bloccare: l'esito è quello del run
letto via REST.
Un hook di progetto blocca Prettier anche dove l'hook globale del Mac manca.

## Conseguenze

Il Mac o la sessione cloud servono solo per gate e avvio: dopo, chiuderli non
ferma la pubblicazione. Il ciclo consuma minuti di Actions mentre attende CI e
deploy, gratuiti per un repository pubblico, e la concorrenza `publication` ne
esegue uno alla volta: un terzo avvio mentre uno è in coda annulla quello in
attesa, che si rilancia. Il PAT va rinnovato alla scadenza scelta dall'owner e
compare nell'inventario dei secret. Le fasi del coordinatore si leggono nel log
del run e nella ricevuta finale; durante l'attesa il comando mostra stato e step
del run almeno ogni cinque minuti.
