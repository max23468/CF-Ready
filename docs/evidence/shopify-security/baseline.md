# Baseline dei controlli Shopify

Ultima review completa degli App security checks, da riusare per la
[review incrementale](../../runbooks/shopify-release-security-checks.md#review-incrementale).
Il documento dei finding agente registrato con `shopify app security record` è
[agent-findings.json](agent-findings.json): si aggiorna insieme a questo file a
ogni review.

| Dato | Valore |
| --- | --- |
| Data, operatore e reviewer | 23 ottobre 2026; coding agent Claude Code (Opus 5.5) su incarico dell'owner |
| Ambiente e configurazione | Development, `--config dev` (`shopify.app.dev.toml`) |
| Versione app, SHA e tree analizzati | `2.5.7`, commit `10609485f98bb71cba4fbd51f9424c658d9949fc`, tree `e8d81af0d72f1d7a4339d493697e9d952df6f05c` |
| Candidato da pubblicare | Branch `fix/trial-residual-after-cancel`; i commit successivi aggiungono solo questa prova e il runbook |
| Shopify CLI e ruleset | `@shopify/cli` 4.9.4, engine `shopify-app-security` 4.9.4, ruleset `app-security-rules@4.9.4`; Node 26.12.0, npm 12.2.1 |
| Comandi e scope | `check --list-files`, `check --blocking high --print-instructions`, `record`, `review --blocking high`; scope `{"include_dirs":[],"excludes":[],"no_git_ignore":false}`, 333 file, nessuna esclusione |
| Scansione deterministica | Exit 1: 2 gruppi high, 12 occorrenze, tutte falsi positivi (sotto); 2 check non applicabili |
| Review coding agent | 35 check: 30 `executed`, 5 `not_applicable`, 0 `unresolved`; 0 finding reali |
| Record e review combinata | `record` accettato (35 check, 12 finding soppressi). `review --blocking high` esce 1 perché le soppressioni agente non coprono le occorrenze deterministiche |
| Prove grezze locali | `.shopify/app-security/shopify.app.dev/` nel worktree del candidato, ignorata da Git. SHA-256: `deterministic-findings.json` `54a155e3…4c26a4e`, `agent-checks.json` `7938d91d…9055a35`, `agent-findings.json` `496471d4…6f454804` |
| Esito operativo | Completo per Development. Nessun finding high reale |

## Review incrementali

| Data e candidato | File cambiati dal baseline | Check ripetuti | Esito |
| --- | --- | --- | --- |
| 23 ottobre 2026, merge `845964ae199c121f399708782af04f99aeac5b04`, tree `64c0e735b77c4e6c5ec0f27530c1eee452d8f3cd` | `develop` con [max23468/CF-Ready#767](https://github.com/max23468/CF-Ready/pull/767): spinner in `CheckoutLabelsSection.tsx`, CSS Assistenza, URL Polaris 2 stabile su `cdn.shopify.com`, `@shopify/polaris-types` 2.0.0 (dev) | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP`, `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` | Nessun nuovo sink, header o segreto; `npm audit --omit=dev` 0 vulnerabilità; stesse 12 occorrenze deterministiche. Altri 28 check riusati da `10609485`. Hash: `deterministic-findings.json` `2109b2ce…b73b807`, `agent-checks.json` `dbc1a7d4…c956e3a`, `agent-findings.json` `db681660…a62ffbb` |
| 23 ottobre 2026, merge `5711f12f0e06e53a013a757d5c52cbd9f635038e`, tree `fd99dced5b6dfab0869f4b880dd908becc7de985` | `develop` con [max23468/CF-Ready#769](https://github.com/max23468/CF-Ready/pull/769): FAQ in `app/i18n/*.ts` e `site/*.html`, test della Guida | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` | Solo testo statico in stringhe i18n rese in JSX e in `<details>`, `<summary>`, `<p>` del sito; nessun sink, script o header nuovo; stesse 12 occorrenze deterministiche. Altri 30 check riusati da `10609485`. Hash: `deterministic-findings.json` `7957cb22…d2bdc06`, `agent-checks.json` `3511214e…22991e0`, `agent-findings.json` `7d429889…d09803b` |

## Falsi positivi deterministici

Verificati sul codice; ciascuno è registrato come finding soppresso con la
stessa motivazione.

| Check | Occorrenza | Motivo |
| --- | --- | --- |
| `UNAUTHENTICATED_ENDPOINT` | `app/routes/app.engagement.tsx:13` | Il loader risponde 405; l'action legge solo gli header e verifica il body vuoto, poi attende `authenticateAdmin` (riga 20) e scrive su `session.shop` |
| `UNAUTHENTICATED_ENDPOINT` | `app/routes/app.guide.tsx:41`, `:64`; `app/routes/app.messages.tsx:82`; `app/routes/app.rules.tsx:64`, `:115`; `app/routes/app.tsx:29` | Prima di ogni accesso a D1 o Admin API attendono `authenticateAdmin` o `authenticateAdminTimed` (`app/admin-auth.server.ts:14-30`), che attende `authenticate.admin(request)` per richiesta. L'euristica riconosce solo la chiamata diretta |
| `UNSAFE_INNERHTML` | `app/routes/app.tsx:112` | Lo script è il sorgente letterale del reporter più il JSON di una route a enum chiuso e di un token HMAC del server, serializzato con `<` convertito (`app/performance-report.ts:51-56`) |
| `UNSAFE_INNERHTML` | `tests/browser/components.test.tsx:351`, `:381`, `:396`; `tests/browser/visual-surfaces.test.tsx:38` | Solo test, non distribuiti: script del reporter con fixture letterali e URL Polaris costante |

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
