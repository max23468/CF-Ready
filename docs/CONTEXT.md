# Contesto corrente

Aggiornato il 28 luglio 2026.

## Stato

M0 e M2 sono completate. M1 è in corso: scaffold React Router, adattamento
Workers, SessionStorage D1 cifrato, Home minimale e autenticazione webhook sono
presenti e superano il gate locale.

Sono disponibili:

- repository GitHub privato `max23468/CF-Ready`;
- app Shopify Development, Testing e Production nell’organizzazione Temisfera;
- progetto Cloudflare Pages `cf-ready`;
- sottodominio Workers `tmsf.workers.dev`;
- database D1 `cf-ready-db-test` e `cf-ready-db-prod`;
- bucket R2 `cf-ready-backups-test` e `cf-ready-backups-prod`, con location hint
  Europa occidentale;
- nomi definiti per i Worker secondo il Master Plan;
- baseline documentale, ADR, inventario secret e configurazione GitHub.

I Worker non vengono creati senza codice placeholder: `cf-ready-test` nascerà
con il deploy Testing di M1 e `cf-ready` prima del primo deploy Production.

## Vincoli osservati

- Il repository resta privato sul piano GitHub Free. L’assenza di branch
  protection, required checks, deployment environment protetti, secret scanning
  e push protection è accettata dall’owner e non blocca la `1.0.0`.
  Vulnerability alerts, Dependabot, PR operative, CI verde verificata prima del
  merge, squash per le PR ordinarie, merge commit per le sole promozioni
  `develop` → `main` e controlli locali sui secret costituiscono la baseline
  applicabile. La CI rifiuta le altre PR verso `main`; i branch temporanei
  vengono eliminati esplicitamente, così l’automazione non può cancellare
  `develop` dopo una promozione. Rivalutare il piano solo se entrano
  collaboratori o cambia materialmente il profilo di rischio.
- Secret e callback reali restano da configurare per ambiente durante M1: non
  appartengono al repository.
- Node.js è bloccato a `26.5.0` in `mise.toml`; setup locale e CI usano la
  stessa versione e `npm ci`.

## Prossimo passo

Completare M1 con query Admin GraphQL, Function minimale e controllo
documentazione persistente. Poi verificare login embedded, refresh offline token
e sessione sul dev store, eseguire il preflight e il primo deploy Testing,
misurare la CPU e registrare ricevuta, readback e rollback. Al 28 luglio 2026
`cf-ready-test` non esiste ancora e `cf-ready-db-test` non ha tabelle applicate.
