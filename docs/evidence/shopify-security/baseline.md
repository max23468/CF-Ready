# Baseline dei controlli Shopify

Ultima review completa degli App security checks, da riusare per la
[review incrementale](../../runbooks/shopify-release-security-checks.md#review-incrementale).
Il documento dei finding agente registrato con `shopify app security record` è
[agent-findings.json](agent-findings.json): si aggiorna insieme a questo file a
ogni review.

| Dato | Valore |
| --- | --- |
| Data, operatore e reviewer | 30 ottobre 2026; coding agent Codex su richiesta «Pubblica» dell'owner |
| Ambiente e configurazione | Development, `--config dev` (`shopify.app.dev.toml`) |
| Versione app, SHA e tree analizzati | `2.6.1`, commit `41626dd2cd171708e12fe3b88efeb312899ffc1b`, tree `a2aa42722f86f8932602d5435cbe07da9e5b8a72` |
| Candidato da pubblicare | Branch `codex/fix-conversion-financial-replay`; il commit successivo aggiunge soltanto questa prova e il record generato dalla CLI |
| Shopify CLI e ruleset | `@shopify/cli` 4.9.4, engine `shopify-app-security` 4.9.4, ruleset `app-security-rules@4.9.4`; Node 26.12.0, npm 12.2.1 |
| Comandi e scope | `check --list-files`, `check --blocking high --print-instructions`, `record`, `review --blocking high`; scope `{"include_dirs":[],"excludes":[],"no_git_ignore":false}`, 338 file, nessuna esclusione, nessun file saltato |
| Scansione deterministica | Exit 1: 2 gruppi high, 13 occorrenze, tutte falsi positivi rivalutati sul candidato; 2 check non applicabili |
| Review coding agent | 35 check: 30 `executed`, 5 `not_applicable`, 0 `unresolved`; 0 finding reali |
| Record e review combinata | `record` accettato (35 check, 13 finding soppressi). `review --blocking high` esce 1 per i 7 `UNAUTHENTICATED_ENDPOINT` e 6 `UNSAFE_INNERHTML` deterministici: le soppressioni agente non li rimuovono |
| Prove grezze locali | Directory Git comune `cf-ready-publications/security-financial-41626dd/`, fuori dai file distribuiti |
| Esito operativo | Completo per Development. Nessun finding high reale |

Review incrementale dal baseline `b44f5c312e9ac988e4ece7c1394188430f3f8220`,
assorbito su develop da `e8e4720`. CLI e versioni dei 35 check invariati.
Ripetuti: `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET`,
`UNAUTHENTICATED_ENDPOINT`, `MISSING_AUTHORIZATION_CHECK`,
`CSRF_MISSING_PROTECTION`, `REQUEST_CONTROLLED_ADMIN_CONTEXT`,
`REQUEST_DERIVED_SHOP_SCOPE`, `MISSING_TENANT_ISOLATION`,
`UNSCOPED_SHOP_CONFIG_WRITE`, `SESSION_LIFECYCLE_AND_REPLAY`,
`WEAK_SHOP_VALIDATION`, `OPEN_REDIRECT`, `OVERBROAD_DATA_ACCESS`,
`EXPIRING_OFFLINE_TOKEN`, `CREDENTIAL_BROWSER_LEAKAGE`,
`CREDENTIAL_LOG_LEAKAGE`, `SQL_INJECTION`, `METAFIELD_OFFLINE_TOKEN`,
`SCOPE_OVER_REQUEST`. Gli altri 16 esiti sono riusati dal baseline indicato.
La nuova conferma richiede webhook Telegram autenticato, chat privata e owner,
vincola shop e conversione corrente, usa parametri D1 e una ricevuta idempotente.
La Home legge solo la data di verifica dello shop autenticato, senza esporre
la prova owner. La migrazione è additiva; il recupero Partner non cambia host,
credenziali o query GraphQL. Nessuna nuova dipendenza o permesso.

Le sette occorrenze di autenticazione attendono i wrapper in
`app/admin-auth.server.ts:14-30`. L'unico sink HTML distribuito serializza
route a enum e token HMAC del server con escape di `<`
(`app/performance-report.ts:81-86`). Le altre cinque occorrenze sono test con
fixture letterali, non inclusi nel Worker. Le righe aggiornate e le motivazioni
di tutte le 13 occorrenze restano nel record generato dalla CLI.
Il lockfile non cambia rispetto al baseline; nessun segreto nel diff.

SHA-256 delle prove sul candidato: `deterministic-findings.json`
`c988aaf79a2eb28b0d8cb9cc5fb9671fde53e58cabbe8327700d800830a3e6f3`,
`agent-checks.json`
`d11d9a3cb0b99d9fb4b416158601a61cce49bcc380835ee6d9d178d7109f2d90`,
`agent-findings.json`
`a21be3b938c126ad0faa2cf3fd4cdbd325aad54cfc61980c05ec34d3bd12e2da`.

### Ripresa dopo la verifica WebKit

Il candidato `2526ce94da95769ba565da12f7e6ca0d97029b6f`, tree
`0b055110e2d9f52999f994831f02c3285b233cce`, modifica rispetto alla review
precedente soltanto la prova documentale e il test del dialogo:
`visual-surfaces.test.tsx` misura le card dopo la cattura, così WebKit completa
il rendering dopo il cambio di viewport. Le asserzioni contro gli sforamenti
restano presenti; il test mirato passa su entrambe le configurazioni WebKit.
Nessun sorgente distribuito cambia. I 35 esiti sono riusati dalla review
completa di `b44f5c3`; la scansione deterministica completa ripetuta conferma
338 file, nessun salto, versioni dei check invariate e le stesse 13 occorrenze
nelle stesse righe. `record` accettato e review combinata invariata.

Prove finali in `cf-ready-publications/security-manage-plan-2526ce9/` nella
directory Git comune. SHA-256: deterministic
`de30886b727e861cf4e7ec42f75d4769d634da68d7c6a5f5ba22a7e78c086d6e`,
agent-checks
`f8fc36be95bb2f8d62691c8e35c20b59dd637d8e57f84b8d3ecb92f90ab2c3f9`,
agent-findings
`a62da8c0f6e1bdfc69a0a3a1190249f3846af3c1d8e4e9b319a0c4c034c8d552`.
Il commit successivo aggiorna soltanto questa prova e il record generato.

## Antecedente del 24 ottobre 2026

Review completa ripetuta sui 35 check generati dalla CLI, perché il diff tocca
la Function. Verificati i nuovi hook delle bozze, il confronto degli slot e i
moduli di presentazione owner insieme ai confini di autenticazione, SQL,
sessioni, webhook, configurazione Shopify e rendering. Nessun nuovo sink o
selettore di store controllabile dalla richiesta. Le 12 occorrenze sono state
rivalutate sul candidato e registrate con le righe aggiornate.

`npm audit` non rileva vulnerabilità dopo l'aggiornamento di `fast-uri` a
3.1.9 nel solo lockfile, entro il range dichiarato da Ajv. Il pacchetto arriva
dai soli strumenti di sviluppo Stryker e react-doctor; nessun import o percorso
nel Worker distribuito. L'aggiornamento usa l'esclusione temporanea prevista
da `.npmrc` per correggere una vulnerabilità già verificata.

La review incrementale dopo il primo tentativo CI ha ripetuto i check di
rendering e dipendenze: lo stato di modifica delle Regole è derivato dall'ultimo
evento di editing e dal risultato corrente; nei Messaggi la sola eccezione
React Doctor documentata riguarda il rimontaggio dei campi uncontrolled dopo
la normalizzazione asincrona del server. Nessun confine di sicurezza cambia.

## Review incrementali

| Data e candidato | File cambiati dal baseline | Check ripetuti | Esito |
| --- | --- | --- | --- |
| 23 ottobre 2026, merge `845964ae199c121f399708782af04f99aeac5b04`, tree `64c0e735b77c4e6c5ec0f27530c1eee452d8f3cd` | `develop` con [max23468/CF-Ready#767](https://github.com/max23468/CF-Ready/pull/767): spinner in `CheckoutLabelsSection.tsx`, CSS Assistenza, URL Polaris 2 stabile su `cdn.shopify.com`, `@shopify/polaris-types` 2.0.0 (dev) | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP`, `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` | Nessun nuovo sink, header o segreto; `npm audit --omit=dev` 0 vulnerabilità; stesse 12 occorrenze deterministiche. Altri 28 check riusati da `10609485`. Hash: `deterministic-findings.json` `2109b2ce…b73b807`, `agent-checks.json` `dbc1a7d4…c956e3a`, `agent-findings.json` `db681660…a62ffbb` |
| 23 ottobre 2026, merge `5711f12f0e06e53a013a757d5c52cbd9f635038e`, tree `fd99dced5b6dfab0869f4b880dd908becc7de985` | `develop` con [max23468/CF-Ready#769](https://github.com/max23468/CF-Ready/pull/769): FAQ in `app/i18n/*.ts` e `site/*.html`, test della Guida | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` | Solo testo statico in stringhe i18n rese in JSX e in `<details>`, `<summary>`, `<p>` del sito; nessun sink, script o header nuovo; stesse 12 occorrenze deterministiche. Altri 30 check riusati da `10609485`. Hash: `deterministic-findings.json` `7957cb22…d2bdc06`, `agent-checks.json` `3511214e…22991e0`, `agent-findings.json` `7d429889…d09803b` |
| 25 ottobre 2026, commit `de7375da54e26b73e87fdb05138cc70cbce32845`, tree `2aab2de28c26b887f1d1bdda9045c9379f2121b6`, versione `2.5.10`, review di Claude Code su incarico dell'owner | Testi della scelta del piano e nome «Pagamento unico»: stringhe in `app/i18n/*.ts`, ternario rimosso in `PlanChoice.tsx`, commenti in `plans.server.ts` e `HomePage.css`, testo di `site/*.html`, `site/en/*.html` e `site/llms-full.txt`; nel lockfile cambia solo la versione | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` | Solo testo statico reso in JSX o in tag HTML esistenti; nessuno script, attributo evento, URL, header o dipendenza nuova; 338 file, stesse 12 occorrenze deterministiche soppresse, versioni dei 35 check invariate. Altri 30 check riusati da `a452d0b8`. Hash: `deterministic-findings.json` `b8946401…7bbb1`, `agent-checks.json` `e4c9976b…10c8`, `agent-findings.json` `9b57f7d5…79da` |
| 25 ottobre 2026, commit `2ba9b25c3a94d85541092b52757b333882dee839`, tree `bc580f2e7faad88eec2d9f0b07541113e127dfa1`, versione `2.5.11`, review di Claude Code su incarico dell'owner | Testo del pagamento unico: nuova stringa in `app/i18n/*.ts` e scelta della stringa in `PlanChoice.tsx`; test e versione | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` | Solo testo statico reso in JSX; nessuno script, URL, header o dipendenza nuova; 338 file, stesse 12 occorrenze deterministiche soppresse, versioni dei 35 check invariate. Altri 30 check riusati da `a452d0b8`. Hash: `deterministic-findings.json` `879d99f6…a4b0`, `agent-checks.json` `3d5f13b5…fa09`, `agent-findings.json` `6fce2a13…5570` |
| 25 ottobre 2026, commit `0cd39f82119b42f0ff4fcb2f0d7287e836664b1b`, tree `b154f29f6a67ff069aeaaef0db5f554d12e3fa0c`, versione `2.5.12`, review di Claude Code su incarico dell'owner | `@shopify/shopify-app-react-router` 4.0.0, `react-router`, `@react-router/dev` e `@react-router/node` 8.5.0 in `package.json` e nel lockfile; changelog, Master Plan e test della toolchain | `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` | `npm audit --omit=dev` 0 vulnerabilità; la 4.0.0 cambia solo l'URL Polaris predefinito, già impostato in modo esplicito; nessun file nuovo o segreto nel diff; 338 file, stesse 12 occorrenze deterministiche soppresse, versioni dei 35 check invariate. Altri 33 check riusati da `a452d0b8`. Hash: `deterministic-findings.json` `d7bd2dbf…19e2835`, `agent-checks.json` `b1f9ec72…6b3ab`, `agent-findings.json` `9d90ae04…aae672` |
| 25 ottobre 2026, commit `bfd54ecf943c6e2d40e19b5926ce811134ba34fb`, tree `8aea752459fe92aab7a889f2d60e02819e60d3ac`, versione `2.5.12`, Production con `--config shopify.app.toml`, review di Claude Code su incarico dell'owner | Candidato della promozione [max23468/CF-Ready#787](https://github.com/max23468/CF-Ready/pull/787), stesso tree della riga Development precedente più questa prova; `shopify.app.toml` invariato rispetto a `main`, diverso dalla configurazione dev solo per identità e URL | `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` | `npm audit --omit=dev` 0 vulnerabilità; nessun file nuovo o segreto nel diff da `main`; 338 file, nessuna esclusione, stesse 12 occorrenze deterministiche soppresse, identiche alla scansione dev dello stesso tree; versioni dei 35 check invariate. Altri 33 check riusati da `a452d0b8`. `record` accettato, `review --blocking high` esce 1 per le sole occorrenze deterministiche. Prove grezze in `cf-ready-publications/security-prod-bfd54ec/`. Hash: `deterministic-findings.json` `20b05814…786f6`, `agent-checks.json` `6b53c0e4…48000`, `agent-findings.json` `d662bd1f…7b33a` |
| 28 ottobre 2026, commit `fb01f91ca9532c94edfdae717ac40b42cbd242e0`, tree `5c932a7014f509429929a271eac31622822be018`, versione `2.5.15`, review di Claude Code su richiesta di pubblicazione dell'owner | Da `45abd821`: Home stabile alla conferma Shopify (D-199) nei componenti della Home (`EligibleHome.tsx`, `HomeSections.tsx`, `MerchantCheckIn.tsx`, `PlanChoice.tsx`, `SetupGuide.tsx`, `home.server.ts`), `app/ui/ui-page.tsx`, `app/app.css`, testi `app/i18n/*.ts`; area CLS nel reporter `app/performance-report.ts`, in `/performance` (`app/performance.server.ts`) e nel report owner `app/reporting/performance.ts`; colonne `shops.partner_development` e `performance_samples.layout_shift_source` (migrazioni 0030 e 0031) con nuove letture e scritture in `app/validation/*.server.ts`; testi statici del sito della 2.5.14; nel lockfile cambia solo la versione | I 14 check della riga route e `app/performance*`, i 5 di rendering, `SQL_INJECTION`, `METAFIELD_OFFLINE_TOKEN`, `SCOPE_OVER_REQUEST`, `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` | `/performance` resta legato allo store dalla firma HMAC; l'area CLS è accettata solo dall'allowlist `PERFORMANCE_LAYOUT_REGIONS` e passa come parametro bound, solo sul campione CLS. Il reporter legge valori costanti di `data-layout-region` e non esegue contenuti; il JSON inline è invariato. Nuove query D1 con `prepare().bind()` su `shop_domain` di sessione; la query del report interpola solo costanti e non espone store. `partner_development` arriva dalla query Shopify autenticata; il piano salvato mostrato quando il billing non è letto non cambia diritti né metafield. Nessuno scope nuovo; `npm audit --omit=dev` 0 vulnerabilità; nessun segreto. 338 file, 13 occorrenze deterministiche: la nuova `tests/browser/components.test.tsx:385` è il reporter eseguito in un test con fixture letterali, soppressa come le altre. Versioni dei 35 check invariate; altri 11 riusati da `45abd821`. `record` accettato, `review --blocking high` esce 1 per le sole occorrenze deterministiche. Prove in `cf-ready-publications/security-home-cls-fb01f91/`. Dopo il primo tentativo CI il candidato aggiunge solo test di copertura (`tests/browser/home-route.test.tsx`, `tests/owner-control/owner-control.test.ts`): la scansione deterministica ripetuta dà le stesse 13 occorrenze, nessun check da ripetere. Hash: `deterministic-findings.json` `46b8e611…bfdc48`, `agent-checks.json` `a94ec9f1…bd91`, `agent-findings.json` `29549cda…2c3f` |
| 29 ottobre 2026, commit `a2663d3e0cc336e93ffd47f21b28cd4b4153defe`, tree `002d009c56ddc08a51358d26bff79e45ef513de9`, versione `2.5.16`, review di Claude Code su richiesta di pubblicazione e promozione dell'owner | Da `fb01f91c`: testo statico di `site/privacy.html`, `site/terms.html` e delle versioni `site/en/`, proprietà `sameAs` rimossa dal JSON-LD statico di `site/index.html` e `site/en/index.html`; changelog, Master Plan, inventario, test della documentazione; nel lockfile cambia solo la versione | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` | Solo testo in tag HTML esistenti e una proprietà in meno nel JSON-LD letterale; nessuno script, attributo evento, URL nuovo, header o dipendenza; `_headers` e CSP invariati. 338 file, nessuna esclusione, stesse 13 occorrenze deterministiche soppresse, versioni dei 35 check invariate. Altri 30 check riusati da `fb01f91c`. `record` accettato, `review --blocking high` esce 1 per le sole occorrenze deterministiche. Prove in `cf-ready-publications/security-legal-a2663d3/`. Hash: `deterministic-findings.json` `174e259a…24ce72`, `agent-checks.json` `00f65783…87be00`, `agent-findings.json` `597a688f…32fe2b` |

## Falsi positivi deterministici

### Candidato Temisfera del 27 ottobre 2026

- Development, `--config dev`, versione `2.5.13`, commit
  `45abd821063823852430bc8d65e7674d9f089301`, tree
  `cc77b822fd904f8f4650c12a27b4b03c8eef4064`; review di Codex su richiesta
  di pubblicazione dell'owner. Il commit seguente aggiunge soltanto questa prova.
- Scansione completa con CLI, engine e ruleset `4.9.4`: 338 file, nessuna
  esclusione e nessun file saltato. Versioni dei 35 check invariate.
- Rivalutati i confini dei 35 check: autenticazione per richiesta, isolamento
  shop, webhook firmati, Telegram owner, sessioni cifrate e revoca, query
  parametrizzate, URL esterni fissi, scope minimi, CSP e rendering. Il runtime
  è invariato dal candidato `bfd54ecf`; il diff successivo riguarda tooling,
  workflow, documenti e testi statici del sito. Nessun segreto introdotto dal
  diff; `npm audit --omit=dev` riporta zero vulnerabilità.
- Le sette occorrenze di autenticazione attendono i wrapper verificati in
  `app/admin-auth.server.ts`; l'unico sink HTML distribuito serializza route
  a enum e token del server con escape di `<` in `app/performance-report.ts`.
  Le altre quattro occorrenze HTML sono fixture dei test non distribuite.
  Le dodici soppressioni del documento agente restano valide sul candidato.
- `record` accettato: 35 check, 30 `executed`, 5 `not_applicable`, nessun
  `unresolved` né finding reale. La review combinata mantiene exit 1 per
  7 occorrenze deterministiche `UNAUTHENTICATED_ENDPOINT` e 5 `UNSAFE_INNERHTML`,
  tutte motivate nella tabella seguente; le soppressioni agente non ne
  modificano l'exit code.
- Prove grezze nella directory Git comune
  `cf-ready-publications/security-temisfera-45abd82/`, fuori da Git.
  SHA-256: deterministic `3d0a4858…e887672`, agent-checks `eeae2985…db84a66`,
  agent-findings registrato `b10b6661…5f6ff87`.

Verificati sul codice; ciascuno è registrato come finding soppresso con la
stessa motivazione.

| Check | Occorrenza | Motivo |
| --- | --- | --- |
| `UNAUTHENTICATED_ENDPOINT` | `app/routes/app.engagement.tsx:13` | Il loader risponde 405; l'action legge solo gli header e verifica il body vuoto, poi attende `authenticateAdmin` (riga 20) e scrive su `session.shop` |
| `UNAUTHENTICATED_ENDPOINT` | `app/routes/app.guide.tsx:41`, `:64`; `app/routes/app.messages.tsx:68`; `app/routes/app.rules.tsx:48`, `:99`; `app/routes/app.tsx:29` | Prima di ogni accesso a D1 o Admin API attendono `authenticateAdmin` o `authenticateAdminTimed` (`app/admin-auth.server.ts:14-30`), che attende `authenticate.admin(request)` per richiesta. L'euristica riconosce solo la chiamata diretta |
| `UNSAFE_INNERHTML` | `app/routes/app.tsx:112` | Lo script è il sorgente letterale del reporter più il JSON di una route a enum chiuso e di un token HMAC del server, serializzato con `<` convertito (`app/performance-report.ts:81-86`) |
| `UNSAFE_INNERHTML` | `tests/browser/components.test.tsx:351`, `:385`, `:405`, `:420`; `tests/browser/visual-surfaces.test.tsx:38` | Solo test, non distribuiti: script del reporter con fixture letterali e URL Polaris costante |

## Esito per check

| Check | Stato | Superficie verificata |
| --- | --- | --- |
| `ACTIVE_UPLOADS_AND_PRIVILEGED_PREVIEWS` | executed | Nessun upload o import file; i form leggono solo campi testuali |
| `APP_PROXY_LIQUID_INJECTION` | not_applicable | Nessun `[app_proxy]` né risposta Liquid |
| `APP_PROXY_UNVERIFIED_SIGNATURE` | not_applicable | Nessun app proxy né parametri proxy letti |
| `COMMITTED_SECRET` | executed | Nessun formato di segreto reale nei file tracciati; `.env`, `.dev.vars`, `.cloudflare/` ignorati |
| `CREDENTIAL_BROWSER_LEAKAGE` | executed | I loader espongono solo API key pubblica, shop, locale e token di performance HMAC |
| `CREDENTIAL_LOG_LEAKAGE` | executed | `logEvent` (`app/events.server.ts`) accetta un elenco chiuso di metadati; i catch scrivono solo codici |
| `CROSS_SITE_SCRIPTING` | executed | Unico sink in `app/routes/app.tsx:112`; `postMessage` verifica origine e percorso `/app` |
| `CSRF_MISSING_PROTECTION` | executed | Action con `authenticate.admin`; `/performance`, webhook e Telegram con HMAC o secret propri |
| `DEPENDENCY_REACHABILITY` | executed | `npm audit --omit=dev`: 0 vulnerabilità |
| `DEPRECATED_SCRIPT_TAG_SCOPE` | executed | Scope `write_validations` più opzionali `write_translations`, `read_locales`, `read_markets` |
| `EOL_API_VERSION` | executed | Webhook e Admin API `2026-10` |
| `EXPIRING_OFFLINE_TOKEN` | executed | `expiringOfflineAccessTokens` attivo; refresh token e scadenze persistiti in D1 |
| `INSECURE_WEBHOOK_URL` | executed | URL HTTPS sul Worker, senza credenziali né wildcard |
| `LIQUID_UNSAFE_RENDER` | not_applicable | Nessuna theme app extension né file `.liquid` |
| `METAFIELD_OFFLINE_TOKEN` | executed | Metafield scritti da action autenticate o da job con shop verificato; entitlement calcolato dal server |
| `MISSING_AUTHORIZATION_CHECK` | executed | Nessun ruolo applicativo; Telegram owner con secret, chat e user ID |
| `MISSING_COMPLIANCE_WEBHOOKS` | executed | `customers/data_request`, `customers/redact`, `shop/redact` dichiarati |
| `MISSING_EMBEDDED_CSP` | executed | `addDocumentResponseHeaders` in `app/entry.server.tsx` |
| `MISSING_TENANT_ISOLATION` | executed | Query D1 sullo shop di sessione, webhook HMAC o token HMAC |
| `OPEN_REDIRECT` | executed | Redirect relativi; navigazione client limitata a `/app`; `confirmationUrl` da Shopify |
| `OVERBROAD_DATA_ACCESS` | executed | Loader con colonne esplicite, nessun token o PII al browser |
| `REQUEST_CONTROLLED_ADMIN_CONTEXT` | executed | Quattro `unauthenticated.admin` con shop da webhook verificato, cron D1 o owner autenticato |
| `REQUEST_DERIVED_SHOP_SCOPE` | executed | Nessuna route legge lo shop da form, parametri o header |
| `SCOPE_OVER_REQUEST` | executed | Ogni scope ha un uso; gli opzionali sono verificati prima dell'uso |
| `SCRIPT_TAG_URL_INJECTION` | not_applicable | Nessun uso di ScriptTag né scope relativo |
| `SESSION_LIFECYCLE_AND_REPLAY` | executed | Sessioni cancellate alla disinstallazione; webhook e update Telegram idempotenti |
| `SQL_INJECTION` | executed | Solo `prepare().bind()`; frammenti interpolati costanti o da mappe chiuse |
| `SSRF_REQUEST_FORGERY` | executed | `fetch` solo verso `partners.shopify.com` e `api.telegram.org` |
| `STATIC_FRAME_ANCESTORS` | executed | Nessun CSP statico nell'app; `frame-ancestors 'none'` solo nel sito Pages |
| `TEXT_SETTING_HTML_SMUGGLING` | executed | I messaggi merchant arrivano come testo semplice alla Function e come JSX nell'admin |
| `THEME_EXTENSION_XSS` | not_applicable | Solo Validation Function e `admin_link` |
| `UNAUTHENTICATED_ENDPOINT` | executed | Wrapper `authenticateAdmin` con cache per richiesta; webhook, Telegram e `/performance` con controlli propri |
| `UNSAFE_INNERHTML` | executed | Unico sink di produzione in `app/routes/app.tsx:112`, con contenuto fidato |
| `UNSCOPED_SHOP_CONFIG_WRITE` | executed | Scritture su `session.shop` o su shop di webhook verificato |
| `WEAK_SHOP_VALIDATION` | executed | Regex ancorate e confronto esatto in `ALLOWED_SHOP` |

La scansione riguarda i sorgenti, non il comportamento live, e non equivale a
una review dell'App Store.
