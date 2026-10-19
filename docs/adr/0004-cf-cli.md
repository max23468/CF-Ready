# ADR 0004 — CLI `cf` e `cloudflare.config.ts`

- **Stato:** accettato
- **Data:** 2026-10-12

CF Ready usa la CLI Cloudflare `cf` come strumento predefinito per persone,
agenti e CI (D-183). `cloudflare.config.ts` sostituisce `wrangler.json` come
unica configurazione Workers: una funzione restituisce la configurazione
completa per la mode `dev` o `prod`, e la mode `production`, predefinita di
`vite build`, viene rifiutata. Così una build senza `--mode` si ferma invece di
portare in Production le variabili Development.

La build passa da `@cloudflare/vite-plugin` 2.0 beta, l'unica versione che legge
`cloudflare.config.ts`. La plugin scrive la Build Output in
`.cloudflare/output/v0`, che registra la mode e che `cf deploy --prebuilt`
distribuisce senza ricostruire. Il preflight Production verifica quella Build
Output e la mode registrata; il preflight Development valuta direttamente
`cloudflare.config.ts`. `cf` e la Vite plugin sono pinnati alla versione
esatta, perché la beta cambia comandi e formato senza preavviso.

I secret runtime sono dichiarati in `cloudflare.config.ts`, 3 in Development e
10 in Production. La Vite plugin 2.0 passa al Worker locale i valori di
`.dev.vars`, `.env` o del processo solo per i secret dichiarati, e `cf deploy`
li eredita dal Worker remoto fermandosi se ne manca uno. Un nuovo secret va
dichiarato qui e impostato sul Worker prima del deploy. Le variabili `text` invece
restano quelle del file: per questo la mode `development` del dev server Vite,
avviato da `shopify app dev`, prende URL del tunnel, chiave e scope dal
processo, mentre le mode `dev` e `prod` di build e deploy non leggono
l'ambiente.

React Router 8 legge il manifest client sempre da `build/client/.vite`, mentre
la Vite plugin 2.0 forza il client nella Build Output. Un plugin Vite locale
sposta il manifest dove React Router lo cerca e lo toglie dagli asset pubblici;
va rimosso quando React Router seguirà `environments.client.build.outDir`.

Wrangler resta una dipendenza pinnata per i comandi che `cf` 1.0.0-beta.18 non
copre o esegue in modo errato: log live, export D1, restore locale da file SQL,
oggetti R2 del bucket backup e deploy Pages. Query e migrazioni D1 locali usano
`cf` dalla beta.18, verificata il 19 ottobre 2026 con dati sintetici. Dove Wrangler
deve risolvere un binding, riceve una configurazione generata che nomina solo
il database interessato, mai una seconda configurazione versionata. L'elenco e
i motivi stanno in [operations.md](../runbooks/operations.md#cli-cloudflare) e
si riducono a ogni aggiornamento di `cf`.

`cf d1 migrations` registra le migrazioni nella stessa tabella `d1_migrations`
di Wrangler; sui database Development e Production non risultano migrazioni
pendenti dopo il passaggio. Il formato dei deployment restituito da
`cf workers deployments list` coincide, per elemento, con quello di
`wrangler deployments status`, quindi ricevute, readback e rollback restano
invariati. Il rollback del Worker crea un deployment al 100% sulla versione
precedente con controlli bypassati, come `wrangler rollback --yes`.

Non vengono introdotti nuovi provider, runtime, scope o migrazioni. Tornare a
Wrangler significa ripristinare il commit precedente: `wrangler.json` e la
Vite plugin 1.x sono nella storia Git e lo stato remoto non cambia formato.
