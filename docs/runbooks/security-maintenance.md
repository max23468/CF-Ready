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
I required checks vivono anche nei ruleset pubblici, così il readback mensile
non richiede un token con permessi amministrativi. L'API pubblica e il token
standard di Actions non espongono bypass actor, auto-merge e cancellazione
automatica dei branch: l'owner li verifica nelle impostazioni del repository
soltanto quando modifica la governance. Questi controlli non aggiungono
approvazioni o notifiche al workflow periodico.

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
