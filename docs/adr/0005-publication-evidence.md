# ADR 0005: prove riusabili e verifica per superficie

Stato: accettato il 13 ottobre 2026, D-187.

## Contesto

Il coordinatore riusava i gate della PR per avviare il deploy, ma la CI del push
su `develop` ripeteva gli stessi controlli e poteva trattenere la promozione con
check omonimi. La coverage raccoglieva in sequenza app, browser, Function e
operazioni. Modifiche a metadati e tooling avviavano anche browser e deploy.
Un retry Production poteva tentare di ricreare una versione Shopify esistente.

## Decisione

`ci-lane.mjs` mantiene la corsia di rischio e seleziona la superficie:
metadati, operazioni o runtime. I percorsi sconosciuti e i diff misti conservano
il gate più ampio. Le soglie D-141 non cambiano; per solo tooling operativo
si misura l'inventario completo delle operazioni, senza usare report runtime
obsoleti. Metadati non distribuiti non richiedono una raccolta coverage.

Le raccolte coverage hanno directory e job distinti. Il check aggregato
verifica commit e tree di ogni report richiesto prima di applicare soglie,
inventario e coverage delle righe modificate. Errori, parti mancanti o
provenienze diverse bloccano il check stabile `coverage`.

Il push su `develop` può riusare soltanto la CI della PR che ha prodotto quello
squash con tree identico. Servono l'ultimo run PR verde del workflow canonico,
i check `verify`, `coverage`, `e2e`, `mutation` di quel run, l'artifact finale
di riusabilità e i report incrementali dei domini richiesti, non scaduti.
Il riallineamento a un merge Production segue soltanto il secondo parent di
una promozione GitHub unita da `develop` a `main`, con tree identico, fino alla
PR Development verificata. In assenza di una prova si esegue la suite ordinaria. I report incrementali
vengono trasferiti nella cache `develop`, mantenendo la campagna completa
settimanale. La policy sul commit esatto e i controlli provider non si ereditano.

Il preflight Production calcola azioni indipendenti per Shopify e Worker:
deploy nuovo, rilascio di una versione Shopify dello stesso commit o sola
verifica della risorsa già attiva. Una collisione di SemVer o una provenienza
ambigua interrompe il ciclo. Il rollback delle scritture parziali usa una
coppia storica Worker/Shopify dello stesso commit; le migrazioni restano forward-fix.

Il coordinatore conserva ricevute e durate nei metadati Git, fuori dal tree
distribuito. I retry rinnovano i readback di Worker e Shopify. La pulizia
riguarda soltanto il branch temporaneo `codex/` ancora fermo sul candidato,
con checkout pulito e tree identico allo squash. L'inventario dei file ignorati
usa directory compatte, evitando di enumerare ogni file di `node_modules`.
Worktree con file ignorati
non generati, checkout principali e branch estranei si conservano. I worktree
gestiti da Codex vengono archiviati dall'host, senza rimuovere la registrazione
dell'app tramite comandi Git.

## Conseguenze

Il riuso riduce calcolo e collisioni tra check senza rimuovere i required check.
Il parallelismo può aumentare il consumo istantaneo dei runner: si misurano
le fasi e si confrontano i run successivi, senza promettere tempi live prima
della pubblicazione. Gli artifact scadono dopo sette giorni; un retry tardivo
torna alla verifica ordinaria.

I contratti sono coperti dai test esistenti di CI, coverage, preflight,
entrypoint operativi e pubblicazione. Le autorizzazioni di `AGENTS.md` restano
separate dalla selezione tecnica dei controlli.
