# Contesto corrente

Aggiornato il 28 luglio 2026.

## Stato

M0 e M2 sono completate. M1 è in corso: scaffold React Router, adattamento
Workers, SessionStorage D1 cifrato, Home minimale e autenticazione webhook sono
presenti e superano il gate locale.

Sono disponibili:

- repository GitHub pubblico `max23468/CF-Ready`;
- app Shopify Development, Testing e Production nell’organizzazione Temisfera;
- progetto Cloudflare Pages `cf-ready`;
- sottodominio Workers `tmsf.workers.dev`;
- database D1 `cf-ready-db-test` e `cf-ready-db-prod`;
- bucket R2 `cf-ready-backups-test` e `cf-ready-backups-prod`, entrambi vuoti
  e vincolati alla jurisdiction `eu`;
- nomi definiti per i Worker secondo il Master Plan;
- baseline documentale, ADR, inventario secret e configurazione GitHub.

I Worker non vengono creati senza codice placeholder: `cf-ready-test` nascerà
con il deploy Testing di M1 e `cf-ready` prima del primo deploy Production.

## Vincoli osservati

- Il repository è pubblico su GitHub Free. `develop` e `main` richiedono i gate
  `verify` e `react-doctor`, inclusa la sincronizzazione con la base; `develop`
  è il branch predefinito. Gli admin non possono aggirare le protezioni e le
  conversazioni devono essere risolte. Secret scanning, push protection,
  CodeQL, Dependabot security updates e private vulnerability reporting sono
  attivi. L’auto-merge nativo è limitato alle PR Dependabot minor/patch; le PR
  ordinarie usano squash e le sole promozioni `develop` → `main` usano merge
  commit. La cancellazione globale dei branch resta disattivata; il workflow
  elimina soltanto i branch `dependabot/*` già uniti.
- I pattern generici non-provider e i validity check estesi di Secret Scanning
  restano disabilitati sul repository personale GitHub Free corrente; non
  vengono descritti come controlli attivi.
- Secret e callback reali restano da configurare per ambiente durante M1: non
  appartengono al repository.
- Il Cloudflare MCP corrente legge correttamente D1 e Pages, ma non espone
  l'header di jurisdiction richiesto dalle API R2. Per i bucket `eu` si usa
  Wrangler con `--jurisdiction eu` finché il connettore non copre il parametro.
- Node.js è bloccato a `26.5.0` in `mise.toml`; setup locale e CI usano la
  stessa versione e `npm ci`.

## Prossimo passo

Completare M1 con query Admin GraphQL e Function minimale. Poi verificare login
embedded, refresh offline token e sessione sul dev store, eseguire il preflight
e il primo deploy Testing, misurare la CPU e registrare ricevuta, readback e
rollback. Al 28 luglio 2026 `cf-ready-test` non esiste ancora e
`cf-ready-db-test` non ha tabelle applicate.
