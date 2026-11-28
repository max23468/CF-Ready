# Baseline dei controlli Shopify

Ultima review completa degli App security checks, da riusare per la
[review incrementale](../../runbooks/shopify-release-security-checks.md#review-incrementale).
Il documento dei finding agente registrato con `shopify app security record` è
[agent-findings.json](agent-findings.json): si aggiorna insieme a questo file a
ogni review.

## Correzione Development 2.12.0 per i mercati incerti

Il 28 novembre 2026 Codex ha verificato il commit
`63e94279f74e0f16ceb5de357a0ea653181659cf` (tree
`3d0c25926fe004d9dcce211480a725e291097c33`) con Shopify CLI e ruleset
5.1.0, configurazione `dev`. Rispetto al merge Development
`e5db05ce6118dbcda5e07ee1ca8a54724c65d305`, il diff classifica il testo
predefinito già letto e aggiunge una descrizione localizzata in JSX.
Riesaminati il rendering e i confini di accesso: lo shop viene dalla
sessione, il testo resta una stringa e non prende il posto di una
conferma del mercato. Nessun altro confine, manifest o dipendenza varia.

Scansione di 397 file, nessuna esclusione, salto o lacuna, stesse 10
occorrenze per file e riga. Versioni dei 36 check invariate. Gli esiti
fuori dal diff provengono dalla review 2.12.0 sotto. Record accettato
e review riuscita con `scopeDiffers: false`. Prove grezze in
`cf-ready-publications/security-2120-mercati-63e9427/`.

| Prova | SHA-256 |
| --- | --- |
| Record agente | `608ed232b60f21583678f4f1e9f9b62547eeea3d210b18dbef070aaa2354c00e` |
| Scansione deterministica | `83a2917054bb29bd90d4fc42e979b7c191e847b94f47e1467628f35db023ab79` |

## Review incrementale 2.12.0

Il 28 novembre 2026 Codex ha verificato per Development il commit
`1a67dbc57bac778b95fd0da8fd5e27efc14071f1` (tree
`3dc83702b0be6fcbb41cdff6f3bb6e0101aa7062`) su richiesta dell’owner.
Shopify CLI e ruleset 5.1.0, Node 26.13.1 e npm 12.2.3, configurazione
`dev`. Il commit successivo aggiunge soltanto prova e record.

Ripetuti i 23 check applicabili al diff di route, rendering, permessi,
token e manifest indicati nel runbook. La Home ottiene il client Admin e
lo shop dalla richiesta autenticata e legge le etichette dopo aver
verificato gli scope facoltativi esistenti. L’onboarding usa lo stesso
confine. La lettura della Home non scrive su Shopify. I testi osservati
arrivano al browser come stringhe del negozio autenticato e sono resi in
JSX. L’ancora FAQ e i collegamenti sono costanti. I loader non espongono
token e i nuovi errori non registrano testi o credenziali. Il lockfile
cambia solo per la versione dell’app. I 13 esiti fuori dal diff si
riusano dal record 2.11.6 in `18648a349137411ad7bff7130fe57064a9768d98`;
le versioni dei 36 check coincidono.

`check --print-instructions`: 397 file, nessuna esclusione, file
saltato o lacuna. Le 10 occorrenze deterministiche coincidono per
check, file e riga con il record precedente; rivalutati i wrapper che
attendono `authenticate.admin`, lo script inline con nonce e testo
serializzato, e i due sink di fixture esclusi dalla distribuzione.
`record` accettato con 30 check eseguiti e 6 non applicabili;
`review` riuscita, `scopeDiffers: false`, nessun nuovo finding confermato.

Prove grezze locali in `cf-ready-publications/security-2120-1a67dbc/`.

| Prova | SHA-256 |
| --- | --- |
| Record agente | `ccfae5d2a4a17ac92a146bada35645d6bb520c2728b1df4a5005e83f2b628691` |
| Scansione deterministica | `f1f6507caf5b1fcd7e12dc1b4525afd2e5d9b136beb0e2f80aac95bd3142f38a` |
| Check agente | `1a8be357b270733cd6afe3b340270c716b626f68a91e3bba1c3c0fbc5644171c` |
| Review combinata | `496974c29d71efb8a2d6e15521ddf95e3a8b5ee4d9eede78aecfea2ad63c162d` |

Il retry `2d1fbc683523d999fedf0ef7532127a29d04e4f6` aggiunge test
per la copertura delle etichette, a runtime invariato. Scansione ripetuta,
stesse 10 occorrenze e nessuna lacuna. Record e review riusciti con scope
identico. Prove grezze in `security-2120-1a67dbc/retry/`.

## Review 2.11.6

Il 27 novembre 2026 Codex ha riesaminato il commit
`f7ef15b9c4996aa71a0c47e5c018e545e2876015` (tree
`a15410c65a7a6eb61a563ed7fc9b517f1904a356`) prima di pubblicare e
promuovere su richiesta dell'owner. La verifica usa Shopify CLI e regole
`5.1.0`, Node 26.13.1 e npm 12.2.3, con `--config dev` e
`--config shopify.app.toml`.

Riesaminati tutti i 36 controlli perché cambia la versione minor della CLI e
cambiano dipendenze e schema della Function. L'SDK installato verifica il token
di sessione e ne ricava lo shop. Le versioni segnalate dall'audit transitivo
riguardano strumenti di build, generazione dello schema e test. La Function
mantiene il contratto 2026-10. La verifica non ha confermato nuovi finding.

`check --print-instructions`, `record` e `review` completati nelle due
configurazioni. Scansionati 395 file senza esclusioni, file saltati o lacune.
`record` accetta 30 controlli eseguiti, 6 non applicabili e le 10 occorrenze
note rivalutate. `review` restituisce `scopeDiffers: false`. Il candidato di
pubblicazione aggiunge a questo tree soltanto il record e la presente prova.
Prove grezze locali in `cf-ready-publications/security-2116-f7ef15b/`.

| Configurazione | SHA-256 record agente | SHA-256 scansione deterministica |
| --- | --- | --- |
| Development | `0ba80180184d23c13a0361e1bbaa0e08c74afe7154abcabb7946d9a2856fe273` | `5f0008525de32d3ceb2e929e97750484faa4047da586a13a8a3894c853768653` |
| Production | `13c7c8a4dc90cdc631d02d5baae29b151b079dfb59166514a6e451fef822752f` | `fe9793c80b92d031b3170d8232294f9fa07220eca59ff7b1bf657dec901ff3e0` |

## Review 2.11.5

Il 21 novembre 2026 Claude Code ha verificato, su richiesta «Promuovi»
dell'owner e prima della promozione, il commit `develop`
`f6bedee7a5905db66f7d265cda13d3777d2aa713` con tree
`c9b7da0b50ca58640b69819d2320660e372f5f45`, pubblicato in Development con
[max23468/CF-Ready#925](https://github.com/max23468/CF-Ready/pull/925). La
promozione è [max23468/CF-Ready#926](https://github.com/max23468/CF-Ready/pull/926),
commit `main` `bbca4c7773ebeade753a6192eb96c30a91ef62d5` con lo stesso tree.
CLI locale 5.0.1, ruleset `app-security-rules@5.0.1`, Node 26.13.1, npm 12.2.2,
`--config dev` e `--config shopify.app.toml`; entrambi i manifest Shopify sono
invariati rispetto alla 2.11.4.

Ripetuti tutti i 36 check agente, perché il diff dalla 2.11.4 (`8eeaf13`)
tocca anche workflow, hook e script che la tabella del runbook non copre. Le
modifiche runtime sono refactoring del lint senza effetto sulla sicurezza; nelle
`extensions/` cambiano solo test e configurazione di test. Le versioni dei check
coincidono con il record precedente e fra le due configurazioni. Le 10
occorrenze deterministiche sono le stesse della 2.11.4, rivalutate come falsi
positivi alle righe correnti.

`record` accettato per entrambe le configurazioni: 36 check, 30 eseguiti e 6
non applicabili, 10 soppressioni. `review` exit 0, `scopeDiffers: false`, 395
file scansionati senza esclusioni, file saltati o lacune. Prove grezze locali in
`cf-ready-publications/security-2115-f6bedee/`.

| Configurazione | SHA-256 record agente | SHA-256 scansione deterministica |
| --- | --- | --- |
| Development | `ad123f6415376b2439ca8d0c2815f2750b5be2f59c5f2dee4fad69901ffd7aa3` | `5604c3be40534719bc45091cb53536e7479b426cc07b742b1f6249377a9ebb17` |
| Production | `34e44ce9821e522b6cfbc939871450b8f4427027ff8e2bf1d829885e931402e1` | `5b795795dfe51aba682d33fb891d7285d86533174c3008644cf6524781014f0e` |

## Review incrementale 2.11.4

Il 20 novembre 2026 Codex ha verificato, su richiesta «Pubblica e promuovi»,
il commit `8eeaf13c016c2abb428295b796eb3d4677250c0b` con tree
`555fc2f05fd8187bc7d223f6a403b4bdd27d417b`. Il commit successivo aggiunge
la prova e il record agente. I controlli sono stati eseguiti con la CLI locale
5.0.1, Node 26.13.1 e npm 12.2.2, sia con `--config dev` sia con
`--config shopify.app.toml`. Entrambi i manifest Shopify sono invariati
rispetto alla 2.11.3 in Production.

Ripetuti i 20 check indicati dal runbook per le modifiche a billing, query e
migrazioni D1, Control Center, poll Partner e lockfile. Le query usano parametri
vincolati e abbinano il negozio all'addebito e al periodo. Il percorso Telegram
verifica il segreto del webhook, la chat privata, l'identità dell'owner e il
claim prima del refresh. Il cron legge il contesto Admin da installazioni con
sessione offline e il client Partner usa un host fisso e credenziali server.
Il lockfile cambia soltanto la versione dell'app. I 16 check fuori dal diff e
le relative soppressioni riusano il record della 2.11.3, commit
`5f7249af7161c4752e8a50bf2e4707232867b31b`. Le versioni dei 36 check agente
coincidono in entrambi gli ambienti e con il record precedente.

`check --print-instructions`, `record` e `review` completati per entrambe le
configurazioni. Scansionati 390 file senza esclusioni, file saltati o lacune.
`record` ha accettato tutti i 36 check agente, 30 eseguiti e 6 non applicabili,
con 10 soppressioni. `review` ha restituito `scopeDiffers: false` e le stesse
10 occorrenze deterministiche già registrate nella baseline Production della
2.11.3. La validazione deterministica bloccante resta nel job CI `verify`.

Prove grezze locali in `cf-ready-publications/security-2114-8eeaf13/`.

| Configurazione | SHA-256 record agente | SHA-256 scansione deterministica |
| --- | --- | --- |
| Development | `60462133b22b63ca4787fbb58d6b1477c87906391fa567c7dbde3ed0a8898a66` | `a81e7275e327b0982dbc9445fb0ab35d3175e8f829c6e4d6d122fa1237bccfb7` |
| Production | `11f868a7c59391aa79d53e68ea40acfd048d5360b179f5defdc0436b4ee94e99` | `a50051d42338ce4e19ca4ec2ae2aab66b81487bb03d71ad5517287962ccc3740` |

## Prove precedenti

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

Controlli Production della 2.11.3 del 18 novembre 2026, eseguiti prima della
promozione su richiesta «Pubblica e promuovi» dell'owner, sul commit `develop`
`fb0b276f4e76d0f9290d50822622557d5abc4a79` e tree
`35f6fb25d8ab75f0609474c5d02d6a526d4b025e` pubblicati in Development
([max23468/CF-Ready#914](https://github.com/max23468/CF-Ready/pull/914)).
Rispetto al tree `8cac52bf` della review qui sotto cambiano solo questa prova e
il record agente. La promozione è
[max23468/CF-Ready#915](https://github.com/max23468/CF-Ready/pull/915), commit
`main` `5f7249af7161c4752e8a50bf2e4707232867b31b` con lo stesso tree. Ripetuti
`check`, `record` e `review` con `--config shopify.app.toml`: `shopify.app.toml`
invariato rispetto a `origin/main`, versioni dei 36 check identiche alla
scansione dev, le stesse 10 occorrenze deterministiche. È registrato lo stesso
documento agente della review su `f3011b0`. `record` accettato (36 check, 10
soppressi), `review` exit 0, `scopeDiffers: false`, 389 file scansionati. Prove
grezze in `cf-ready-publications/security-prod-2113/`; SHA-256 del documento
registrato `2b588ceb15f868ee049e3afa980de641360fae23f97c51d212717774e89b7392`,
di `agent-checks.json`
`0b98ebcc13833ba3530a7b4f4fd02d50b622b8d96d72e07ee41aa3573a827f8e` e di
`deterministic-findings.json`
`8337e1980da44ea9bddd2cd60633df19b7cf44c03109cfae6bd4d9135cf71ca6`.

Review del 18 novembre 2026 per la 2.11.3, coding agent Claude Code su richiesta
«Pubblica e promuovi» dell'owner, sul candidato `feat/sito-badge-bfs`, commit
`f3011b0f0b45587a459ebfe3e70c0761bbfbde72`, tree
`8cac52bf2d5ad98110672e749d7a72563e7ffed4`, rispetto ai controlli Production
della 2.11.2 su `aaf6386`; il commit successivo aggiunge soltanto questa prova e
il record generato dalla CLI. Configurazione `shopify.app.dev.toml`, CLI, engine
e ruleset 5.0.1, Node 26.13.1 e npm 12.2.2, versioni dei 36 check identiche al
record precedente. Il diff tocca `site/**` (badge Built for Shopify del media kit
in due SVG statici, `award` nel JSON-LD, CSS), documentazione, changelog, la
versione in `package.json` e `package-lock.json` e un test di
`scripts/check-docs.node-test.mjs`: ripetuti `CROSS_SITE_SCRIPTING`,
`UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS` e
`MISSING_EMBEDDED_CSP`, gli altri 31 riusati dal record del 17 novembre su
`1828740`. Verificati: gli SVG non contengono script, gestori di eventi o
riferimenti esterni e sono serviti come `<img>` sotto `img-src 'self'`; il
JSON-LD resta un letterale statico; `site/_headers`, Worker, route,
`extensions/**` e manifest Shopify sono invariati. Esito: 5 `executed`, 0
finding reali. Scansione su 389 file, le stesse 10 occorrenze deterministiche,
coperte da `known-deterministic-findings.json` senza modifiche. `record`
accettato (36 check, 10 soppressi), `review` exit 0, `scopeDiffers: false`.
Eseguito con `--config dev`: la configurazione Production va ripetuta sullo
stesso tree alla promozione. Prove grezze in
`cf-ready-publications/security-2113-bfs-f3011b0/`; SHA-256 del documento
registrato `b3c7639f5b9b3a07b5e2d939c7f73bd5d89c19e159df39bdbb008411038716bd`,
di `agent-checks.json`
`3a4781b8d500b873e5fc0bdafdfe2fa64208490c607bdba472ba03e6ae555196` e di
`deterministic-findings.json`
`1a715196e696a88a5a501c7fb6711bb3dbc6d49e6a92a7b4c346f34f247e1658`.

Controlli Production della 2.11.2 del 17 novembre 2026, eseguiti prima della
promozione su richiesta «Pubblica e promuovi» dell'owner, sul commit `develop`
`aaf6386ef1dbe36bef4d5a63b953d7d6dbf8ba25` e tree
`556bd83dadeb8495720d9c370fd753833074d13d` pubblicati in Development. Rispetto al
tree `7e59b040` della review qui sotto cambiano solo questa prova, il record
agente, `scripts/check-client-bundle.mjs` e il suo test. La promozione è
[max23468/CF-Ready#912](https://github.com/max23468/CF-Ready/pull/912), commit
`main` `e027d19139db54e249fa7ded2da9bf996d65d651` con lo stesso tree. Ripetuti
`check`, `record` e `review` con `--config shopify.app.toml`: `shopify.app.toml`
invariato rispetto a `origin/main`, versioni dei 36 check identiche alla
scansione dev, le stesse 10 occorrenze deterministiche. È registrato lo stesso
documento agente della review su `1828740`. `record` accettato (36 check, 10
soppressi), `review` exit 0, `scopeDiffers: false`, nessun check bloccante, 389
file scansionati. Prove grezze in `cf-ready-publications/security-prod-2112/`;
SHA-256 del documento registrato
`36515f4dd3c65e2bae022b324c0617c5e372c94d4b429c7ad6005f8c77971e54`, di
`agent-checks.json`
`97876a98eb806759dadc4dcabe94530f4f7214284a1ea2a3a819df23d9f317de` e di
`deterministic-findings.json`
`eaa3fb7573337b07816005769190c0c0433706db9ba1d6035be4752779bcb5a3`.

Review del 17 novembre 2026 per la 2.11.2, coding agent Claude Code su richiesta
«Pubblica e promuovi» dell'owner, sul candidato `chore/aggiorna-dipendenze`,
commit `1828740e7e58dc517c02b3bed37cab2908212a95`, tree
`7e59b040ac1aefe988c508e03c174c50d76850e7`, rispetto alla review su `d2258b4`;
il commit successivo aggiunge soltanto questa prova e il record generato dalla
CLI. Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node
26.13.1 e npm 12.2.2, versioni dei 36 check identiche al record precedente. Il
diff comprende anche la card ordini della 2.11.1, che non aveva una review
registrata, e tocca `vite.config.ts` e `app/csp-nonce.ts`, che la tabella non
copre: tutti i 36 check sono stati ripetuti sulle modifiche. Nel codice
distribuito la card ordini passa nella colonna laterale con testo JSX e due
stringhe più brevi; `useNonce` legge il nonce del documento da una funzione di
modulo, con lo stesso valore; il plugin Vite locale che spostava il manifest
client sparisce, perché React Router 8.5.1 lo legge dalla Build Output e lo
toglie dagli asset pubblici (nessun `.vite` in `.cloudflare/output/v1`); a
runtime cambia solo `react-router` da 8.5.0 a 8.5.1, e `npm audit --omit=dev`
riporta soltanto gli avvisi della Function già coperti da eccezioni D-175.
Verificati in particolare: nessuna route, action, barriera di autenticazione,
query SQL, sink HTML, `fetch` esterno o segreto nuovo. Esito: 30 `executed`, 6
`not_applicable`, 0 `unresolved`, 0 finding reali. Scansione su 389 file, le
stesse 10 occorrenze deterministiche sulle stesse righe, citazioni rilette e
coperte da `known-deterministic-findings.json` senza modifiche. `record`
accettato (36 check, 10 soppressi), `review` exit 0, `scopeDiffers: false`.
Eseguito con `--config dev`: la configurazione Production va ripetuta sullo
stesso tree alla promozione. Prove grezze in
`cf-ready-publications/security-2112-deps-1828740/`; SHA-256 del documento
registrato `6dbae6ef91c32cc0cd0e7fe3069fddbdda55d38bd10aaa32b292fba65a051b17`,
di `agent-checks.json`
`2fb494ff7bffbb1dc7c1b353be31598d53244dcdea31a461211a2867906dba3b` e di
`deterministic-findings.json`
`6b04d75e37235f89b3188c224ce59b0a4e9fb028607b2f45fe12f8546b3ddc96`.
Dopo la prova, due commit della stessa PR portano il percorso degli asset di
`scripts/check-client-bundle.mjs` in una costante di modulo e rendono `main`
testabile con una radice esplicita: cambiano solo uno script di build fuori dal
bundle e il suo test, quindi nessun check da ripetere.

Review del 17 novembre 2026 sul secondo candidato della 2.11.0, coding agent
Claude Code su richiesta «Pubblica» dell'owner, sul candidato
`chore/oxlint-rules`, commit `d2258b4311a418707850100abe4915219287292d`, tree
`aacc7ea432dcc4b9e07b49a17d13e2e9a69f4543`, rispetto alla review su `6e8830d`;
il commit successivo aggiunge soltanto questa prova e il record generato dalla
CLI. Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node
26.13.1 e npm 12.2.2, versioni dei 36 check identiche al record precedente. Il
diff tocca anche `extensions/**` e `cloudflare.config.ts`, quindi tutti i 36
check sono stati ripetuti sulle modifiche. Nel codice distribuito il diff
riordina gli import (Function compresa), segna con `void` invii dei fetcher e
navigazioni client, legge i campi dei form solo come stringhe, passa da `sort()`
a `toSorted()`, aggiunge `cause` all'errore della query ordini e rende asincrone
due callback di `Promise.all` nelle notifiche owner. Verificati in particolare:
nessuna route, action, barriera di autenticazione, query SQL, sink HTML, `fetch`
esterno o segreto nuovo; la `cause` non arriva ai log perché il consumer della
coda registra solo `stableErrorCode` (`app/webhooks/webhook-ingress.server.ts`);
`value()` del pannello owner produce solo testo per Telegram; `oxlint-tsgolint`
è una devDependency fuori dal bundle. Esito: 30 `executed`, 6
`not_applicable`, 0 `unresolved`, 0 finding reali. Scansione su 389 file, 10
occorrenze deterministiche invece di 16: le sette chiamate `new Function` di
`tests/browser/components.test.tsx` diventano un solo helper, e
`known-deterministic-findings.json` scende da 7 a 1 per quel file. Questa review
ricostruisce anche il record versionato: quello della review su `6e8830d` era
stato salvato in [agent-findings.json](agent-findings.json) senza check.
`record` accettato (36 check, 10 soppressi), `review` exit 0,
`scopeDiffers: false`. Eseguito con `--config dev`. Prove grezze in
`cf-ready-publications/security-2110-lint-d2258b4/`; SHA-256 del documento
registrato `f24d0ead7cd35e8b9a799f17b58c8bb86519aadd8e1f706ce6aae87c58995aa3`,
di `agent-checks.json`
`c673fb1deabda0e177416747fc15b4c869f46556bbe8951d4fbaa94a7b1162d0` e di
`deterministic-findings.json`
`66a74fc8fbcdc7216f71cbc051cc240598e26e7ef79a39177ec4272006e71459`.

Review del 17 novembre 2026 per la 2.11.0, coding agent Claude Code su richiesta
«Pubblica» dell'owner, sul candidato `fix/bfs-review`, commit
`6e8830d6f3b17be3f788a1af1c67573fe2d6ceb4`, tree
`1c5f5bcae1ff4a88acc95219418e4a61daaa275f`, rispetto alla review su `704c0ce`; il
commit successivo aggiunge soltanto questa prova e il record generato dalla CLI.
Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node 26.13.1
e npm 12.2.2, versioni dei 36 check identiche al record precedente. Il diff
tocca `app/routes/**`, `app/owner-control/**`, componenti `.tsx`, `app/i18n/**`,
`site/**` e il lockfile, ma anche `app/order-usage.server.ts` e il loader della
Home (`home.server.ts`), che la tabella non copre: tutti i 36 check
sono stati ripetuti sulle modifiche. Verificati in particolare: il nuovo
conteggio della Home (D-231) usa l'`admin` restituito da `authenticate.admin`
per la sessione corrente, senza selettori di store dalla richiesta, e legge con
`read_orders` le sole chiavi dei localized fields; il loader restituisce due
conteggi e un booleano, mai valori o identificativi di ordini; `read_orders` è
già scope facoltativo dei manifest e si chiede soltanto con
`shopify.scopes.request` al clic del merchant, mentre senza permesso Shopify
nega la lettura e la card lo gestisce; `/usage` usa la stessa funzione con il
comportamento precedente; nessuna nuova route, action, sink `innerHTML`, `fetch`
esterno o segreto; il lockfile cambia solo la versione dell'app. Esito: 30
`executed`, 6 `not_applicable`, 0 `unresolved`, 0 finding reali. Scansione su
389 file, le stesse 16 occorrenze deterministiche, coperte da
`known-deterministic-findings.json` senza modifiche; le 7 occorrenze di
`tests/browser/components.test.tsx` scendono di 2 righe e i finding soppressi
del record le seguono. `record` accettato (36 check, 16 soppressi), `review`
exit 0, `scopeDiffers: false`, nessun check bloccante. Eseguito con
`--config dev`: la configurazione Production va ripetuta sullo stesso tree alla
promozione. Prove grezze in `cf-ready-publications/security-2110-bfs/`; SHA-256
del documento registrato
`b12d60d9871cf1be260b27a7fb86c93e5d7a5dc3bbdf63d2f5c12580cfcadd90`, di
`agent-checks.json`
`0d8a30b8a7321302e5071ab1d8912b581f0e3e8e8f49607239d17ca18abef02b` e di
`deterministic-findings.json`
`b9d86e29cebff00cd7944a4815a84c6686d3b42d244b13fcca3fdeba8bfbc1c1`.

Controlli Production della 2.10.3 del 15 novembre 2026, eseguiti prima della
promozione su richiesta «Promuovi» dell'owner, sullo stesso commit
`07609bbc1e39cf8ee49df519fb245996095ee506` e tree
`bd90f310aaa6dc7e5ca3ce4a600b5eab7d010fc3` pubblicati in Development. Il tree
coincide con quello del candidato `7376599` (review incrementale qui sotto) più
la tolleranza di un test E2E del sito. La promozione è
[max23468/CF-Ready#903](https://github.com/max23468/CF-Ready/pull/903), commit
`main` `31db8d8dbcea62d57f99c58eb84d028bb32a2976`. Ripetuti `check`, `record` e
`review` con `--config shopify.app.toml`: `shopify.app.toml` invariato rispetto a
`origin/main`, diverso dalla configurazione dev solo per identità e URL; versioni
dei 36 check identiche alla scansione dev. È registrato lo stesso documento
agente della review incrementale su `704c0ce`. `record` accettato, `review`: 29
passati, 6 non applicabili, 16 occorrenze deterministiche soppresse, 387 file
scansionati, exit 0. Prove grezze in `cf-ready-publications/security-prod-2103/`;
SHA-256 del documento registrato
`c16ee31480f50c209096650c7bdb9109ebe3933d65d2af052c0ddb584497a651`, di
`agent-checks.json`
`25473d3faabf9527282488fd2a91491b00d0c0f98f9cc00947dea1424cc2fdf3` e di
`deterministic-findings.json`
`b48e245b2c09e67ead4e2f68681dee5537cc2e91e55affd07c9b49676cb80f34`.

Review incrementale del 15 novembre 2026 sul candidato aggiornato della 2.10.3,
`fix/modern-web-guidance`, commit `704c0ce9469fe02ae885a3cc3ad9c58f1ee13d37`,
tree `f728b30a41b89fea7291a7cac283a7b050273305`, rispetto alla review su
`f3a227c` (prova in `d569f21`). Cambiano solo `app/routes/app.onboarding.tsx`,
che gestisce il rifiuto di `transition.ready` dopo `document.startViewTransition`
senza nuovi dati, richieste o sink, e il suo test browser. Ripetuti i 19 check
delle righe `app/routes/**` e componenti `.tsx`: loader e action
dell'onboarding sono invariati e la modifica resta nel client. Gli altri 17 esiti
sono riusati da `f3a227c`; versioni dei 36 check e istruzioni della CLI
identiche. `check`, `record` e `review` con `--config dev`: 387 file, le stesse
16 occorrenze deterministiche alle stesse righe, coperte da
`known-deterministic-findings.json` senza modifiche; `record` accettato (36
check, 16 soppressi), `review` exit 0 e `scopeDiffers: false`. Esito: 30
`executed`, 6 `not_applicable`, 0 `unresolved`, 0 finding reali. Prove grezze in
`cf-ready-publications/security-2103-mwg-704c0ce/`; SHA-256 del documento
registrato `795b25a20199e3f8a09692e3ce0766a55571a50b46e15e0d1b98a2df73e937bf`, di
`agent-checks.json`
`93d7904ec2a94a5420af9d53b9e209e404af6f00de88f2e801ba439d2896821c` e di
`deterministic-findings.json`
`c151e27c2f796b8bc959dcb331fe2451478b6896d31591b5385e825f5a2e4c4a`.

Review del 15 novembre 2026 per la 2.10.3, coding agent Claude Code su richiesta
«Pubblica» dell'owner, sul candidato `fix/modern-web-guidance`, commit
`f3a227c2091ed16b1f7528b80e18bd4ad449cc38`, tree
`d153b7823142eb722688d36817733feb5116bbec`, rispetto alla review 2.10.2 su
`0ceabc5`; il commit successivo aggiunge soltanto questa prova, il record
generato e i conteggi aggiornati di `known-deterministic-findings.json`.
Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node 26.13.1
e npm 12.2.2, versioni dei 36 check identiche al record precedente. Il diff
tocca `app/routes/**`, `app/performance*`, componenti `.tsx`, `site/**` con
`_headers`, la migrazione `0036_performance_inp_attribution.sql`, script e il
workflow `deploy-pages-production.yml`, che la tabella non copre: tutti i 36
check sono stati ripetuti sulle modifiche, nessun esito riusato. Verificati in
particolare: CSP Report-Only con nonce casuale per richiesta in
`app/csp-nonce.ts` ed `entry.server.tsx`, che lascia intatta la CSP con
`frame-ancestors` di `addDocumentResponseHeaders`; lo script inline delle
prestazioni resta il letterale `REPORTER_SOURCE` con configurazione serializzata
e `<` escapato, e tratta metriche e voci `PerformanceObserver` solo come dati;
`/performance` continua a ricavare lo store dal token HMAC e scarta i nuovi
campi INP fuori da intervalli e formato, l'`INSERT` lega ogni valore e la query
di `report:performance` interpola solo costanti; `_headers` del sito aggiunge
Trusted Types, `X-Frame-Options` e intestazioni Cross-Origin senza script
inline nuovi (solo JSON-LD statico e il modulo `menu.js`); il workflow verifica
più intestazioni e un asset in più con valori del workflow. Esito: 30
`executed`, 6 `not_applicable`, 0 `unresolved`, 0 finding reali. Scansione su 387
file, 16 occorrenze deterministiche: le 13 note più 3 `UNSAFE_INNERHTML` in
`tests/browser/components.test.tsx` (righe 553, 732 e 776, chiamate
`new Function` sullo script costante con rotta e token letterali), aggiunte con
motivo a `known-deterministic-findings.json` (conteggio da 4 a 7), che senza
questa modifica avrebbe fatto fallire `npm run security:app`. `record` accettato
(36 check, 16 soppressi), `review` exit 0 e `scopeDiffers: false`. Eseguito solo
con `--config dev`: la configurazione Production va ripetuta sullo stesso tree
alla promozione. Prove grezze in `cf-ready-publications/security-2103-mwg/`;
SHA-256 del documento registrato
`51a27d29b9cc80e2cfcf6ff7a5a1a9deedad6117956f490ace0da1f2dcfc0793`, di
`agent-checks.json`
`795367219045f382ba71a6a388063c8b044ab48c140d8218d2d89e65a2b72a87` e di
`deterministic-findings.json`
`c9bb1d703e2f465ef9aa26862df33ae5e039d7d189a0227c816c588a4862f4df`.

Review incrementale del 14 novembre 2026 sul secondo candidato della 2.10.2,
`fix/sito-rilettura`, commit `0ceabc56cf131ff3eaa4f952b8e33b70f9fa693d`, tree
`3f645e34e8f35f9c5d128545994ae0fbd5e4d47f`, rispetto a `733523f`: cambiano solo
testo statico e JSON-LD in `site/**` e il changelog; nessuno script, stile,
iframe, gestore di eventi, sink `innerHTML` o modifica di `_headers`; `app/`,
`workers/`, `extensions/` e configurazione invariati. Ripetuti i 5 check della
riga `site/**`, altri 31 esiti riusati da `b5550fd`. `check`, `record` e `review`
con `--config dev` e `--config shopify.app.toml`: 385 file, stesse 13 occorrenze
deterministiche note, `record` accettato (36 check, 13 soppressi), `review` exit
0 e `scopeDiffers: false`. Prove grezze in
`cf-ready-publications/security-2102-rilettura/`; SHA-256 del documento
registrato `75956a180cf074b8d3beeee3b54addfd483575ff6db09858e4f02b672ab06429`
(dev) e `b245d8c3bd2ada8826714b1d6b5e3d8415694175bd9439db19f0efa834886437`
(Production).

Review incrementale del 14 novembre 2026 per la 2.10.2, coding agent Claude Code
su richiesta «Pubblica… infine promuovi» dell'owner, sul candidato
`fix/guida-validazione-tutti-i-piani`, commit
`e415c807dfe4f4e267bafff1e0b5bd45f296246f`, tree
`4d7f3f8aa169f05f5de446b686c3ccfcb90ab3c8`, rispetto alla review 2.10.1 su
`b5550fd`; il commit successivo aggiunge soltanto questa prova e il record
generato. Cambiano solo `site/**` (testo statico, attributi `alt` e JSON-LD),
documentazione, un test e la versione: `app/`, `workers/`, `extensions/` e la
configurazione dell'app sono invariati da `b5550fd`. Ripetuti i 5 check della
riga `site/**`: nel diff nessuno script, stile, iframe, gestore di eventi, sink
`innerHTML` o modifica di `_headers`. Gli altri 31 esiti sono riusati da
`b5550fd`, con le citazioni dei 13 finding soppressi ancora alle stesse righe;
versioni dei 36 check identiche. `check`, `record` e `review` con `--config dev`
e `--config shopify.app.toml`: 385 file, stesse 13 occorrenze deterministiche di
`known-deterministic-findings.json`, `record` accettato (36 check, 13 soppressi),
`review` exit 0 e `scopeDiffers: false` in entrambe. Prove grezze in
`cf-ready-publications/security-2102/`; SHA-256 del documento registrato
`999b2eac9adf63f4a3f118330c0a504ee83ed159ce31098fd3f56c4bbf758ba0` (dev) e
`d13faf46a75e265e6f556f1a7dc587a46b5be7c0ee760da78fa403a70cd00583` (Production).

Review del 14 novembre 2026 per la 2.10.1, coding agent Claude Code su richiesta
«Pubblica in Production» dell'owner, sul candidato `fix/policy-utilizzo-neutra`,
commit `b5550fdb7df78334b68dd002232a8e10f378a424`, tree
`2bef48e4ead5f439ce4f4dd6bb0190135ace8865`, rispetto alla review 2.9.3 su
`68b3ae8`; il commit successivo aggiunge soltanto questa prova e il record
generato. Il diff comprende la 2.10.0 (campi facoltativi nei checkout B2B, senza
prova propria) e la 2.10.1 (testi della Privacy, documenti e commenti di
`/usage`). Cambia `extensions/**`, quindi tutti i 36 check sono stati
riesaminati sulle modifiche, con versioni identiche al record precedente. La
query della Function aggiunge solo `buyerIdentity.purchasingCompany.company.id`,
un identificativo senza dati personali, usato come booleano; `readConfiguration`
accetta `b2bFieldsOptional` solo se `true` e resta fail-open come prima. Il
salvataggio della nuova spunta passa da `rules-action.server.ts` con la sessione
admin autenticata e scrive il metafield dello store della sessione, come le altre
regole; scope e manifest invariati, nessun endpoint nuovo. La sezione Regole
rende testo da `i18n` con componenti Polaris, senza HTML iniettato. Il sito
cambia solo testo statico. Esito: 30 `executed`, 6 `not_applicable`, 0
`unresolved`, 0 finding reali. `check`, `record` e `review` ripetuti con
`--config dev` e `--config shopify.app.toml`: 385 file, stesse 13 occorrenze
deterministiche di `known-deterministic-findings.json`, `record` accettato (36
check, 13 soppressi), `review` exit 0 e `scopeDiffers: false` in entrambe.
Prove grezze in `cf-ready-publications/security-2101/`; SHA-256 del documento
registrato `9b3e725477d367aea6279485d02dc8aa096d21d5a54de5f266b55def77f80a07`
(dev) e `630d56c104d997efb6d60af14becb449541deeef91d593d8cd7f958e32eed029`
(Production).

Review del 14 novembre 2026 per la 2.9.3, coding agent Claude Code su richiesta
«Pubblica» dell'owner, sul candidato `feat/utilizzo-store`, commit
`68b3ae8db41f0485e1457aa98741a51aff1603b6`, tree
`1c5d00a6df003ae06438bd153f52769441c40ecd`, rispetto alla review 2.9.1 su
`254e578`; il commit successivo aggiunge soltanto questa prova e il record
generato. Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1,
Node 26.13.1 e npm 12.2.2, versioni dei check identiche al record precedente.
Il diff tocca `app/owner-control/` (nuovo report `/usage`, solo owner via
webhook Telegram già autenticato), `site/` (Guide, home, sitemap, Privacy con
JSON-LD statico), `scripts/prepare-pages-site.mjs`, il workflow
`deploy-pages-production.yml` (solo confronto degli asset con `cmp`) e la sola
versione nel lockfile; il workflow non è coperto dalla tabella, quindi tutti i
36 check sono stati riesaminati sulle modifiche. In particolare
`OVERBROAD_DATA_ACCESS` (la query `OwnerStoreUsage` seleziona solo le chiavi dei
localized fields e la risposta all'owner contiene totali per store),
`MISSING_TENANT_ISOLATION` e `REQUEST_DERIVED_SHOP_SCOPE` (gli store vengono da
D1, mai dalla richiesta; nessuna superficie merchant), `SQL_INJECTION` (SQL
statico senza parametri; la search query Shopify usa una data calcolata dal
server), `CREDENTIAL_LOG_LEAKAGE` (nessun log nuovo) e i check sul sito (nessun
script eseguibile nuovo). Esito: 30 `executed`, 6 `not_applicable`, 0
`unresolved`, 0 finding reali. Scansione su 384 file, stesse 13 occorrenze
deterministiche di `known-deterministic-findings.json`. `record` accettato (36
check, 13 soppressi), `review`: `scopeDiffers: false`, nessun blocco, exit 0.
Prove grezze in `cf-ready-publications/security-usage-293/`; SHA-256 del
documento registrato
`d4b01be8531bf417dc911d046428f2235bf9fc81ea41b3e85ee3d39353f29ac8`.

Review del 13 novembre 2026 per la 2.9.1, coding agent Claude Code su richiesta
«procedi pubblica e promuovi» dell'owner, sul candidato
`chore/aggiorna-dipendenze`, commit `254e578cf0c02a32dfd1a8915836fbc984e355d4`,
tree `aef5318ff72f7ca5cd6277a648a6ca7a6775915a`, rispetto alla review 2.9.0 su
`1470c98`; il commit successivo aggiunge soltanto questa prova e il record
generato. Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1,
Node 26.13.1 e npm 12.2.2. Il diff non tocca `app/`, `workers/`, i sorgenti della
Function, manifest né migrazioni. Cambiano dipendenze e lockfile, il
`package.json` della Function (solo Vitest), `cloudflare.config.ts` (solo
compatibility date `2026-11-10`, senza flag con data nella finestra dal
2 ottobre), workflow (pin di Node e react-doctor, compatibility date del backup),
script di tooling e documenti: `extensions/**` e i workflow chiedono il riesame
di tutti i 36 check, con versioni identiche al record precedente. Ripetuti in
particolare `DEPENDENCY_REACHABILITY` (dipendenze runtime cambiate solo di
patch; `npm audit --omit=dev` riporta solo `minimatch` moderato nel
`graphql-config` di build della Function, fuori dal Worker e dal Wasm),
`COMMITTED_SECRET` e `CREDENTIAL_LOG_LEAKAGE` (nessuna credenziale né log di
segreti nel diff). Gli esiti dei check sul codice dell'app sono riusati dal
record 2.9.0, su file invariati, con le 23 citazioni delle 13 soppressioni
rilette sul tree. Esito: 30 `executed`, 6 `not_applicable`, 0 `unresolved`,
0 finding reali. Scansione su 382 file, stesse 13 occorrenze deterministiche di
`known-deterministic-findings.json`. `record` accettato (36 check, 13
soppressi), `review`: `scopeDiffers: false`, nessun blocco, exit 0. Prove grezze
in `cf-ready-publications/security-deps-291/`; SHA-256 del documento registrato
`bdbc5ffc390b8b052526ff5f95492237410899f88d411be1200103b04e681b0d`.

Review del 12 novembre 2026 per la 2.9.0, coding agent Claude Code su richiesta
«Pubblica» dell'owner, sul candidato `feat/visibilita-seo`, commit
`1470c987dce5efd130607bab4bef6fba7aa1257f`, tree
`e3ece8b64812ae2aa4c18bd990e42c6b2faaba54`, rispetto alla review 2.8.3 su
`bf16b0e`; il commit successivo aggiunge soltanto questa prova e il record
generato. Configurazione `shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1,
Node 26.13.0 e npm 12.2.2. Il diff non tocca `app/`, `extensions/`, `workers/`,
manifest né migrazioni; nel lockfile cambia solo la versione. Cambiano `site/`
(Guide, home, sitemap, `llms*.txt`, `style.css`, file della chiave IndexNow),
`scripts/indexnow.mjs` con il suo test, il test dei documenti e il workflow
`deploy-pages-production.yml`, che la tabella incrementale non copre: riesaminati
quindi tutti i 36 check sulle modifiche, con versioni identiche al record
precedente. Verificati in particolare: pagine statiche senza input né script
nuovi, JSON-LD come dati non eseguiti e CSP di `_headers` invariata
(`CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`);
`indexnow.mjs` chiama solo l'origine e l'endpoint costanti e stampa esito e
conteggio (`SSRF_REQUEST_FORGERY`, `CREDENTIAL_LOG_LEAKAGE`); il file della
chiave IndexNow è una prova pubblica di proprietà del dominio, non una
credenziale (`COMMITTED_SECRET`); lo step IndexNow del workflow non usa segreti
né permessi nuovi; app embedded invariata (`STATIC_FRAME_ANCESTORS`,
`MISSING_EMBEDDED_CSP`). Gli esiti dei check sul codice dell'app sono riusati
dal record 2.8.3, su file invariati. Esito: 30 `executed`, 6 `not_applicable`,
0 `unresolved`, 0 finding reali. Scansione su 382 file, nessun file saltato o
gap, stesse 13 occorrenze deterministiche di
`known-deterministic-findings.json`. `record` accettato (36 check, 13
soppressi), `review`: `scopeDiffers: false`, exit 0. Prove grezze in
`cf-ready-publications/security-visibilita-290/`; SHA-256 del documento
registrato `cfe5b0d59cf28062701b2b13861122727e39dd3e065749ec18941808fe5a1ce3`.
Dopo la prova il candidato cambia soltanto la chiave di cache dell'action CI
`setup-playwright`, due file di test (`check-docs`, `indexnow`) e
`scripts/indexnow.mjs`, che riceve `fetch` come parametro per i test con le
stesse URL costanti: riesaminati `SSRF_REQUEST_FORGERY` e
`CREDENTIAL_LOG_LEAKAGE` senza finding, nessuna superficie distribuita
dell'app, gli altri esiti riusati.

Controlli Production della 2.8.3 dell'11 novembre 2026, eseguiti prima della
pubblicazione sullo stesso commit `bf16b0e21b2e016e2cd240ac49ffe76eec77dbc3` e
tree `9bc4ee3d43e0c9f24886e8c6ce991ac82711a77b` della review Development qui
sotto. Il candidato è promosso in `main` con «Promuovi» della stessa richiesta
«pubblica e promuovi» dell'owner; PR e commit della promozione sono registrati
nella ricevuta del coordinatore. Ripetuti `check`, `record` e `review` con
`--config shopify.app.toml`: `shopify.app*.toml` invariati rispetto a
`origin/main`, `extensions/` cambiato solo nella lettura della configurazione
della Function e nei suoi test, 370 file scansionati, stesse 13 occorrenze
deterministiche e stesse versioni dei 36 check della scansione dev; registrato
lo stesso documento agente della review Development. `record` accettato (36
check, 13 soppressi), `review`: 29 passati, 6 non applicabili,
`scopeDiffers: false`, exit 0. Prove grezze in
`cf-ready-publications/security-prod-283/`; SHA-256 del documento registrato
`8f4d4d5c8cf625b918750b6b0e5df65dfe0d25635324bd736a85e3c3edeb0420`.

Review dell'11 novembre 2026 per la 2.8.3, coding agent Claude Code su
richiesta «pubblica e promuovi» dell'owner, sul candidato `fix/schema-2-legacy`,
commit `bf16b0e21b2e016e2cd240ac49ffe76eec77dbc3`, tree
`9bc4ee3d43e0c9f24886e8c6ce991ac82711a77b`, rispetto alla review Development
2.8.2 su `e23289c` qui sotto; il commit successivo aggiunge soltanto questa
prova e il record generato. Configurazione `shopify.app.dev.toml`, CLI, engine e
ruleset 5.0.1, Node 26.13.0 e npm 12.2.2. Il diff cambia `extensions/**`:
ripetuti tutti i 36 check sulle modifiche, con versioni identiche a quelle del
record precedente e nessun esito riusato senza riesame. Verificati in
particolare: `readConfiguration` della Function accetta solo `schemaVersion`
3 e un valore diverso resta fail-open come prima, senza nuovi input o output;
`readConfig` di `app/config.ts` accetta solo `CONFIG_SCHEMA_VERSION` e toglie
`errorDisplay`, restringendo i valori accettati del metafield, letto da tutti i
consumatori solo per lo store della sessione autenticata e senza token nel
documento scritto; fixture e test della Function e dell'app aggiornati allo
schema 3; `scripts/diff-check.mjs` locale e iniettabile, con `spawnSync` ad
argomenti; documentazione e CHANGELOG senza effetti operativi. Nessun file
aggiunto o rimosso: confermati i 6 check non applicabili (niente upload, app
proxy, script tag, Liquid o theme extension). Esito: 30 `executed`, 6
`not_applicable`, 0 `unresolved`, 0 finding reali. Scansione su 370 file,
nessun file saltato o gap, stesse 13 occorrenze deterministiche negli stessi
file e righe di `known-deterministic-findings.json`, in file invariati da
`e23289c`, riemesse come soppresse con citazioni rilette sul tree. `record`
(stdin) accettato con 36 check e 13 finding soppressi, exit 0; `review` esce 0,
scope coerente con `agent-checks.json` (`scopeDiffers: false`): 29 passati, 6
non applicabili, nessun blocco. Controllo statico: comportamento live non
provato. Prove grezze nella directory Git comune
`cf-ready-publications/security-283/`. SHA-256: `deterministic-findings.json`
`e79b8336…a0cf`, `agent-checks.json` `2231901d…c00b`, `agent-findings.json`
`0368757398c4cfc9716cff702bf6df98d22313a7a6e733ed131c3b7a835c7b9e`.

Controlli Production della 2.8.2 dell'11 novembre 2026, eseguiti prima della
pubblicazione sullo stesso commit `e23289c8132ec58478b66c0e409cf5f44223faa8` e
tree `312a188bd99a0fb22ffdff9b67951ee89c91ca82` della review Development qui
sotto. Il candidato è promosso in `main` con «Promuovi» della stessa richiesta
«pubblica e promuovi» dell'owner; PR e commit della promozione sono registrati
nella ricevuta del coordinatore. Ripetuti `check`, `record` e `review` con
`--config shopify.app.toml`: `shopify.app*.toml` invariati rispetto a
`origin/main`, `extensions/` cambiato solo nei file di lingua della Function,
370 file scansionati, stesse 13 occorrenze deterministiche e stesse versioni
dei 36 check della scansione dev; registrato lo stesso documento agente della
review Development. `record` accettato (36 check, 13 soppressi), `review`: 29
passati, 6 non applicabili, `scopeDiffers: false`, exit 0. Prove grezze in
`cf-ready-publications/security-prod-282/`; SHA-256 del documento registrato
`ccc9b69e232dab3990992fd1ba8cf5086a70873a8a7834107693bfbfca154eb0`. Dopo il
primo tentativo CI il candidato aggiunge solo test di copertura
(`tests/billing/account-reconciliation.test.ts`, `scripts/check-docs.node-test.mjs`)
e rende iniettabile lo script locale `scripts/diff-check.mjs`, che non entra
nell'app distribuita: nessun check da ripetere secondo la tabella.

Review dell'11 novembre 2026 per la 2.8.2, coding agent Claude Code su
richiesta «Pubblica» dell'owner, sul candidato `fix/audit-2.8.2`, commit
`e23289c8132ec58478b66c0e409cf5f44223faa8`, tree
`312a188bd99a0fb22ffdff9b67951ee89c91ca82`, rispetto alla review Development
2.8.1 su `2aebf27` qui sotto; il commit successivo aggiunge soltanto questa
prova e il record generato. Configurazione `shopify.app.dev.toml`, CLI, engine e
ruleset 5.0.1, Node 26.13.0 e npm 12.2.2. Il diff cambia `extensions/**` (nome e
descrizione localizzati della Function, una fixture di test): ripetuti tutti i
36 check sulle modifiche, con versioni e prompt identici a quelli del record
precedente e nessun esito riusato senza riesame. Verificati in particolare:
`storeRenewedSession` aggiorna solo la riga con l'ID caricato da D1 e solo se
lo store di `session.shop` è attivo, con valori vincolati da `bind()`;
`findOfflineSession` legge `offline_${shop}` da dominio firmato del webhook o
dal claim D1, e la decifratura resta legata a ID e dominio della riga; rimozione
di `customShopDomains` e `SHOP_CUSTOM_DOMAIN`, che restringe i domini accettati;
lotto della riconciliazione billing con limite calcolato da un conteggio D1;
timeout del client Telegram, con URL e token invariati e messaggi d'errore
senza segreti; join della conversione più recente nel Control Center, ancora
per `shop_id`; query di `app/validation/repository.server.ts` con meno colonne
e stessi filtri per dominio; migrazione `0035` con solo `DROP INDEX`; payload
dei loader Home e onboarding ridotti; etichette dei modali da testi i18n;
`scripts/diff-check.mjs` locale, con `spawnSync` ad argomenti; workflow
`security-maintenance.yml` che usa la CLI del lockfile invece di
un'installazione globale. Esito: 30 `executed`, 6 `not_applicable`, 0
`unresolved`, 0 finding reali. Scansione su 370 file, nessun file saltato o
gap, stesse 13 occorrenze deterministiche negli stessi file e righe di
`known-deterministic-findings.json`, riemesse come soppresse con citazioni
rilette sul tree. `record` (stdin) accettato con 36 check e 13 finding
soppressi, exit 0; `review` esce 0, scope coerente con `agent-checks.json`
(`scopeDiffers: false`): 29 passati, 6 non applicabili, nessun blocco.
Controllo statico: comportamento live non provato. Prove grezze nella
directory Git comune `cf-ready-publications/security-282/`. SHA-256:
`deterministic-findings.json` `af5c91bb…5ad3`, `agent-checks.json`
`b0ca1266…e093`, `agent-findings.json`
`da82b74c061a9e17fee02425cde4244befd966f0058544e1c514a5875d395d25`.

Promozione Production della 2.8.1 dell'11 novembre 2026, su richiesta
«Promuovi» dell'owner: candidato `develop` `076cfd043daeb6e31e0b5456e86de11339e75517`,
tree `559be609e01d0fb2734c98708d65ec53e32b8566`, promosso in `main` con
[max23468/CF-Ready#878](https://github.com/max23468/CF-Ready/pull/878) (`5c8419d`,
stesso tree). Rispetto alla review Development qui sotto (`2aebf27`) il candidato
cambia solo documentazione, `scripts/controlled-launch-report.mjs` con il suo
test e un test: nessun check da ripetere secondo la tabella. Ripetuti `check`,
`record` e `review` con `--config shopify.app.toml`: `shopify.app*.toml`
invariati rispetto a `main`, `extensions/` cambiato solo in una fixture di test,
stesse 13 occorrenze deterministiche; riusato il documento agente della review
Development. `record` accettato (36 check, 13 soppressi), `review`: 29 passati,
6 non applicabili, exit 0. Prove grezze in
`cf-ready-publications/security-prod-281/`; SHA-256 del documento registrato
`9b41c9c8cc84e830c0c9e403daffd6ce733ac8f39c9580ac54e1384b90bc0603`.

Review dell'11 novembre 2026 per la 2.8.1, coding agent Claude Code su
richiesta «Pubblica» dell'owner, sul candidato `chore/audit-tooling`, commit
`2aebf27a2b32c89eff58d158dc88d16c650795c0`, tree
`44b13f7fb026eb741106f98c2d1c286375f1989d`, rispetto alla review del 10
novembre su `9ccff02` qui sotto; il commit successivo aggiunge soltanto questa
prova e il record generato. Configurazione `shopify.app.dev.toml`, CLI, engine e
ruleset 5.0.1, Node 26.13.0 e npm 12.2.2. Il diff cambia 97 file, tra cui
`app/owner-notifications/**`, `app/reviews.ts`, i CSS e `app/shopify-ui.ts`,
che la tabella della procedura non copre: ripetuti tutti i 36 check, con
versioni uguali a quelle del record precedente e nessun esito riusato.
Verificati in particolare: migrazione `0034` senza input esterno; nuove query
di `app/events.server.ts`, `app/shop.server.ts` e
`app/validation/repository.server.ts` con `bind()` su `session.shop` o sul
dominio della sessione di `afterAuth`; deduplica delle notifiche owner con
lista `IN (?, ?)` costruita solo dal numero di oggetti costanti e valori
vincolati; colonne di `observeChargeLifecycle` scelte da costanti;
`scopes_update` firmato HMAC che, senza elenco `current`, non tocca più la
sessione; link alle impostazioni checkout costante
`shopify://admin/settings/checkout`; rimozione del monitoraggio BFS senza nuove
chiamate; pulizia dei worktree in `scripts/publish.mjs` solo locale, con
`spawnSync` ad argomenti. Esito: 30 `executed`, 6 `not_applicable`, 0
`unresolved`, 0 finding reali. Scansione su 369 file, nessun file saltato o
gap, stesse 13 occorrenze deterministiche negli stessi file di
`known-deterministic-findings.json`: quattro `UNSAFE_INNERHTML` di
`tests/browser/components.test.tsx` e quella di
`tests/browser/visual-surfaces.test.tsx` cambiano riga e sono riemesse con
citazione riletta. `record` accettato con 36 check e 13 finding soppressi;
`review` esce 0, scope coerente con `agent-checks.json`: 29 passati, 6 non
applicabili. Controllo statico: comportamento live non provato. Prove grezze
nella directory Git comune `cf-ready-publications/security-281/`. SHA-256:
`deterministic-findings.json` `1d4b4c4e…f87b`, `agent-checks.json`
`79d6335d…a5bd`, `agent-findings.json` `b007801a…bf96`.

Promozione Production della 2.8.0 del 10 novembre 2026, su richiesta
«Promuovi» dell'owner: candidato `develop` `5711c1396140b83feb4df844131a942d59942e26`,
tree `340b960f1f7259940596a74d114e0cfda91946dc`, identico al tree della review
Development qui sotto (commit `cb6ee30`), promosso in `main` con
[max23468/CF-Ready#868](https://github.com/max23468/CF-Ready/pull/868) (`8917cfe`).
Ripetuti `check`, `record` e `review` con `--config shopify.app.toml`:
`shopify.app*.toml` ed `extensions/` invariati rispetto a `main`, stesse 13
occorrenze deterministiche e stesse versioni dei 36 check della scansione dev;
riusato il documento agente della review Development. `record` accettato (36
check, 13 soppressi), `review`: 29 passati, 6 non applicabili. Prove grezze in
`cf-ready-publications/security-prod-280/`.

Review incrementale del 10 novembre 2026 sulla 2.8.0, coding agent Claude Code
su richiesta «Pubblica» dell'owner, candidato `feat/offerta-email-precompilata`,
commit `9ccff02`, tree `3cc26dc1736d1bcd33ecfd699213fb427895b6a8`, rispetto alla
review precedente qui sotto. Cambiano solo `PlanChoice.tsx`,
`support-diagnostics.ts`, i testi IT/EN, un test e il changelog: oggetto e prima
riga fissi del `mailto:` verso l'indirizzo di supporto costante, codificati da
`URLSearchParams`. Ripetuti `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`,
`TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP`
e `OPEN_REDIRECT`: `executed`, nessun finding, nessun input esterno nel link. Gli
altri check sono riusati dalla review precedente, con versioni invariate e
occorrenze deterministiche identiche. `record` accettato (36 check, 13 soppressi),
`review`: 29 passati, 6 non applicabili. Prove grezze in
`cf-ready-publications/security-offerta-email-280/`.

Review incrementale del 10 novembre 2026 per la 2.8.0, coding agent Claude Code
su richiesta «pubblica» dell'owner, sul candidato `feat/lifetime-su-richiesta`,
commit `339fff911e958e06eed801b8f790b8792c3247f5`, tree
`30741857dd41e3d622d7ff2f0084ba100e996398`, rispetto al baseline 2.7.3
`da0fce5005432cc43beea76c5ca277cc6de61eda`; il commit successivo aggiunge
soltanto questa prova e il record generato. Il candidato è poi riallineato su
`develop` `f0a0014`: commit `6a130b327e0d2f4e293b63c12bae5ee2c5cd0283`, tree
`0cc0c1d4d7534898510422b3bb66224c35b53e60`. Rispetto al tree analizzato cambiano
solo il numero di decisione nei commenti (D-220 diventa D-221), l'hash della
migrazione `0033` per lo stesso commento e il tooling non distribuito di
`develop` (`scripts/publish.mjs`, un commento di `scripts/security-audit.mjs`):
gli esiti restano validi senza ripetere i check. Configurazione
`shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node 26.13.0 e npm 12.2.2.
Cambiano billing e repository D1 (`one_time_offers`, migrazione `0033`), Home
merchant, comando owner `/lifetime` nel Control Center, testi, sito e versione
nel lockfile. Ripetuti con un agente separato i 25 check della tabella per
`app/owner-control/**`, componenti, `app/i18n/**`, `site/**`, SQL, billing,
lockfile e client esterni: tutti `executed`, 0 finding reali. Verificati in
particolare: `/lifetime` raggiungibile solo dopo segreto Telegram, chat privata
e user ID owner, con claim per `update_id`; offerta scritta per `shop_id` da
dominio esatto, query con `bind()`; prezzo dell'addebito letto da D1 per
`session.shop`, mai dal form; pulsante di supporto `mailto:` a destinatario
costante. Riusati dal baseline 2.7.3 gli altri 11 check (5 `executed`, 6
`not_applicable`), con versioni invariate. Stesse 13 occorrenze deterministiche:
quattro `UNSAFE_INNERHTML` di `tests/browser/components.test.tsx` salgono di una
riga e sono riemesse con citazione riletta. `record` accettato con 36 check e
13 finding soppressi; `review` valida: 29 passati, 6 non applicabili. Controllo
statico: comportamento live non provato. Prove grezze nella directory Git
comune `cf-ready-publications/security-lifetime-280/`. SHA-256:
`deterministic-findings.json` `3fced694…008b`, `agent-checks.json`
`bd7063f9…08ad`, `agent-findings.json` `01b26fb0…3914`.

Review del 8 novembre 2026 per la 2.7.3, coding agent Claude Code su richiesta
«Pubblica tutto» dell'owner, sul candidato `refactor/untangle-codebase`, commit
`da0fce5005432cc43beea76c5ca277cc6de61eda`, tree
`8f4be5db688d1829186d260d4b4236bd20a4abf0`, base ultima release 2.7.2
`f675bb8e9e95a136b4a4659dc30141a62fec8fa0`; il commit successivo aggiunge
soltanto questa prova e il record generato. Il commit
`dc581542d39b8a479fba83bbc7292727ce65b414` cambia poi solo `maxBuffer` in
`scripts/coverage-report.mjs` e il suo test, tooling CI non distribuito e senza
rete, segreti o dati: gli esiti restano validi senza ripetere i check.
Configurazione
`shopify.app.dev.toml`, CLI, engine e ruleset 5.0.1, Node 26.13.0 e npm 12.2.2.
Il refactor cambia 301 file, compresi route, workers, webhook, auth, sessioni,
SQL, Telegram, Partner API, metafield, lockfile e test in `extensions/`: la
tabella della procedura richiede tutti i 36 check, ripetuti sul codice attuale
e senza esiti riusati. Verificati in particolare: `app/limited-body.ts`, che
rifiuta la lunghezza dichiarata e ferma lo stream al limite; HMAC calcolato sul
corpo prima di ogni uso del webhook in `app/webhooks/shopify-webhook.server.ts`;
`/performance` legato allo store dalla firma HMAC; segreto Telegram confrontato
sui digest prima di leggere il corpo, poi chat privata e user ID owner in
`app/owner-control/update.server.ts`; contesto di autenticazione creato per
richiesta; query D1 con `prepare().bind()` su `shop_domain` di sessione o di
webhook verificato, frammenti interpolati solo da costanti e mappe chiuse;
entitlement calcolato dal server e mai dal form. Le 48 query dei percorsi
merchant filtrano lo store, salvo due `UPDATE` su GID letti dall'Admin API
autenticata (`app/billing/repository.server.ts:482`, `:494`).
Scansione su 373 file, nessun file saltato o gap, stesse 13 occorrenze
deterministiche negli stessi file, con righe aggiornate e citazioni rilette.
Esito: 30 `executed`, 6 `not_applicable`, 0 `unresolved`, 0 finding reali.
`record` accettato con 36 check e 13 finding soppressi; `review` valida, scope
coerente con `agent-checks.json` e versioni dei 36 check uguali. Il controllo è
statico: `npm audit` non è ripetuto, il lockfile aggiunge solo la voce radice di
`yaml` 2.9.1 già installato, e comportamento live, Shopify e Cloudflare non sono
provati da questa review. Prove grezze nella directory Git comune
`cf-ready-publications/security-untangle-273/`. SHA-256:
`deterministic-findings.json` `e684cfc5…40f4`, `agent-checks.json`
`cd329015…a428`, `agent-findings.json` `86607662…39e1`.

Review incrementale del 6 novembre 2026 per la 2.7.2, coding agent Codex su
richiesta dell'owner di verificare l'approvazione Shopify e abilitare l'opzione
ordini per tutti. Candidato `2ed47f1c8e86dd4f27a19c51826769aa988086b2`, tree
`b6181cdcfae1560cb872e094caf28b6fbe04f5bf`, base ultima release
`53e8bff00c95f857ede2b4b254d06728d05847f4`; il commit successivo aggiunge
soltanto questa prova e il record generato. Configurazione `shopify.app.toml`,
CLI, engine e ruleset 5.0.1, Node 26.13.0 e npm 12.2.2. Tutte le versioni dei
36 check coincidono con il record della 2.7.1. Ripetuti `COMMITTED_SECRET`,
`CREDENTIAL_LOG_LEAKAGE` e `DEPENDENCY_REACHABILITY`: il diff cambia soltanto
il booleano pubblico `ORDER_NORMALIZATION_ENABLED`, documentazione e versione;
nessun segreto, log, flusso credenziali o pacchetto cambia. Gli altri 33 esiti
sono riusati dalla 2.7.1. Verificati i consumatori del flag: restano necessari
autenticazione Admin, scelta esplicita del merchant e scope ordini opzionali;
nessuna configurazione merchant viene attivata dal deploy.
Scansione su 347 file, nessun file saltato o gap, stesse 13 occorrenze
deterministiche negli stessi file e righe. `record` accettato con 36 check e
13 finding soppressi; `review` conferma scope coerente, 29 passed e 6 non
applicabili, nessun finding reale nuovo. Development riusa la review dello
stesso tree: il manifest non cambia. Prove grezze conservate nella directory
Git comune `cf-ready-publications/security-orders-272/`.

Review incrementale del 6 novembre 2026 per la 2.7.1, coding agent Claude Code su
richiesta «Pubblica» e «Promuovi» dell'owner, sul candidato
`fix/cf-validazione-nativa-shopify` (base `b9b0803334c4`) dalla review completa CLI 5 su
`c24690bee35d`. CLI 5.0.1, ruleset e versioni dei 36 check invariati; occorrenze
deterministiche invariate (13, stessi file). Cambiano `CheckoutSimulator.tsx`,
`checkout-simulator.ts`, `app/i18n/*`, pagine di `site/` e `llms-full.txt`
(ripetuti `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`,
`STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP`: solo testo statico e la prop
`details` di un campo Polaris, nessun sink, header e CSP invariati) e
`package-lock.json` solo nella versione (ripetuti `DEPENDENCY_REACHABILITY` e
`COMMITTED_SECRET`: nessuna dipendenza cambiata, nessun segreto nei file nuovi).
Gli altri esiti sono riusati dal record precedente. `record` accettato con 36
check e 13 finding soppressi, 0 finding reali; `review` valida, scope invariato,
347 file, nessun blocco. Il documento d'ingresso di `record` usa
`checks_executed` e `findings`: ripassare il file salvato, che ha forma diversa,
registra 0 check senza errore.

Review incrementale del 6 novembre 2026 per la promozione della 2.7.0, coding agent
Claude Code su richiesta dell'owner, sul candidato `feat/ordini-disponibilita`
(commit `cafd4e637c97`) dalla review completa CLI 5 su `300c86d`. CLI,
ruleset e versioni dei 36 check invariati. Cambiano: `@react-router/dev` e
`react-router` riportati a 8.5.0 (ripetuti `DEPENDENCY_REACHABILITY` e
`COMMITTED_SECRET`: `npm audit --omit=dev` invariato, 4 avvisi moderate solo in
`graphql-config` di build), le pagine legali di `site/` e
`OrderFormattingSection.tsx` (ripetuti i check XSS: solo testo statico e rendering
condizionale, nessun sink), `app/routes/app.rules.tsx`,
`app/features/rules/rules-action.server.ts`, `app/env.server.ts` e
`cloudflare.config.ts` (ripetuti i check di autenticazione e segreti: l'azione resta
dietro `authenticateAdminTimed`, la nuova variabile è un booleano non segreto). Gli
altri esiti sono riusati da `300c86d`. Riallineata la riga dell'occorrenza nota in
`app/routes/app.rules.tsx` (105). `record` accettato con 36 check e 13 finding
soppressi, 0 finding reali.

Review completa del 5 novembre 2026 con Shopify CLI 5.0.1 (engine e ruleset
`5.0.1`), coding agent Claude Code su richiesta «Pubblica» dell'owner, sul candidato
`ci/app-security-deterministico` (`2.7.0`, commit `c24690bee35d`, base
`b05946731fb4`). La nuova versione della CLI, i manifest (`[network_access]`) e le
dipendenze richiedono di ripetere tutti i check: 36, compreso il nuovo
`SHARED_NAMESPACE_METAFIELD_RENDER`, in tre passaggi indipendenti. Da questo
candidato la scansione deterministica è un gate CI (D-209) e in locale serve solo a
generare le istruzioni. Esito: 30 `executed`, 6 `not_applicable`, 0 `unresolved`, 0
finding reali; le 13 occorrenze deterministiche note restano falsi positivi, con
citazioni verificate sulle righe del candidato. `record` accettato con 36 check e 13
finding soppressi.

Review incrementale del 5 novembre 2026 sulla correzione D-211 (`fix/webhook-ordini-per-store`,
base `448bd236d4a6`, review completa qui sotto). Cambiano `shopify.app*.toml`
(rimossa la sottoscrizione `orders/create`), `app/routes/app.rules.tsx`,
`app/features/rules/rules-action.server.ts`, `app/env.server.ts` e il nuovo
`app/order-normalization/subscription.server.ts`. Tutti i 35 check sono stati
riesaminati sul diff: la nuova mutation `webhookSubscriptionCreate` usa l'URI HTTPS
configurato `SHOPIFY_APP_URL`, non un valore della richiesta, ed è chiamata solo
dopo `authenticate.admin` con lo `session.shop`. Esiti invariati: 29 `executed`, 6
`not_applicable`, 0 finding reali. Riallineate le righe di `app/routes/app.rules.tsx`
(53, 104) e corretta la citazione di `tests/browser/components.test.tsx:402`, che
riguarda una seconda `new Function` di test e non l'assegnazione `innerHTML` della
riga 397. `record` accettato con 35 check e 13 finding soppressi.

Review completa del 5 novembre 2026, coding agent Claude Code su richiesta
«Pubblica» dell'owner, sul candidato `feat/cf-maiuscolo-ordini` (`2.7.0`, base
`87b95033e80c`): Codice Fiscale e PEC uniformati negli ordini (D-206). Cambiano
`shopify.app*.toml`, scope e webhook, quindi tutti i 35 check sono stati ripetuti da
zero, in quattro passaggi indipendenti. CLI, ruleset e versioni dei check
invariati (4.9.4). Scansione deterministica `--config dev`: 344 file, nessun file
saltato, le stesse 13 occorrenze high già note, rivalutate come falsi positivi sulle
righe del candidato. Review: 29 check `executed`, 6 `not_applicable`, 0
`unresolved`, 0 finding reali; verificati in particolare HMAC del nuovo
`/webhooks/orders/create`, shop preso dalla ricevuta D1 nei job, scope ordini
opzionali e nessun valore fiscale in D1 o nei log. `record` accettato con 35 check
e 13 finding soppressi.

Review incrementale del 3 novembre 2026, coding agent Claude Code su richiesta
dell'owner di pubblicare e promuovere, sul candidato `7d7720b24e1e4454eefb7d319333a0dd0efc8a2f`
(`2.6.3`), dal baseline `41626dd2cd171708e12fe3b88efeb312899ffc1b`. CLI, ruleset e
versioni dei 35 check invariati. Nessun check ripetuto da zero: i soli cambiamenti
runtime sono commenti e lo stato della bozza Messaggi lato client; in dipendenze
cambiano `cf` e `@cloudflare/vite-plugin`, strumenti di sviluppo fuori dal bundle.
Tutti gli esiti sono riusati da `41626dd`. Le 13 occorrenze deterministiche restano
sulle stesse righe e ogni citazione di prova è stata riletta sul candidato.
Stesso esito con `--config dev` e `--config shopify.app.toml`, che differiscono solo per
identità e URL. `check --blocking high` e `review --blocking high` escono 1 per le stesse occorrenze
soppresse; `record` accettato con 35 check e 13 finding soppressi, 0 finding reali. Prove grezze in
`cf-ready-publications/security-release-263/`.

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

### Release 2.6.2 — review incrementale

30 ottobre 2026, coding agent Claude Code su richiesta «Pubblica» dell'owner,
`--config dev`. Candidato `2.6.2`, commit
`529f95739e65020dcccbc8ed4f1dea10f176c3ab`, tree
`5867fa3377c5f1e18fa692ce7de2ef5dfc118eaa`, branch
`fix/messages-discard-clears-error`; il commit successivo aggiunge soltanto
questa prova e il record. Rispetto a `41626dd` cambiano
`app/features/messages/use-messages-draft.ts`, `app/routes/app.messages.tsx`,
test, changelog e versione. CLI, engine, ruleset e versioni dei 35 check
invariati; scansione completa con lo stesso scope, nessun file saltato.

Ripetuti per le righe route e `.tsx`: `UNAUTHENTICATED_ENDPOINT`,
`MISSING_AUTHORIZATION_CHECK`, `CSRF_MISSING_PROTECTION`,
`REQUEST_CONTROLLED_ADMIN_CONTEXT`, `REQUEST_DERIVED_SHOP_SCOPE`,
`MISSING_TENANT_ISOLATION`, `UNSCOPED_SHOP_CONFIG_WRITE`,
`SESSION_LIFECYCLE_AND_REPLAY`, `WEAK_SHOP_VALIDATION`, `OPEN_REDIRECT`,
`OVERBROAD_DATA_ACCESS`, `EXPIRING_OFFLINE_TOKEN`, `CREDENTIAL_BROWSER_LEAKAGE`,
`CREDENTIAL_LOG_LEAKAGE`, `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`,
`TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP`.
Gli altri 16 esiti sono riusati da `41626dd`. Il diff cambia solo stato client
del draft (la risposta rifiutata scartata da Annulla) e una prop dell'editor:
loader, action, autenticazione, query e intestazioni restano invariati; il
testo d'errore è una stringa i18n resa come attributo React. Lockfile cambiato
solo nella versione del pacchetto, nessun segreto nel diff.

Le 13 occorrenze deterministiche restano nelle stesse righe e con le stesse
motivazioni. `record` accettato (35 check, 13 finding soppressi);
`review --blocking high` esce 1 come nel baseline: 29 check superati, 5 non
applicabili, nessun finding reale.

Prove in `cf-ready-publications/security-messages-discard-529f957/` nella
directory Git comune. SHA-256: deterministic
`69e6c6fec4f06acbe40b25a6117d3369dca384d94d4da0c966ccb640789dafd3`,
agent-checks
`530350bad24c7a6e8d9ed82feba4a10f87857b5b07dcc29b3063a813be370aa7`,
agent-findings
`b5c873868f0221a3fcf44ae1e9e7aa7a547c0f5710e70b84458e4af9cb149048`.

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

Review incrementale del 3 novembre 2026, coding agent Claude Code su richiesta
«Pubblica e promuovi» dell'owner, sul candidato `1ae37c317bc53982b1a2fff992e8299f58c81e71`
(tree `67879da233a3c9e8c1f406e60f8e38a68e29ab71`, `2.6.4`), dal baseline
`41626dd2cd171708e12fe3b88efeb312899ffc1b`. Cambiano solo documentazione, test,
changelog e metadati di `package.json` (versione, `author`): nessun check da
ripetere. Scansione completa con `--config dev`: 338 file, CLI, ruleset e versioni
dei 35 check invariati, le stesse 13 occorrenze deterministiche sulle stesse righe.
Tutti gli esiti agente riusati da `41626dd`; `record` accettato, `review --blocking high`
esce 1 per le sole occorrenze deterministiche già motivate. Prove grezze in
`cf-ready-publications/security-facciata-1ae37c3/`.

Review incrementale del 3 novembre 2026, coding agent Claude Code su richiesta
«Pubblica e promuovi» dell'owner, sul candidato `59bb24a4c391f12fdd15af79732c452606d9e2ac`
(tree `9c367e5aa3c384c1c0b9c4f9426686095db5909a`, `2.6.5`), dal baseline
`41626dd2cd171708e12fe3b88efeb312899ffc1b`; il commit successivo aggiunge soltanto
questa prova. Cambia `app/shopify.server.ts`: la guardia `ALLOWED_SHOP` passa da
`afterAuth` a una sottoclasse di `D1SessionStorage` che rifiuta lo store prima di
`storeSession`, più test, changelog e versione. Ripetuti i 14 check della riga route e
`app/shopify.server.ts`: lo store confrontato è `session.shop` della sessione verificata,
il confronto esatto `split(",").includes` è invariato, `refuseInstall` cancella con
parametri D1 solo righe dello store rifiutato, nessuna route, redirect, log o dato al
browser nuovo, `expiringOfflineAccessTokens` e lo storage dei token restano invariati.
`SESSION_LIFECYCLE_AND_REPLAY` migliora: il replay dello stesso session token non
persiste più una sessione fuori lista. Nessun finding reale; gli altri 21 esiti sono
riusati da `41626dd`. Scansione completa con `--config dev` e `--config shopify.app.toml`
(invariato rispetto a `main`): 338 file, CLI, ruleset e versioni dei 35 check invariati,
le stesse 13 occorrenze deterministiche sulle stesse righe con citazioni rilette.
`record` accettato con 35 check e 13 finding soppressi per entrambe le configurazioni,
`review --blocking high` esce 1 per le sole occorrenze deterministiche già motivate.
Prove grezze in `cf-ready-publications/security-allowlist-59bb24a/`. Hash dev:
`deterministic-findings.json` `ecd85bd8…a66f34c`, `agent-checks.json` `da7c9009…783d256`,
`agent-findings.json` `ae6300a9…a4b775e`.
