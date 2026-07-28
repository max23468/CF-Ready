# Contesto corrente

Aggiornato il 28 luglio 2026.

## Stato

M0, M1 e M2 sono completate. Il proof of concept M1 comprende scaffold React
Router su Workers, SessionStorage D1 cifrato, Home embedded minimale, query
Admin GraphQL, autenticazione webhook e Validation Function minimale.

Sono disponibili:

- repository GitHub pubblico `max23468/CF-Ready`;
- app Shopify Development e Production nell’organizzazione Temisfera;
- progetto Cloudflare Pages `cf-ready`;
- sottodominio Workers `tmsf.workers.dev`;
- database D1 Production `cf-ready-db-prod`;
- database D1 Development `cf-ready-db-dev`;
- bucket R2 Production `cf-ready-backups-prod`, vuoto e vincolato alla
  jurisdiction `eu`;
- nomi definiti per i Worker secondo il Master Plan;
- baseline documentale, ADR, inventario secret e configurazione GitHub.

Il Worker `cf-ready` non viene creato senza codice placeholder: nascerà prima
del primo deploy Production. Development usa il runtime locale e il dev store
per sviluppo e collaudo.

## Vincoli osservati

- Il repository è pubblico su GitHub Free. `develop` e `main` richiedono i gate
  `verify`, `react-doctor` e `dependency-review`, inclusa la sincronizzazione
  con la base; `develop` è il branch predefinito. Gli admin non possono aggirare
  le protezioni e le conversazioni devono essere risolte. Secret scanning, push protection,
  CodeQL, Dependabot security updates e private vulnerability reporting sono
  attivi. L’auto-merge nativo è limitato alle PR Dependabot minor/patch; le PR
  ordinarie usano squash e le sole promozioni `develop` → `main` usano merge
  commit. La cancellazione globale dei branch resta disattivata; il workflow
  elimina soltanto i branch `dependabot/*` già uniti.
- I pattern generici non-provider e i validity check estesi di Secret Scanning
  restano disabilitati sul repository personale GitHub Free corrente; non
  vengono descritti come controlli attivi.
- Secret e callback reali restano separati per ambiente e non appartengono al
  repository.
- Il Cloudflare MCP corrente legge correttamente D1 e Pages, ma non espone
  l'header di jurisdiction richiesto dalle API R2. Per i bucket `eu` si usa
  Wrangler con `--jurisdiction eu` finché il connettore non copre il parametro.
- Node.js è bloccato a `26.5.0` in `mise.toml`; setup locale e CI usano la
  stessa versione e `npm ci`.

## Prossimo passo

Implementare M3: query Function completa, validazione formale di Codice Fiscale
e PEC, geografia, i18n e matrice di fixture fail-open. Il refresh di un token
offline realmente scaduto resta una prova live da ripetere prima della 1.0; il
percorso è abilitato e la persistenza cifrata è coperta dal test M1.
