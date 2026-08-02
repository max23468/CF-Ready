# Manutenzione sicurezza

Questo runbook raccoglie i controlli periodici di repository, dipendenze e
provider senza introdurre una seconda corsia di deploy.

## Controlli automatici

`security-maintenance.yml` esegue:

- ogni mese: audit npm con eccezioni puntuali, firme del registry, documenti,
  ruleset GitHub pubblici e ultimo esito dei workflow critici;
- ogni trimestre: identità e accessi Shopify/Cloudflare Development, stato
  coordinato della versione attiva, D1, secret Worker e smoke HTTP.

Il workflow trimestrale è in sola lettura. Non applica migrazioni, non pubblica
versioni e non accede a Production. L'esecuzione manuale lancia entrambi i job.
I required checks vivono anche nei ruleset pubblici, così il readback mensile
non richiede un token con permessi amministrativi. L'API pubblica e il token
standard di Actions non espongono bypass actor, auto-merge e cancellazione
automatica dei branch: l'owner li verifica nelle impostazioni del repository
quando esegue la manutenzione mensile. Il workflow non può terminare con esito
positivo finché l'owner non approva l'environment `Security governance` dopo
aver confermato che non esistono bypass actor, che l'auto-merge è attivo e che
la cancellazione automatica globale dei branch è disattivata.

`Security governance` è un prerequisito del workflow: nelle impostazioni
GitHub deve avere `max23468` come required reviewer e una deployment branch
policy limitata a `develop`. Il readback effettuato durante l'introduzione del
gate ha confermato entrambe le protection rule; se l'environment viene ricreato
o modificato, l'owner deve ripetere il readback prima del run successivo.

## Advisory React Router

L'audit ammette soltanto
[`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2),
che riguarda le API RSC instabili. Il repository non le usa e Shopify dichiara
compatibilità con React Router 7 tramite la peer dependency del proprio
pacchetto applicativo.

Il gate fallisce se compare un advisory diverso o se viene introdotta una API
`unstable_*` nel runtime, inclusi gli helper RSC che non contengono `RSC` nel
nome. Non usare `npm audit fix --force`: l'upgrade a React Router 8 richiede
prima il supporto del pacchetto Shopify e il gate completo della toolchain.

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
