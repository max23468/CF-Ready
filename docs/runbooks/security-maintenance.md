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
I required checks vivono anche nei ruleset pubblici. Gli alert usano il secret
`SECURITY_AUDIT_TOKEN` dell'environment `Security Maintenance`, ammesso soltanto
su `develop`; il job dichiara `deployment: false`, quindi non crea notifiche o
ricevute di deploy. Il token è un PAT fine-grained senza scadenza, limitato a
`CF-Ready` e in sola lettura su metadati, Actions e alert Dependabot, CodeQL e
Secret Scanning: non può scrivere sul repository e non va rinnovato
periodicamente. I token dei workflow non ricevono la bypass list dei ruleset.
`Reconcile develop` verifica invece lo slug del token effimero, parent, tree e
provenienza del deploy; GitHub applica il ruleset sulla scrittura non forzata e
rifiuta il riallineamento se quella App non è il bypass autorizzato.

## GitHub App di riallineamento

Il fast-forward post-Production usa una GitHub App dedicata, installata soltanto
su `CF-Ready`, con permesso Contents in scrittura e Administration in lettura.
L'environment `Repository Governance` conserva `RECONCILIATION_APP_ID` e
`RECONCILIATION_APP_PRIVATE_KEY`; la chiave privata genera un token effimero per
ogni run e non viene usata dagli altri workflow. Il ruleset `develop governance`
ammette l'Integration ID dell'app in modalità `always`. Nessun utente, ruolo o
GitHub Actions generico entra nella bypass list.

Prima del fast-forward lo script verifica app, branch remoti, due parent del
merge Production, secondo parent uguale all'HEAD corrente di `develop` e tree
identici. La scrittura è non forzata, soggetta al ruleset e seguita da readback. Una
concorrenza su `develop`, un merge anomalo o una configurazione incompleta
fermano il riallineamento senza influire sul deploy Production già concluso.

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

I controlli locali equivalenti sono `npm run audit:security`,
`npm audit signatures`, `npm run docs:check` e `npm run readback:dev`. Il
readback confronta direttamente la versione Shopify e il Worker attivi; il
preflight di deploy lega invece entrambi a `GITHUB_SHA`.
