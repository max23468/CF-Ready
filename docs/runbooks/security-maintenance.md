# Manutenzione sicurezza

Questo runbook raccoglie i controlli periodici di repository, dipendenze e
provider senza introdurre una seconda corsia di deploy.

## Controlli automatici

`security-maintenance.yml` esegue:

- ogni mese: audit npm senza eccezioni, firme del registry, documenti,
  ruleset GitHub pubblici, alert Dependabot/CodeQL/Secret Scanning e ultimo
  esito di ogni workflow attivo;
- ogni trimestre: identità e accessi Shopify/Cloudflare Development, stato
  coordinato della versione attiva, D1, secret Worker e smoke HTTP.

Il workflow trimestrale è in sola lettura. Non applica migrazioni, non pubblica
versioni e non accede a Production. L'esecuzione manuale lancia entrambi i job.
I required checks vivono anche nei ruleset pubblici. `ci-policy` è pubblicato
da `pull_request_target` sullo SHA candidato, ma esegue soltanto il workflow e
lo script del branch predefinito attendibile: non fa checkout, fetch,
installazioni o esecuzioni dell'HEAD della PR. Il control plane comprende tutti
i workflow, `scripts/**`, manifest e lockfile npm, configurazioni dei runner e
setup test. Rinomine e cancellazioni controllano anche il percorso precedente.
Le modifiche a questa superficie passano soltanto se il proprietario applica
l'etichetta `ci-policy-approved`: il relativo evento pubblica lo stato sullo SHA
candidato esatto e ogni commit successivo lo invalida. Dependabot resta ammesso
soltanto quando mittente, ID e tipo coincidono con il bot autorevole letto da
GitHub. In questo modo una PR non può modificare i propri selettori, comandi o
gate e poi dichiararli verdi. Il bootstrap della prima attivazione
richiede la verifica manuale dell'esatto SHA prima del merge; dopo il merge
`ci-policy` deve essere required nei ruleset di `develop` e `main`.

Gli alert usano il secret
`SECURITY_AUDIT_TOKEN` dell'environment `Security Maintenance`, ammesso soltanto
su `develop`; il job dichiara `deployment: false`, quindi non crea notifiche o
ricevute di deploy. Il token è un PAT fine-grained senza scadenza, limitato a
`CF-Ready` e in sola lettura su metadati, Actions e alert Dependabot, CodeQL e
Secret Scanning: non può scrivere sul repository e non va rinnovato
periodicamente. I token ordinari dei workflow non ricevono la bypass list dei
ruleset. Il token effimero della GitHub App dispone invece di Administration in
scrittura, requisito imposto da GitHub per osservare gli attori, ma il workflow
lo usa soltanto in lettura per il preflight del ruleset e per le operazioni Git
autorizzate. `Reconcile develop` richiede un solo bypass `Integration` con actor
ID e modalità attesi prima di verificare slug, parent, tree e provenienza del
deploy; una deriva della lista ferma quindi il run prima della scrittura.

## GitHub App di riallineamento

Il fast-forward post-Production usa una GitHub App dedicata, installata soltanto
su `CF-Ready`, con permessi Contents e Administration in scrittura.
Administration è concesso perché GitHub redige `bypass_actors` a chi non può
scrivere il ruleset; il codice non invoca endpoint di mutazione della governance.
L'environment `Repository Governance` conserva `RECONCILIATION_APP_ID` e
`RECONCILIATION_APP_PRIVATE_KEY`; la chiave privata genera un token effimero per
ogni run e non viene usata dagli altri workflow. Il ruleset `develop governance`
ammette l'Integration ID dell'app in modalità `always`. Nessun utente, ruolo o
GitHub Actions generico entra nella bypass list.

Prima del fast-forward un preflight separato verifica ruleset e unicità del
bypass; lo script di riconciliazione verifica poi app, branch remoti, due parent
del merge Production, secondo parent uguale all'HEAD corrente di `develop`, tree
identici e ricevuta Production. L'avvio manuale richiede sempre di scegliere la
provenienza: `deploy-retry` cerca e verifica il deploy verde dello stesso commit
anche quando serve un recupero di sola ascendenza; `no-deploy-promotion` non
cerca ricevute e vale soltanto per una promozione `main` dichiarata senza deploy.
In quest'ultimo caso il workflow termina verde senza scrivere se il parent
`develop` promosso è ancora l'HEAD; se `develop` è avanzato, il tree del merge
deve essere identico al parent promosso, il branch corrente deve esserne un
avanzamento lineare e il nuovo merge conserva esattamente il tree corrente di
`develop`.
La scrittura è non forzata, soggetta al ruleset e seguita da readback. Una
concorrenza, un merge anomalo o una configurazione incompleta fermano il
riallineamento senza modificare provider o contenuto del branch.

## Dipendenze npm

Il repository usa npm 12 e il relativo lockfile v4. React Router `8.3.0`
risolve `GHSA-qwww-vcr4-c8h2`; `npm audit` e `dependency-review` non ammettono
eccezioni. Finché Shopify non amplia la propria peer dependency, il manifest
root corregge soltanto quel metadato con `packageExtensions`.

GitHub documenta Dependabot fino a npm 11. Alert e security update restano
attivi, ma ogni PR che non riesca ad aggiornare il lockfile v4 va sostituita da
un aggiornamento ordinario generato e verificato con la versione npm fissata nel
repository. Non usare `--force` o `--legacy-peer-deps`.

## Gestione di un fallimento

1. aprire il run e identificare il primo controllo fallito senza copiare
   credenziali o output sensibili;
2. verificare l'alert o lo stato direttamente nel provider;
3. correggere tramite PR ordinaria verso `develop` con test e audit completi;
4. ruotare subito le credenziali soltanto se risultano compromesse;
5. pubblicare Development e ripetere il workflow manuale.

Se `ci-policy` fallisce su una modifica intenzionale al control plane, il
proprietario deve ispezionare l'intero diff, rimuovere l'eventuale etichetta
stale e applicare personalmente `ci-policy-approved` all'HEAD corrente. Non si
riavvia né si forza il check generato da un evento di terzi. La rimozione del
required check richiede una modifica esplicita del ruleset e va trattata come
incidente di governance.

I controlli locali equivalenti sono `npm run audit:security`,
`npm audit signatures`, `npm run docs:check` e `npm run readback:dev`. Il
readback confronta direttamente la versione Shopify e il Worker attivi; il
preflight di deploy lega invece entrambi a `GITHUB_SHA`.
