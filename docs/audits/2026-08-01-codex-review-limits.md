# Audit completo delle PR #52–#107 e delle review Codex

**Data audit:** 1 agosto 2026

**Repository:** `max23468/CF-Ready`

**Snapshot originario dell’audit:** `develop` a `978acf4` (`#107`)

**Stato delle correzioni:** aggiornato durante la campagna delle 10 PR; la
tabella «Finding ancora aperti» rappresenta il backlog corrente.

**Perimetro:** PR `#52`–`#107`, incluse espressamente `#68` e `#105`

## 1. Esito esecutivo

Sono state riesaminate **56 PR**: 54 unite in `develop` e due chiuse senza merge
(`#69` e `#78`). Cinquantaquattro PR avevano ricevuto soltanto il commento
«You have reached your Codex usage limits for code reviews»; `#68` e `#105`
avevano invece ricevuto una review reale di Codex e sono incluse per controllo.

Il risultato sul codice corrente è:

- **1 finding P1**, che resta un gate esplicito prima della `1.0.0`;
- **15 finding P2**;
- **7 finding P3**;
- nessun P0;
- 3 thread Codex reali ancora `unresolved` su GitHub: uno in `#68`, due in
  `#105`;
- numerosi difetti storici delle PR intermedie risultano corretti dalle PR
  successive e sono riportati come tali, senza riaprirli.

### Finding ancora aperti

| ID          | PR principale | Classe                    | Priorità   | Sintesi                                                                                                           |
| ----------- | ------------- | ------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| F-M3-57-01  | #57           | limite di prodotto        | P1 pre-1.0 | con `localizedFields` vuoto i checkout accelerati possono passare senza Codice Fiscale richiesto                  |
| F-M5-67-01  | #67           | bug di integrità dati     | P2         | aggiornamento conto ed evento billing non sono atomici; un evento può perdersi definitivamente                    |
| F-M5-67-02  | #67 / #81     | bug di integrità dati     | P2         | durante la conversione a una tantum l’evento può registrare importo e valuta della sottoscrizione                 |
| F-M5-67-03  | #67           | documentazione/compliance | P3         | SHA-256 del dominio viene descritto come «non reversibile», formulazione troppo forte                             |
| F-M5-67-04  | #67           | bug di concorrenza        | P3         | due primi accessi concorrenti possono registrare due eventi `trial_started` per lo stesso store                   |
| F-M5-74-01  | #74 / #83     | bug di gestione errori    | P2         | errori di trasporto/risposta Shopify sfuggono ai risultati tipizzati e aprono la Error Boundary                   |
| F-M5-76-01  | #76           | hardening                 | P3         | il `returnUrl` billing preferisce il parametro `shop` non fidato alla sessione autenticata                        |
| F-M5-79-01  | #74/#79       | bug di validazione billing | P2        | l’action accetta il piano ricorrente già attivo e può creare una sostituzione/addebito ridondante                 |
| F-M6-83-01  | #83 / #90     | bug di verifica           | P2         | il readback della configurazione non confronta messaggi, entitlement e intero metafield                           |
| F-M6-83-02  | #83           | bug di consistenza        | P2         | Regole salva la dichiarazione D1 prima di sapere se Shopify ha accettato la configurazione                        |
| F-M6-83-03  | #83/#90/#99   | bug di consistenza        | P2         | ogni salvataggio riscrive l’entitlement dalla cache D1 senza riconciliare prima Shopify                           |
| F-M6-83-04  | #83           | bug UX/i18n               | P3         | la rotta di login ignora la locale comune e mostra sempre etichette ed errori in inglese                          |
| F-M6-83-05  | #83/#99       | bug di validazione        | P2         | Home e onboarding permettono di abilitare la Validation anche senza prova o licenza valida                        |
| F-M6-86-01  | #83/#86/#90   | bug UX/feedback           | P2         | il banner di successo resta durante nuove modifiche e in Messaggi dichiara erroneamente «Regole salvate»          |
| F-M6-87-01  | #87 / #99     | miglioramento UX          | P3         | le azioni via fetcher disabilitano i pulsanti senza mostrare quale operazione è in corso                          |
| F-M6-90-01  | #90           | bug UX/contenuto          | P2         | Home descrive un checkout attivo anche quando la Validation è disattivata o il diritto è scaduto                  |
| F-M6-99-01  | #83/#99       | bug di concorrenza        | P2         | enable/disable riscrivono la configurazione letta prima della lease e possono perdere una modifica concorrente    |
| F-M6-99-02  | #99           | bug di consistenza        | P2         | l’attivazione onboarding salva la dichiarazione prima dell’esito Shopify                                          |
| F-M6-99-03  | #99           | bug UX/salvaguardia       | P2         | la cancellazione del rinnovo parte al primo clic senza la conferma richiesta per azioni ad alto impatto           |
| F-M6-101-01 | #101/#103/#105 | accessibilità/responsive | P3         | i passi incompleti hanno comunque l’icona di spunta e la griglia forza quattro colonne                            |
| F-M6-105-01 | #105          | bug di concorrenza        | P2         | la persistenza del passo può terminare dopo la chiusura e riportare `onboarding_step` a 4                         |
| F-M6-105-02 | #105          | bug UI/stato              | P2         | checkbox e istruzioni della dichiarazione possono divergere tornando al riepilogo                                 |
| F-M6-105-03 | #99 / #105    | validazione input         | P3         | `Number(...)` più `Math.min/max` lascia passare `NaN` fino a D1                                                   |

## 2. Metodo, classificazione e limiti

Per ogni PR sono stati controllati metadati GitHub, stato, diff, file toccati,
descrizione, check e commenti/review. I diff sono stati poi confrontati con il
codice corrente e con `git blame`. Per richiesta dell’owner, la tabella include
**soltanto problemi ancora aperti nello snapshot corrente**. Le sezioni `F-*`
sono invece il registro stabile dei finding individuati: mantengono ID e stato,
e quando una correzione viene verificata passano a «chiuso», riportano l’esito e
vengono rimosse dalla tabella. Gli esiti usati nella rassegna per PR sono:

- **aperto**: il problema è riproducibile o dimostrabile nello snapshot corrente;
- **corretto, non finding**: il difetto esisteva nella PR ma una PR successiva
  lo ha rimosso;
- **limite noto**: comportamento esplicitamente accettato per lo stato `0.x`,
  con un gate futuro già assegnato;
- **nessun finding**: non è emerso un problema azionabile nel perimetro della PR.

Priorità: P0 blocco immediato; P1 alto impatto o gate pre-release; P2 difetto
con impatto circoscritto ma reale; P3 hardening, accuratezza o caso marginale.

Verifiche fresche eseguite:

- `npm run check`: verde sullo snapshot con il report; 37 documenti, 77 test
  app, 105 test Function, React Doctor 100/100, build app e Function, dry-run
  Wrangler;
- `npm audit --omit=dev --audit-level=high`: un advisory high su
  `react-router`, `GHSA-qwww-vcr4-c8h2`; l’advisory riguarda soltanto le API RSC
  instabili, non abilitate qui, ed è già registrata in D-116. Non è proposto un
  upgrade forzato a React Router 8;
- GitHub: nessun alert Dependabot, CodeQL o secret scanning aperto;
- branch protection: `verify`, `react-doctor` e `dependency-review` richiesti;
  `promotion-guard` richiesto anche su `main`; conversazioni risolte e admin
  enforcement attivi;
- tutti i check disponibili delle 56 PR risultano `SUCCESS` o `SKIPPED` quando
  il job non era applicabile.

Readback remoto, solo in lettura:

- Cloudflare Development non ha migrazioni D1 pendenti; `0008` è applicata e il
  Worker attivo è la versione `a310b057-7eb7-4066-992a-2a1e1e74c17a`,
  deployment `2ec5147e-5623-49f1-8dc6-801848a49315`, sul commit `f13c14c`;
- Shopify Development ha attiva la versione `0.4.23`
  (`gid://shopify/Version/1072789684225`), riferita allo stesso commit;
- il run coordinato `30707318436` ha applicato e riletto D1, pubblicato e
  riletto Worker e Shopify, ed eseguito lo smoke del Worker.

La review UX/UI è statica: gerarchia, copy, stato, feedback, accessibilità e
responsività sono stati confrontati con il codice React e con i pattern nativi
Polaris/App Bridge. Sono stati ricontrollati in particolare
[Setup guide](https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide),
[Grid](https://shopify.dev/docs/api/app-home/web-components/layout-and-structure/grid),
[Button](https://shopify.dev/docs/api/app-home/web-components/actions/button) e
[Save Bar](https://shopify.dev/docs/api/app-home/app-bridge-web-components/save-bar).
Il validatore ausiliario Polaris installato localmente non si è avviato perché
il suo pacchetto non risolve `typescript`; typecheck e React Doctor del progetto
sono invece verdi. Non sono stati eseguiti rendering, viewport, screen reader o
test browser/live, come richiesto.

Fonti esterne ricontrollate: Shopify documenta duplicati e retry delle consegne
webhook e fino a otto retry per le chiamate fallite; Cloudflare documenta che
`D1Database.batch()` esegue le istruzioni come transazione; Shopify documenta
`returnUrl` come destinazione del redirect post-approvazione. Riferimenti:
[Shopify, verifica consegne](https://shopify.dev/docs/apps/build/events/verify-deliveries),
[Shopify, troubleshooting webhook](https://shopify.dev/docs/apps/build/webhooks/troubleshoot),
[Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[Shopify appSubscriptionCreate](https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/appSubscriptionCreate),
[GitHub Advisory GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).

Durante la campagna sono stati eseguiti i deploy Development coordinati
`0.4.22` e `0.4.23`, inclusa la migrazione additiva `0008`. Non sono stati
eseguiti addebiti di prova, scenari browser sul dev store o scritture Production;
le altre prove live storiche restano evidenze, non sono presentate come nuove.

---

## 3. Milestone M3 — Motore di validazione e Development persistente

### [PR #52 — prepare persistent Development deploy](https://github.com/max23468/CF-Ready/pull/52)

**Stato:** merged, `e2f0240`; 6 file, `+49/-19`; review Codex non eseguita per
limite. Configura il Worker Development persistente, URL OAuth, preflight e
workflow Shopify senza eseguire Production.

#### F-M3-52-01 — Shopify e Worker non sono distribuiti dallo stesso workflow

- **Classe/priorità/stato:** bug operativo/CI-CD, P1 pre-`1.0.0`, chiuso.
- **Evidenza:** `.github/workflows/deploy-development.yml:14-87` contiene un
  solo job, `deploy-shopify`: esegue `npm run check`, verifica con `curl` un
  backend già esistente e pubblica Shopify, ma non applica migrazioni D1 né
  distribuisce o rilegge il Worker del `GITHUB_SHA`. Il Master Plan D-082 e
  `§19.6` dichiarano invece GitHub Actions come unico CI/CD e richiedono un
  deploy Shopify + Cloudflare coordinato. Nel readback fresco il Worker
  `d497179` risulta pubblicato da Wrangler prima del run GitHub, che ha gestito
  soltanto Shopify.
- **Impatto:** il workflow può attivare Function, webhook e configurazione di un
  commit mentre il backend resta a una revisione diversa. L’ordine manuale
  osservato ha prodotto uno snapshot coerente, ma non è un’invariante della
  pipeline e non è riutilizzabile in sicurezza per Production.
- **Correzione proporzionata:** estendere il workflow esistente perché applichi
  le sole migrazioni pendenti, distribuisca il Worker dallo stesso checkout e
  ne verifichi versione/commit prima di `shopify app deploy`. Non serve un
  secondo sistema di rilascio.
- **Esito:** il workflow rifiuta prima delle scritture uno stato Worker/Shopify
  disallineato, registra il rollback coordinato, applica le migrazioni,
  distribuisce e rilegge il Worker del `GITHUB_SHA`, esegue lo smoke e solo dopo
  pubblica Shopify. Se il job termina con errore, timeout o annullamento dopo lo
  snapshot iniziale, un job indipendente ripristina soltanto i provider che si
  sono discostati: prima la versione Shopify precedente, poi il Worker salvato,
  verificando di nuovo che entrambi corrispondano allo stesso commit.

#### F-M3-52-02 — il preflight non lega i valori alle chiavi verificate

- **Classe/priorità/stato:** bug di verifica del target, P2, chiuso.
- **Evidenza:** `scripts/preflight-dev.mjs:4-18` scorre i valori attesi e
  considera valido ciascuno se compare in uno qualunque fra
  `shopify.app.dev.toml` e `wrangler.json`. Non controlla né il nome della
  chiave né il file proprietario. In particolare `cf-ready-dev` compare già
  nell’URL `https://cf-ready-dev.tmsf.workers.dev`: il campo `name` di Wrangler
  può quindi puntare a un altro Worker e il controllo passa comunque. Il
  readback successivo verifica D1 e identità Shopify, non il Worker remoto.
- **Impatto:** il comando che dichiara «target Development verificato» può
  precedere un deploy verso un Worker diverso da quello atteso; il problema è
  indipendente dal workflow incompleto F-M3-52-01.
- **Correzione proporzionata:** verificare nel file corretto le coppie esplicite
  `client_id`, `application_url`, `name`, `database_name` e `database_id`, con
  confronti mirati sul formato già presente. Basta una fixture negativa in cui
  il nome Worker cambia; non serve introdurre un parser o una dipendenza.
- **Esito:** il preflight confronta ogni valore con la chiave e il file
  proprietario, mantenuto come JSON rigoroso; una regressione sul nome Worker è
  coperta da un test Node.

Gli URL `example.com` nella configurazione Production restano invece
intenzionalmente non distribuibili nello stato corrente e sono un gate di
M7/M9, non una compatibilità legacy da mantenere.

### [PR #53 — record Development 0.1.0 deploy](https://github.com/max23468/CF-Ready/pull/53)

**Stato:** merged, `bda2a21`; 4 file, `+46/-18`; review Codex non eseguita.
Registra Worker, snapshot Shopify e smoke M3.

**Finding:** nessun finding aperto. La PR separava correttamente evidenza
osservata e limiti ancora dipendenti da Shopify.

### [PR #54 — harden Development observability](https://github.com/max23468/CF-Ready/pull/54)

**Stato:** merged, `69ea6c7`; 3 file, `+60/-1`; review Codex non eseguita.
Abilita metriche/log Worker ma disattiva invocation log e trace automatici.

**Finding:** nessun finding aperto. La configurazione corrente conserva il
confine dichiarato: log abilitati, `invocation_logs: false`, trace disattivate.

### [PR #55 — close checkout rendering investigation](https://github.com/max23468/CF-Ready/pull/55)

**Stato:** merged, `562eca3`; 4 file, `+29/-385`; review Codex non eseguita.
Consolida l’indagine e rimuove il piano temporaneo.

**Finding:** nessun finding aperto attribuibile alla PR. Il rischio wallet non
fu nascosto: resta il finding noto F-M3-57-01.

### [PR #56 — close M3 audit](https://github.com/max23468/CF-Ready/pull/56)

**Stato:** merged, `e2d7f6d`; 2 file, `+41/-1`; review Codex non eseguita.
Registra misura Function e readback di una sola Validation.

**Finding:** nessun finding aperto. Le misure sono ricevute storiche e non sono
state reinterpretate come stato live corrente.

### [PR #57 — record Shopify validation target answer](https://github.com/max23468/CF-Ready/pull/57)

**Stato:** merged, `a87bc0e`; 2 file, `+79/-19`; review Codex non eseguita.
Registra la risposta Shopify su target dei localized field e wallet.

#### F-M3-57-01 — checkout accelerato senza campo richiesto

- **Classe/priorità/stato:** limite di prodotto, P1 pre-`1.0.0`, aperto e già
  assegnato a M10.
- **Evidenza:** `extensions/cf-ready-validation/src/cart_validations_generate_run.ts:267`
  restituisce `allow` quando `localizedFields.length === 0`. Le evidenze
  `docs/evidence/2026-07-29-checkout-validation-rendering.md` spiegano che nei
  flussi express l’array può essere vuoto prima che destinazione/origine siano
  risolte.
- **Impatto:** un merchant che configura il Codice Fiscale come obbligatorio può
  ricevere un ordine accelerato senza quel dato. È fail-open voluto dal motore,
  ma limita materialmente la promessa commerciale.
- **Correzione proporzionata:** nessun fallback o nuova estensione ora. Prima
  della 1.0 va eseguita la matrice M10 e adottata soltanto la regola sostitutiva
  già descritta nel Master Plan se Shopify ne conferma la premessa.

---

## 4. Milestone M4 — Dati, autenticazione e lifecycle

### [PR #58 — dati, auth e lifecycle M4](https://github.com/max23468/CF-Ready/pull/58)

**Stato:** merged, `693d6c8`; 24 file, `+923/-107`; review Codex non eseguita.
È la PR strutturale di M4: sessioni cifrate, tabelle D1, webhook, eventi,
lifecycle e riconciliazione.

#### F-M4-58-01 — webhook abbandonato nello stato `processing`

- **Classe/priorità/stato:** bug di affidabilità e idempotenza, P1, chiuso.
- **Evidenza:** `app/webhooks.server.ts:32-54` riacquisisce soltanto righe con
  `status = 'failed'`. `handleWebhook` imposta `processed` solo dopo il gestore
  (`:14-29`). Un crash, timeout o errore nel `finishWebhook` lascia la riga
  `processing`; ogni retry trova il webhook già presente, ritorna `200` e non
  esegue più il gestore. I webhook billing e shop update attendono inoltre la
  riconciliazione Shopify completa prima della risposta, quindi un timeout è un
  caso realistico, non solo teorico. Il test `tests/lifecycle.test.ts:171-181`
  copre duplicato, `failed` e `processed`, non un `processing` abbandonato.
- **Impatto:** una disinstallazione, un `shop/redact`, un cambio scope/store o un
  evento billing può essere perso in modo permanente. Il `200` sui retry
  impedisce a Shopify di proseguire il recupero.
- **Correzione proporzionata:** riacquisire anche un `processing` più vecchio di
  una soglia usando `received_at`, con un singolo test su claim scaduto. Non
  serve una coda o una nuova infrastruttura.
- **Esito:** il claim comune riacquisisce una ricevuta `processing` dopo cinque
  minuti, mantiene vivo il proprietario durante l'handler e lega l'esito a un
  token. `APP_UNINSTALLED` conserva inoltre il ciclo originale e applica stato,
  pulizia sessioni ed evento in un solo batch; una normale scrittura di sessione
  non viene scambiata per una reinstallazione e gli stati geografici o sospesi
  possono comunque passare a `uninstalled`. Gli altri eventi sono deduplicati
  per ID webhook e `shop_redacted` è atomico con la cancellazione. I claim
  `APP_UNINSTALLED` precedenti a `0008` senza ciclo non vengono attribuiti alla
  reinstallazione corrente; un `shop/redact` precedente a `0008` già arrivato alla
  cancellazione anonimizza comunque al retry tutte le ricevute dello stesso
  dominio.

#### F-M4-58-02 — rollback documentato mutando migrazioni applicate

- **Classe/priorità/stato:** documentazione operativa, P3, chiuso; ricorre
  anche nelle ricevute introdotte da #70 e #99.
- **Evidenza:** `docs/evidence/2026-07-30-m4-development-migration.md:36-41`
  propone `DROP TABLE` e cancellazione della riga in `d1_migrations`;
  `2026-07-30-m5-development-release.md:19-20` ripete la stessa procedura e
  `2026-07-31-m6-ui-completa.md:55-59` propone `DROP COLUMN` più rimozione della
  cronologia. Il Master Plan `§26.3` e le regole del repository dichiarano
  invece immutabili le migrazioni applicate e preferiscono forward-fix.
- **Impatto:** una ricevuta storica letta come runbook corrente può far
  riscrivere la cronologia D1 e lasciare Worker, schema e migration runner in
  disaccordo. Al momento dei singoli deploy Development i documenti dichiarano
  correttamente che non c’erano dati da perdere, ma la procedura non è più
  sicura come indicazione operativa generale.
- **Correzione proporzionata:** marcare quei comandi come opzioni storiche
  valide soltanto prima dell’uso dei dati e indicare, per lo stato corrente,
  rollback Worker + forward-fix dello schema; Time Travel resta riservato a
  perdita o corruzione. Non va aggiunta una migrazione di compatibilità.
- **Esito:** le tre ricevute mantengono il contesto storico, ma indicano per lo
  stato corrente rollback Worker, migrazione forward-fix e Time Travel solo per
  perdita o corruzione.

#### F-M4-58-03 — manca il test di upgrade dalla versione precedente

- **Classe/priorità/stato:** gap di verifica migrazioni, P3, chiuso; la
  migrazione più recente è la `0008` introdotta dalla correzione di
  F-M4-58-01.
- **Evidenza:** `tests/apply-migrations.ts:1-6` riceve da
  `vitest.config.ts:10-16` l’intero elenco e lo applica sempre a un database
  vuoto prima dei test. Non esiste una prova che applichi prima `0001`–`0006`,
  inserisca dati rappresentativi e poi aggiorni con `0007`. Il Master Plan
  `§12.3` richiede esplicitamente sia database vuoto sia snapshot della versione
  precedente e `§23.1` assegna copertura esplicita completa alle migrazioni.
- **Impatto:** il gate verde prova sintassi e installazione pulita, ma non
  rileverebbe una migrazione che fallisce su righe esistenti o altera default e
  dati della versione precedente. Il readback remoto conferma che `0007` è già
  applicata; il workflow Development `30707318436` ha poi applicato `0008` e
  confermato zero migrazioni pendenti. Il finding riguardava la copertura
  preventiva, non una perdita dati osservata.
- **Correzione proporzionata:** aggiungere un solo test che applica
  `0001`–`0006`, inserisce righe rappresentative, verifica l’upgrade `0007` e
  poi `0008`, incluse colonne e unicità degli eventi webhook. Nessun framework
  di snapshot o percorso legacy.
- **Esito:** un database isolato applica `0001`–`0006`, riceve righe
  rappresentative, applica prima `0007` e poi `0008`, conserva i dati, verifica
  i nuovi default e prova l'unicità degli eventi per webhook.

Il resto della PR ha controlli coerenti: AES-GCM con AAD, payload di sessione
validato, HMAC delegato all’autenticatore Shopify, eventi con allowlist e fail-open
della riconciliazione.

### [PR #59 — nome univoco snapshot Development](https://github.com/max23468/CF-Ready/pull/59)

**Stato:** merged, `ff878ab`; 1 file, `+3/-1`; review Codex non eseguita.
Corresse la collisione dello snapshot `0.1.0`.

**Finding:** nessun finding aperto. La soluzione SHA fu poi sostituita
intenzionalmente da #61 con SemVer esatto e fallimento su versione riusata.

### [PR #60 — record M4 Development deploy](https://github.com/max23468/CF-Ready/pull/60)

**Stato:** merged, `66125b4`; 3 file, `+65/-14`; review Codex non eseguita.

**Finding:** nessun finding aperto. È una ricevuta storica; il successivo
rilascio fisso `0.2.0` è registrato da #62.

### [PR #61 — release 0.2.0](https://github.com/max23468/CF-Ready/pull/61)

**Stato:** merged, `a7587d2`; 5 file, `+51/-14`; review Codex non eseguita.
Introduce il nome versione esatto nel workflow manuale.

**Finding:** nessun finding aperto. Il workflow corrente è `workflow_dispatch`,
verifica `develop`, esegue il gate e fallisce se la versione è già pubblicata.

### [PR #62 — record 0.2.0 Development release](https://github.com/max23468/CF-Ready/pull/62)

**Stato:** merged, `102cb2e`; 1 file, `+17/-6`; review Codex non eseguita.

**Finding:** nessun finding aperto; ricevuta coerente con la cronologia M4.

### [PR #63 — contratti tecnici M4 e changelog](https://github.com/max23468/CF-Ready/pull/63)

**Stato:** merged, `e365d94`; 4 file, `+188/-1`; review Codex non eseguita.

**Finding:** nessun finding autonomo. Il contratto webhook eredita però la
lacuna F-M4-58-01: «retry dopo errore» non copre l’elaborazione interrotta prima
di marcare `failed`.

### [PR #64 — shop/redact solo se disinstallato](https://github.com/max23468/CF-Ready/pull/64)

**Stato:** merged, `2444693`; 8 file, `+229/-34`; review Codex non eseguita.
Corregge la cancellazione di dati di uno store reinstallato.

#### F-M4-64-01 — il commento promette un registro M5 che non deve esistere

- **Classe/priorità/stato:** documentazione nel codice, P3, chiuso dopo #82.
- **Evidenza:** `app/shop.server.ts:97-98`, nel percorso `shop/redact`, afferma
  ancora che «il diritto una tantum entrerà nel registro con il blocco billing
  di M5». M5 è completata, ma non ha introdotto quel registro: per decisione
  corrente Shopify resta autorevole e D1 conserva solo il conto operativo; il
  ledger persistente serve esclusivamente a impedire una seconda prova.
- **Impatto:** il commento nel punto più delicato della cancellazione dati invita
  un futuro intervento a creare una seconda verità commerciale, in contrasto
  con l’architettura conclusa da #82. Il bug di reinstallazione della PR è
  invece corretto e non è conteggiato come finding.
- **Correzione proporzionata:** sostituire le due righe con una frase che separi
  trial ledger e acquisto una tantum autorevole in Shopify. Nessun nuovo
  registro, schema o comportamento legacy.
- **Esito:** il commento limita il ledger alla prova fruita e mantiene Shopify
  autorevole per l'acquisto una tantum.

### [PR #65 — release 0.2.1](https://github.com/max23468/CF-Ready/pull/65)

**Stato:** merged, `716ba2a`; 3 file, `+15/-3`; review Codex non eseguita.

**Finding:** nessun finding tecnico. La separazione fra fix e bump fu una scelta
di processo poi superata dalla regola della PR unica in #73.

### [PR #66 — chiusura M4](https://github.com/max23468/CF-Ready/pull/66)

**Stato:** merged, `7d925e7`; 2 file, `+35/-5`; review Codex non eseguita.

**Finding:** la chiusura è supportata dalle prove registrate, salvo la copertura
incompleta dei crash webhook descritta in F-M4-58-01. L’intestazione del Master
Plan aggiornata qui è poi rimasta ferma a M4 fino al successivo riallineamento
documentale; non è più un finding corrente.

---

## 5. Milestone M5 — Prova, billing ed entitlement

### [PR #67 — billing M5](https://github.com/max23468/CF-Ready/pull/67)

**Stato:** merged, `cba8c85`; 22 file, `+1810/-24`; review Codex non eseguita.
Implementa prova, sottoscrizioni, una tantum, ledger, conto normalizzato,
entitlement e webhook billing.

#### F-M5-67-01 — conto aggiornato senza evento billing

- **Classe/priorità/stato:** bug di integrità dati, P2, aperto.
- **Evidenza:** `app/billing.server.ts:496-526` esegue l’upsert di
  `billing_accounts`; solo dopo, `:528-541`, inserisce `billing_events`. Se il
  secondo comando fallisce, `reconcile` cattura l’errore, ma al retry il conto è
  già uguale a Shopify, `changed` è falso e l’evento non viene più tentato.
- **Impatto:** cronologia economica incompleta e readback operativo non
  ricostruibile, pur con entitlement corretto.
- **Correzione proporzionata:** eseguire upsert ed eventuale insert evento nello
  stesso `db.batch`, già disponibile e transazionale in D1; aggiungere un test
  che simuli il fallimento dell’evento o verifichi l’atomicità.

#### F-M5-67-02 — importo errato durante la conversione a una tantum

- **Classe/priorità/stato:** bug di integrità dati, P2, aperto; rilevante anche
  per la review di #81.
- **Evidenza:** `nextAccount` sceglie correttamente `one_time` quando acquisto e
  sottoscrizione coesistono (`app/billing.server.ts:558-565`), ma l’evento usa
  prima `billing.subscription?.amount` e valuta (`:537-538`). È esattamente lo
  stato transitorio della conversione osservato nei gate M5.
- **Impatto:** la riga associata al GID dell’acquisto una tantum può contenere
  prezzo/valuta della sottoscrizione; report e audit economico risultano falsi.
- **Correzione proporzionata:** scegliere importo e valuta dalla risorsa indicata
  da `next.plan_kind`/`next.shopify_charge_gid`, con un test sullo stato misto.

#### F-M5-67-03 — hash descritto come non reversibile

- **Classe/priorità/stato:** documentazione/compliance, P3, aperto.
- **Evidenza:** `app/billing.server.ts:642-643` chiama «non reversibile» lo
  SHA-256 del dominio. Il Master Plan lo descrive più correttamente come
  pseudonimizzazione soggetta a revisione legale (`§12.2`, `§21.6`). Un dominio
  Shopify appartiene a uno spazio enumerabile e spesso pubblico: l’hash non è
  cifratura né anonimizzazione.
- **Impatto:** commento tecnico e possibili testi privacy possono sovrastimare la
  protezione effettiva.
- **Correzione proporzionata:** correggere la formulazione in «identificatore
  pseudonimizzato non conservato in chiaro». Nessun nuovo servizio o schema è
  necessario salvo diversa decisione della revisione legale.

#### F-M5-67-04 — avvio prova registrato due volte sotto concorrenza

- **Classe/priorità/stato:** bug di concorrenza e accuratezza eventi, P3,
  aperto.
- **Evidenza:** due chiamate contemporanee a `syncTrial` possono entrambe
  leggere `trial = null` (`app/billing.server.ts:110-113`). L’`INSERT` usa
  correttamente `ON CONFLICT DO NOTHING` (`:121-140`), ma entrambe rileggono poi
  la stessa prova attiva e registrano `trial_started` (`:142-150`). Il test
  `tests/billing.test.ts:68-103` verifica solo chiamate seriali, mentre il
  contratto M5 dichiara l’evento «una volta per store».
- **Impatto:** prova ed entitlement restano unici, ma audit operativo e metriche
  possono contare due avvii per lo stesso negozio proprio durante primi accessi
  paralleli.
- **Correzione proporzionata:** usare `RETURNING shop_id` sull’`INSERT` già
  presente e registrare l’evento soltanto nel chiamante che ha creato la riga;
  un solo test con due `syncTrial` concorrenti. Non serve aggiungere una lock.

### [PR #68 — release 0.3.0](https://github.com/max23468/CF-Ready/pull/68)

**Stato:** merged, `1caabc5`; 3 file, `+21/-3`; unica review Codex reale in M5.
Il thread è ancora non risolto:
[discussion_r3684506411](https://github.com/max23468/CF-Ready/pull/68#discussion_r3684506411).

**Finding:** il commento Codex era corretto al momento della PR: il changelog
dichiarava M5 rilasciata prima del deploy e il Master Plan era ancora fermo a
M4. #70 e #82 hanno aggiunto ricevuta e chiusura; il successivo riallineamento
documentale ha aggiornato anche l’intestazione canonica a M6/`0.4.21`. Non resta
un finding corrente, anche se il thread storico è ancora formalmente aperto su
GitHub.

### [PR #69 — record 0.3.0 Development release](https://github.com/max23468/CF-Ready/pull/69)

**Stato:** chiusa senza merge; 4 file, `+99/-21`; review Codex non eseguita.

**Finding:** nessun codice di #69 è entrato direttamente in `develop`. La PR
conteneva ricevuta e prime correzioni Home ma fu chiusa dopo la cancellazione
prematura del branch; #70 ne ha incorporato il contenuto. Il rischio di perdita
di tracciabilità è stato risolto dalla regola della PR unica di #73.

### [PR #70 — nessun addebito sopra un pagamento unico](https://github.com/max23468/CF-Ready/pull/70)

**Stato:** merged, `fde7452`; 5 file, `+115/-29`; review Codex non eseguita.

**Finding:** il bug storico è corretto: qualunque nuovo addebito è rifiutato se
esiste un acquisto una tantum. La ricevuta aggiunta dalla PR ereditava una
procedura di rollback non più valida, ora storicizzata dalla chiusura di
F-M4-58-02.

### [PR #71 — avviso sul campo Interno](https://github.com/max23468/CF-Ready/pull/71)

**Stato:** merged, `a9b5738`; 1 file, `+42/-3`; review Codex non eseguita.

**Finding:** nessun finding. La decisione evita scope e dati protetti e usa una
dichiarazione esplicita; i problemi di ordine delle scritture arrivano con
l’implementazione M6, non con questa PR documentale.

### [PR #72 — promotion guard separata](https://github.com/max23468/CF-Ready/pull/72)

**Stato:** merged, `497dad0`; 3 file, `+38/-8`; review Codex non eseguita.

**Finding:** nessun finding aperto. Readback fresco: `promotion-guard` è un
required check di `main`; `main` richiede base aggiornata, `develop` no, in
coerenza con §19.6; entrambi impediscono bypass admin e richiedono le
conversazioni risolte.

### [PR #73 — regola della PR unica](https://github.com/max23468/CF-Ready/pull/73)

**Stato:** merged, `8444076`; 3 file, `+11/-5`; review Codex non eseguita.

**Finding:** nessun finding. La regola è coerente fra template, AGENTS e Master
Plan; non impone PR di compatibilità o ricevute isolate.

### [PR #74 — Billing API e uscita dall’iframe](https://github.com/max23468/CF-Ready/pull/74)

**Stato:** merged, `55eda8c`; 8 file, `+240/-57`; review Codex non eseguita.

#### F-M5-74-01 — errori Shopify di trasporto fuori dal contratto tipizzato

- **Classe/priorità/stato:** bug di gestione errori e UX, P2, aperto; il ramo
  Validation introdotto da #83 ha lo stesso difetto.
- **Evidenza:** `app/billing.server.ts:334-403` e `:434-452` convertono errori
  GraphQL presenti nel body nei codici stabili `charge_failed` e
  `cancel_failed`, ma non intercettano un rifiuto di `admin.graphql()` o un body
  non JSON. `app/validation.server.ts:325-427` ha solo `try/finally`: gli stessi
  errori di `queryContext`, mutation o readback sfuggono a
  `validation_write_failed`. Anche le letture Shopify preliminari nelle action
  Home, Regole, Messaggi e onboarding non hanno un catch: la Error Boundary
  sostituisce quindi il feedback contestuale. I test coprono `userErrors`, non
  Promise rifiutate o risposta illeggibile.
- **Impatto:** un guasto temporaneo Shopify durante acquisto, cancellazione o
  salvataggio porta a una pagina di errore invece del banner bilingue e
  riprovabile già previsto; la lease viene rilasciata, ma il merchant non sa se
  l’operazione abbia avuto effetto.
- **Correzione proporzionata:** chiudere i percorsi nelle action esistenti:
  catturare trasporto/parsing del ramo billing e delle mutazioni Validation e
  restituire i codici stabili già esistenti, conservando il `finally` della
  lease. Un test con `graphql` rifiutata per billing e uno per Validation
  bastano; non serve un nuovo livello di errori.

Il bug storico `Application Error` è invece corretto: la mutation restituisce
la confirmation URL e il client esce dall’iframe. Stato ed entitlement
continuano a provenire dal readback Shopify. Resta anche F-M5-76-01 sul ritorno.

### [PR #75 — log del rifiuto di addebito](https://github.com/max23468/CF-Ready/pull/75)

**Stato:** merged, `63311b8`; 4 file, `+19/-3`; review Codex non eseguita.

**Finding:** nessun finding aperto. Il log limita a tre i messaggi Shopify e non
aggiunge shop, payload, CF o PEC. Il presupposto «nessun dato merchant» va
riconfermato se in futuro alle mutation vengono passati dati liberi del merchant.

### [PR #76 — ritorno nell’admin e guardia dev store](https://github.com/max23468/CF-Ready/pull/76)

**Stato:** merged, `483fd53`; 11 file, `+130/-11`; review Codex non eseguita.

#### F-M5-76-01 — `shop` del return URL preso dalla query

- **Classe/priorità/stato:** hardening di confine, P3, aperto.
- **Evidenza:** `app/billing.server.ts:408-414` riceve il dominio autenticato
  `shopDomain`, ma usa `incoming.get("shop") ?? shopDomain`. Un parametro query
  manipolato prevale quindi sulla sessione validata; anche `host` è inoltrato
  senza controllo.
- **Impatto:** dopo approvazione il merchant può rientrare in un contesto shop
  errato, innescando login/errore o una navigazione incoerente. L’origine resta
  `APP_URL`, quindi non è un open redirect esterno.
- **Correzione proporzionata:** usare sempre `shopDomain` per `shop`; mantenere
  `host` soltanto se necessario al rientro embedded e coerente col contesto.

La guardia `ALLOWED_SHOP` Development è invece corretta e cancella sessione e
store creati prima di rifiutare l’installazione.

### [PR #77 — score React Doctor](https://github.com/max23468/CF-Ready/pull/77)

**Stato:** merged, `1ecd748`; 2 file, `+1/-2`; review Codex non eseguita.

**Finding:** nessun finding. Score/share sono una decisione esplicita; il gate
locale resta bloccante su warning e il controllo supply-chain esterno è spento.

### [PR #78 — non riproporre il piano attivo](https://github.com/max23468/CF-Ready/pull/78)

**Stato:** chiusa senza merge; 2 file, `+1/-2`; review Codex non eseguita.

**Finding:** il diff finale non conteneva la correzione descritta, ma soltanto la
modifica React Doctor di #77: il branch era stato sovrascritto da una sessione
concorrente. La PR è stata correttamente chiusa e sostituita da #79; nessun suo
codice è nel ramo corrente.

### [PR #79 — piano attivo e rivalidazione in uscita](https://github.com/max23468/CF-Ready/pull/79)

**Stato:** merged, `cf53ec3`; 6 file, `+45/-29`; review Codex non eseguita.

#### F-M5-79-01 — il server accetta ancora il piano ricorrente già attivo

- **Classe/priorità/stato:** bug di validazione al confine billing, P2, aperto;
  la PR ha corretto soltanto la presentazione client.
- **Evidenza:** Home nasconde il bottone mensile o annuale corrente in
  `app/routes/app._index.tsx:464-489`. L’action accetta però direttamente gli
  intent `monthly` e `annual` (`:88-96`) e `subscribe` usa `readBilling` solo
  per bloccare un acquisto una tantum già attivo (`:127-161`): non confronta
  l’intervallo della sottoscrizione con il piano richiesto. Una richiesta
  autenticata manipolata, o una scheda diventata stale dopo uno switch in
  parallelo, può quindi arrivare a `appSubscriptionCreate` con lo stesso piano.
- **Impatto:** il merchant riceve una seconda approvazione Shopify per una
  sostituzione priva di beneficio e può confermare un’operazione commerciale
  ridondante. La sola assenza del bottone non è una validazione server-side.
- **Correzione proporzionata:** conservare il risultato di `readBilling` già
  eseguito e rifiutare `monthly` con `EVERY_30_DAYS` e `annual` con `ANNUAL`,
  prima di creare l’addebito; un test di action verifica che la mutation non
  parta. Nessun nuovo stato billing.

Il secondo difetto affrontato dalla PR, la rivalidazione durante l’uscita, è
corretto anche sulla rotta padre e non è conteggiato come finding.

### [PR #80 — webhook acquisti una tantum](https://github.com/max23468/CF-Ready/pull/80)

**Stato:** merged, `7ae5096`; 9 file, `+16/-11`; review Codex non eseguita.

**Finding:** topic e route sono coerenti e rileggono Shopify invece di fidarsi
del payload. La consegna usa però il processore comune affetto da F-M4-58-01.

### [PR #81 — serializzazione conversione](https://github.com/max23468/CF-Ready/pull/81)

**Stato:** merged, `4522752`; 6 file, `+89/-31`; review Codex non eseguita.

**Finding:** la doppia conversione e l’avviso da contesa sono corretti con la
lease comune. La PR non corregge l’importo dell’evento nello stesso stato misto:
vedere F-M5-67-02.

### [PR #82 — chiusura M5](https://github.com/max23468/CF-Ready/pull/82)

**Stato:** merged, `012deae`; 2 file, `+124/-18`; review Codex non eseguita.

**Finding:** gate live e residui M10 sono dichiarati. Nessun nuovo finding, ma
la chiusura non copre i due difetti di integrità eventi scoperti in questo audit
(F-M5-67-01/02). L’intestazione del Master Plan, inizialmente rimasta indietro,
è stata riallineata dal follow-up documentale.

---

## 6. Milestone M6 — UI, onboarding e messaggi

### [PR #83 — interfaccia bilingue, Home e Regole checkout](https://github.com/max23468/CF-Ready/pull/83)

**Stato:** merged, `ae19f1a`; 21 file, `+1586/-291`; review Codex non eseguita.
Introduce il percorso unico di scrittura config, editor Regole, i18n e colonne
onboarding.

#### F-M6-83-01 — readback parziale della configurazione

- **Classe/priorità/stato:** bug di verifica, P2, aperto; coinvolge anche i
  messaggi introdotti da #90.
- **Evidenza:** `app/validation.server.ts:404-413` confronta `enabled`,
  `blockOnFailure`, due regole ed `errorDisplay`, ma non gli otto messaggi,
  `schemaVersion`, `enabled` dentro il metafield o `entitlement`. La Function in
  `extensions/.../cart_validations_generate_run.ts:115-157` richiede invece
  l’intera forma valida e fa fail-open se una parte manca.
- **Impatto:** una risposta Shopify malformata o una scrittura incompleta può
  essere dichiarata riuscita mentre messaggi custom o diritto sono persi; il
  checkout può mostrare default errati o non validare.
- **Correzione proporzionata:** confrontare la configurazione canonica completa
  già scritta, riusando `configHash`/JSON canonico esistente, con un test che
  altera un messaggio e uno che altera entitlement.

#### F-M6-83-02 — dichiarazione D1 salvata prima del metafield

- **Classe/priorità/stato:** bug di consistenza, P2, aperto.
- **Evidenza:** `app/routes/app.rules.tsx:51-52` salva
  `address2_conflict_declared_at`; solo dopo, `:56-65`, prova il write Shopify.
  `config_conflict`, lock occupata, limite Validation o errore rete lasciano
  quindi D1 modificato benché l’interfaccia segnali salvataggio fallito.
- **Impatto:** Home e Regole possono mostrare una dichiarazione che il merchant
  crede di non avere salvato, separata dalla configurazione rifiutata.
- **Correzione proporzionata:** persistere la dichiarazione dopo `result.ok`.
  Non è necessaria una transazione distribuita perché la scrittura Shopify è la
  sola che può fallire prima.

#### F-M6-83-03 — entitlement riscritto da una cache non riconciliata

- **Classe/priorità/stato:** bug di consistenza commerciale, P2, aperto;
  coinvolge ogni salvataggio Regole/Messaggi e l’onboarding di #99.
- **Evidenza:** `app/validation.server.ts:340-346` ricalcola l’entitlement con
  `syncTrial` e `readBillingAccount`, quindi soltanto dalla cache D1. Le action
  di Regole, Messaggi e onboarding interrogano la Validation, ma non
  riconciliano prima il billing. Il Master Plan `§11.2` e il contratto M5
  dichiarano Shopify autorevole e chiedono la riconciliazione prima di ogni
  mutazione rilevante; `docs/contracts/m6-technical-contracts.md:64-65`
  documenta invece l’implementazione D1 corrente e va riallineato alla fonte
  canonica.
- **Impatto:** se un webhook è perso o ritardato, un normale salvataggio può
  sovrascrivere nel metafield un diritto pagato reale con `none`, rendendo il
  checkout fail-open, oppure conservare un diritto una tantum dopo un rimborso.
  Il comportamento può durare fino alla successiva riconciliazione riuscita.
- **Correzione proporzionata:** nel writer condiviso rileggere Shopify con
  `readBilling` e sincronizzare il conto prima di calcolare l’entitlement,
  riusando il flusso esistente; se Shopify non risponde, conservare la cache
  nota come già fa `reconcile`. Un test con D1 stale e Shopify attivo/rimborsato
  verifica entrambi i versi senza duplicare logica nelle route.

#### F-M6-83-04 — login escluso dal bilinguismo comune

- **Classe/priorità/stato:** bug UX/i18n, P3, aperto.
- **Evidenza:** il contratto M6 stabilisce che `resolveLocale(request)` sia
  l’unico punto di scelta della lingua e che i due dizionari abbiano le stesse
  chiavi (`docs/contracts/m6-technical-contracts.md:11-22`). La rotta pubblica
  `app/routes/auth.login/route.tsx:23-54` non lo usa e codifica in inglese titolo,
  etichetta, bottone e due errori. Il loader root dichiara invece
  `<html lang="it">` quando la richiesta è italiana (`app/root.tsx:6-14`),
  creando anche una discrepanza fra lingua dichiarata e contenuto.
- **Impatto:** un merchant italiano che arriva senza parametro `shop`, oppure
  riceve un errore di dominio, incontra l’unica schermata non localizzata del
  percorso applicativo; tecnologie assistive ricevono inoltre una lingua del
  documento non coerente col testo mostrato.
- **Correzione proporzionata:** aggiungere i pochi testi auth ai dizionari
  esistenti e restituire la locale da loader/action con `resolveLocale`; nessuna
  libreria i18n o componente nuovo.

#### F-M6-83-05 — attivazione consentita senza diritto valido

- **Classe/priorità/stato:** bug di validazione e stato prodotto, P2, aperto;
  coinvolge anche l’onboarding di #99.
- **Evidenza:** il Master Plan `§11.3` richiede di verificare prova o licenza
  valida prima di attivare. `writeValidation` calcola l’entitlement in
  `app/validation.server.ts:340-354`, ma non rifiuta `enable = true` quando il
  risultato è `none`. Home mostra comunque «Attiva nel checkout» quando la
  Validation è spenta, anche se `entitled` è falso
  (`app/routes/app._index.tsx:221-237,310-317`); il riepilogo onboarding espone
  a sua volta l’azione senza leggere il diritto
  (`app/routes/app.onboarding.tsx:335-344`).
- **Impatto:** un flusso normale dopo la scadenza può salvare su Shopify una
  Validation `enabled` che la Function rende fail-open per assenza di diritto.
  La UI mostra quindi uno stato operativamente attivo ma inefficace e il gesto
  scavalca la sequenza di attivazione prevista da `§11.3`. Resta distinto il
  caso voluto da FR-076: una Validation già attiva può rimanere tale durante la
  scadenza e tornare efficace dopo il pagamento.
- **Correzione proporzionata:** nel writer condiviso rifiutare la transizione
  `false → true` se l’entitlement fresco è `none`, con un error code bilingue,
  e nascondere o disabilitare le due azioni finché manca il diritto. Un test
  server è la salvaguardia necessaria; nessun nuovo stato o flusso commerciale.

I difetti DOM dichiarati nella PR sono stati effettivamente trovati e corretti
nelle patch #84–#89; non sono riaperti qui.

### [PR #84 — correzioni live Home e Regole](https://github.com/max23468/CF-Ready/pull/84)

**Stato:** merged, `4c38091`; 7 file, `+123/-88`; review Codex non eseguita.

**Finding:** conferma disattivazione, spacing, Save Bar e istruzioni furono
corretti. La prima diagnosi del Save Bar si rivelò incompleta ed è stata chiusa
alla radice da #86; nessun residuo corrente specifico.

### [PR #85 — risposta Shopify wallet e intent signal](https://github.com/max23468/CF-Ready/pull/85)

**Stato:** merged, `e7541e0`; 2 file, `+113/-15`; review Codex non eseguita.

**Finding:** nessun nuovo difetto; la PR rende più precisa la causa del limite
wallet e rimanda correttamente la decisione alla prova M10. Vedere
F-M3-57-01.

### [PR #86 — gerarchia, Save Bar e bilinguismo Piano](https://github.com/max23468/CF-Ready/pull/86)

**Stato:** merged, `5bd3302`; 12 file, `+492/-229`; review Codex non eseguita.

#### F-M6-86-01 — conferma di salvataggio falsa o ormai superata

- **Classe/priorità/stato:** bug UX/feedback, P2, aperto; il testo nasce in #83,
  il dirty state corrente in #86 e la seconda occorrenza in #90.
- **Evidenza:** `app/i18n.ts:24-27` e `:335-338` definisce un unico messaggio
  «Regole salvate. Valgono dal prossimo ordine». Regole e Messaggi lo mostrano
  rispettivamente in `app/routes/app.rules.tsx:149` e
  `app/routes/app.messages.tsx:142`. In Messaggi il soggetto è quindi sbagliato;
  se la Validation è disattivata o il diritto è scaduto, la promessa sul
  prossimo ordine è falsa. Inoltre entrambi i banner dipendono solo dall’ultimo
  `actionData`: dopo una nuova modifica restano visibili insieme alla Save Bar
  e dichiarano salvato uno stato ancora dirty.
- **Impatto:** il feedback di successo contraddice sia la pagina sia lo stato
  corrente e può indurre il merchant a credere che testi/regole non ancora
  salvati siano già effettivi nel checkout.
- **Correzione proporzionata:** usare due stringhe neutre, «Regole salvate» e
  «Messaggi salvati», già nel rispettivo namespace i18n, e mostrare il banner
  solo con `result.ok && !dirty`. Non serve un sistema toast o altro stato.

Gli altri bug storici risultano corretti: dirty state calcolato esplicitamente,
home link App Bridge, valuta/date localizzate.

### [PR #87 — feedback navigazione e gerarchia Home](https://github.com/max23468/CF-Ready/pull/87)

**Stato:** merged, `62bb764`; 8 file, `+136/-95`; review Codex non eseguita.

#### F-M6-87-01 — azioni fetcher senza avanzamento visibile

- **Classe/priorità/stato:** miglioramento UX, P3, aperto; riguarda anche
  onboarding #99.
- **Evidenza:** `app/routes/app.tsx:30-38` attiva l’indicatore App Bridge solo
  per `useNavigation`. Home e onboarding inviano invece le azioni con
  `useFetcher` (`app._index.tsx:182-185`, `app.onboarding.tsx:131-150`): durante
  la richiesta impostano soltanto `disabled`, senza `loading` e senza indicare
  quale operazione sia in corso. La documentazione Polaris di `s-button`
  prevede `loading` proprio per prevenire invii ripetuti e rassicurare sullo
  stato dell’azione.
- **Impatto:** su billing, attivazione o chiusura onboarding una latenza normale
  appare come un controllo semplicemente disabilitato; il merchant non riceve
  conferma immediata che il clic sia stato acquisito.
- **Correzione proporzionata:** derivare l’intent pendente da
  `fetcher.formData` già disponibile e impostare `loading` sul solo pulsante che
  lo ha avviato, mantenendo `disabled` sugli altri. Non serve un loader globale
  né uno store aggiuntivo.

La riconciliazione sincrona della Home resta invece una decisione `§11.6` per
non presentare stato commerciale stale, non un difetto di performance
dimostrato.

### [PR #88 — azioni Home e prossimo passo](https://github.com/max23468/CF-Ready/pull/88)

**Stato:** merged, `bc1765d`; 4 file, `+87/-73`; review Codex non eseguita.

**Finding:** il mancato rendering di `s-button-group` è corretto usando il
contenitore Polaris già funzionante. Nessun residuo corrente.

### [PR #89 — modalità vicine alle etichette](https://github.com/max23468/CF-Ready/pull/89)

**Stato:** merged, `8613e32`; 5 file, `+110/-107`; review Codex non eseguita.

**Finding:** nessun finding aperto; rimuove il livello di layout che produceva
spaziatura divergente.

### [PR #90 — pagina Messaggi al cliente](https://github.com/max23468/CF-Ready/pull/90)

**Stato:** merged, `efcae31`; 11 file, `+601/-311`; review Codex non eseguita.

#### F-M6-90-01 — Home descrive come attivo un checkout non attivo

- **Classe/priorità/stato:** bug UX/contenuto, P2, aperto.
- **Evidenza:** `app/routes/app._index.tsx:228` calcola correttamente lo stato
  `active`, `disabled` o `lapsed` e `:275-279` lo usa nel titolo; il paragrafo
  subito sotto chiama però `summariseCheckout` con `status: "active"` hardcoded
  (`:281-284`) e prende soltanto la prima frase. Le stringhe e l’helper
  `app/i18n.ts:703-716` sanno già esprimere `disabled` e `lapsed`, ma questo
  ramo non le usa. I test coprono l’helper isolato, non la composizione Home.
- **Impatto:** per esempio, con Codice Fiscale obbligatorio e Validation
  disattivata la Home mostra il titolo «Validation disattivata» e subito dopo
  afferma che il cliente non può completare l’ordine senza il campo. Lo stesso
  accade quando il diritto è scaduto e il checkout è fail-open.
- **Correzione proporzionata:** quando `status !== "active"` mostrare la frase
  di stato già esistente; soltanto nello stato attivo usare il riepilogo delle
  regole. Aggiungere un test mirato della frase scelta dalla Home, senza nuovi
  componenti o copy.

Validazione trust-boundary, trim, limite, parità lingue e conflitto sono
coperti. Il salvataggio usa però anche il readback incompleto F-M6-83-01,
l’entitlement non riconciliato F-M6-83-03 e il feedback comune F-M6-86-01.

### [PR #91 — rifiniture Messaggi](https://github.com/max23468/CF-Ready/pull/91)

**Stato:** merged, `1ac8722`; 7 file, `+91/-20`; review Codex non eseguita.

**Finding:** nessun finding aperto. `rowsFor` è marcata correttamente come stima
UI con limite esplicito; non giustifica una dipendenza o un componente custom.

### [PR #92 — Piano e fatturazione](https://github.com/max23468/CF-Ready/pull/92)

**Stato:** merged, `e429594`; 12 file, `+384/-178`; review Codex non eseguita.

**Finding:** nessun finding aperto specifico. Soglie trial, data addebito,
cancellazione e modalità sono testate; gli stati non riproducibili sul dev store
restano dichiarati per M10.

### [PR #93 — costo netto, doppia cancellazione e chiavi morte](https://github.com/max23468/CF-Ready/pull/93)

**Stato:** merged, `0fc7f1d`; 6 file, `+72/-25`; review Codex non eseguita.

**Finding:** i tre bug descritti risultano corretti. Nessun finding aperto.

### [PR #94 — Guida, FAQ e glossario](https://github.com/max23468/CF-Ready/pull/94)

**Stato:** merged, `5f780e6`; 9 file, `+366/-3`; review Codex non eseguita.

**Finding:** nessun finding aperto. Il contatto assistenza ancora provvisorio è
esplicitamente un deliverable M7, non una funzione M6 finta o incompleta.

### [PR #95 — decisione @types/node](https://github.com/max23468/CF-Ready/pull/95)

**Stato:** merged, `58d1379`; 1 file, `+4/-1`; review Codex non eseguita.

**Finding:** nessun finding. L’uso è confinato a config/build e confermato dal
typecheck; non entra nel runtime Worker.

### [PR #96 — FAQ accorpate e marchio](https://github.com/max23468/CF-Ready/pull/96)

**Stato:** merged, `8bcfc70`; 8 file, `+90/-94`; review Codex non eseguita.

**Finding:** nessun finding aperto. Le quindici FAQ preservano i temi richiesti
e usano `details` nativo, senza widget custom.

### [PR #97 — rapporto marchio e segnalini FAQ](https://github.com/max23468/CF-Ready/pull/97)

**Stato:** merged, `114586b`; 5 file, `+27/-7`; review Codex non eseguita.

**Finding:** nessun finding aperto. Il rapporto immagine e il titolo inline
risolvono i due difetti osservati senza CSS aggiuntivo.

### [PR #98 — grassetto nativo e rifiniture Guida](https://github.com/max23468/CF-Ready/pull/98)

**Stato:** merged, `c621046`; 5 file, `+29/-7`; review Codex non eseguita.

**Finding:** nessun finding aperto. `strong` è appropriato nel `summary` e non
introduce logica o accessibilità custom.

### [PR #99 — onboarding, recensioni e chiusura M6](https://github.com/max23468/CF-Ready/pull/99)

**Stato:** merged, `71e6a6c`; 19 file, `+1056/-318`; review Codex non eseguita.
Introduce onboarding, review prompt e assorbimento Piano nella Home.

#### F-M6-99-01 — enable/disable riscrivono una configurazione letta prima della lease

- **Classe/priorità/stato:** bug di concorrenza e perdita modifica, P2, aperto.
- **Evidenza:** il contratto e i commenti affermano che enable/disable non
  modificano la configurazione, ma `writeValidation` ricostruisce sempre
  l’intero metafield dai dati `next` del chiamante
  (`app/validation.server.ts:309-354`). Home legge quei dati prima della lease
  (`app/routes/app._index.tsx:101-112`); onboarding fa lo stesso
  (`app/routes/app.onboarding.tsx:60-99`). Se un editor salva nel mezzo, il
  lifecycle serializzato riscrive regole, messaggi o `errorDisplay` vecchi. Il
  test `tests/validation.test.ts:403-422` conferma solo l’assenza dell’hash, non
  che la configurazione resti quella letta dentro la lease.
- **Impatto:** attivare o disattivare da una seconda scheda può perdere in modo
  silenzioso una modifica merchant appena salvata, nonostante l’operazione
  dichiari di cambiare soltanto lo stato.
- **Correzione proporzionata:** quando `enable !== null`, derivare regole,
  messaggi ed `errorDisplay` dal metafield `existing` già letto **dentro** il
  writer e la lease, ignorando la copia pre-lock del chiamante. Il controllo
  ottimistico resta soltanto agli editor; un test cambia la config prima del
  lock e verifica che enable/disable la conservino. È una correzione nel punto
  condiviso, non un nuovo meccanismo di concorrenza.

#### F-M6-99-02 — dichiarazione salvata prima dell’attivazione

- **Classe/priorità/stato:** bug di consistenza, P2, aperto.
- **Evidenza:** `app/routes/app.onboarding.tsx:89-100` salva la dichiarazione in
  D1 prima di `writeValidation(..., true)`. Se l’attivazione fallisce, il form
  resta sul riepilogo con errore ma Home considera già cambiata la dichiarazione.
- **Impatto:** stessa incoerenza di F-M6-83-02: Home può presentare come accettata
  una dichiarazione che apparteneva a un’attivazione fallita.
- **Correzione proporzionata:** per `activate` salvare dopo `result.ok`. Per
  `finish` senza Shopify il salvataggio diretto resta corretto.

#### F-M6-99-03 — cancellazione rinnovo senza conferma

- **Classe/priorità/stato:** bug UX/salvaguardia, P2, aperto.
- **Evidenza:** `app/routes/app._index.tsx:520-533` invia immediatamente
  `submit("cancel")` al primo clic; `cancelPlan` (`:165-175`) chiama subito la
  mutation Shopify e, diversamente dalla scelta piano, non passa da una
  conferma Shopify. Il Master Plan `§15.1` richiede conferma per le azioni ad
  alto impatto. Nella stessa pagina la disattivazione Validation riusa già una
  `s-modal` con conseguenza concreta (`:376-392`), quindi il pattern manca
  soltanto alla cancellazione.
- **Impatto:** un clic involontario interrompe il rinnovo. Il merchant conserva
  il periodo pagato e può sottoscrivere di nuovo, ma l’azione commerciale ha
  effetto remoto immediato e non è un normale toggle UI.
- **Correzione proporzionata:** applicare alla cancellazione lo stesso pattern
  `s-modal` già presente, riusando `cancelBody` e un’azione esplicita
  «Annulla rinnovo». Nessun componente modale custom.

I difetti di riapertura, card annidata e composizione Home dichiarati dalla PR
furono corretti fra #100 e #106. Resta il feedback fetcher F-M6-87-01; la
procedura di rollback storica è stata corretta con F-M4-58-02.

### [PR #100 — difetti dalla rilettura completa M6](https://github.com/max23468/CF-Ready/pull/100)

**Stato:** merged, `a8c606f`; 6 file, `+43/-15`; review Codex non eseguita.

**Finding:** i tre difetti elencati sono corretti. La dichiarazione «nessuna
chiave morta» valeva allo snapshot; #107 ne ha poi rimosse altre tre dopo le
modifiche successive, senza impatto runtime.

### [PR #101 — guida di configurazione e spunte](https://github.com/max23468/CF-Ready/pull/101)

**Stato:** merged, `427ae55`; 6 file, `+158/-20`; review Codex non eseguita.

#### F-M6-101-01 — spunte ambigue e griglia non responsive nella Setup guide

- **Classe/priorità/stato:** accessibilità e responsive design, P3, aperto;
  la guida nasce in #101, l’icona corrente in #103 e la riga a colonne fisse in
  #105.
- **Evidenza:** `app/routes/app._index.tsx:613` costruisce sempre tre o quattro
  colonne `1fr`, senza breakpoint/container query. A `:615-624` ogni passo,
  anche incompleto, usa `check-circle`; il completamento cambia tono/colore del
  medesimo simbolo ma non ha un’etichetta testuale per passo. Il requisito
  `§15.1` chiede UI accessibile e responsive; i pattern Polaris della Setup
  guide marcano come completati soltanto i task conclusi e `s-grid` supporta
  layout responsivi nativi.
- **Impatto:** a larghezza ridotta titoli italiani e inglesi competono in
  quattro colonne; visivamente una spunta neutra può essere letta come
  completamento, mentre chi non percepisce il colore non riceve lo stesso
  segnale. Il contatore totale mitiga, ma non identifica il singolo passo.
- **Correzione proporzionata:** mostrare la spunta soltanto per `step.done` (o
  aggiungere un testo di stato già localizzato) e usare la sintassi responsive
  nativa di `s-grid` per passare a una colonna quando lo spazio non basta. Non
  servono CSS, media query o un componente checklist custom.

I completamenti restano correttamente derivati da stato osservabile; non va
inventato un check ordine che richiederebbe nuovi scope.

### [PR #102 — procedura in finestra e stato locale](https://github.com/max23468/CF-Ready/pull/102)

**Stato:** merged, `0f03a37`; 7 file, `+189/-158`; review Codex non eseguita.

**Finding:** i bug `Passo 0`, lettura shadow DOM e rimbalzo sono corretti. La
checkbox non controllata introdotta qui diventa incoerente con lo stato React
aggiunto da #105: F-M6-105-02.

### [PR #103 — sblocco terzo passo](https://github.com/max23468/CF-Ready/pull/103)

**Stato:** merged, `91fa954`; 6 file, `+57/-33`; review Codex non eseguita.

**Finding:** hard-code del passo e auto-avanzamento su intent sbagliato risultano
corretti. L’uso della stessa `check-circle` per passi completi e incompleti resta
nel finding statico F-M6-101-01.

### [PR #104 — passo in un posto solo](https://github.com/max23468/CF-Ready/pull/104)

**Stato:** merged, `488ebed`; 6 file, `+59/-35`; review Codex non eseguita.

**Finding:** radio controllati e handler fragile sono corretti. La promessa del
titolo («un posto solo») è durata uno snapshot: #105 ha reintrodotto una
scrittura D1 a ogni transizione. Il residuo tecnico è F-M6-105-01, non una
richiesta di ulteriore state machine.

### [PR #105 — memoria del passo e dichiarazione](https://github.com/max23468/CF-Ready/pull/105)

**Stato:** merged, `a46ff27`; 5 file, `+85/-48`; review Codex reale con due
thread, entrambi ancora non risolti e non resi obsoleti da #106/#107.

#### F-M6-105-01 — chiusura concorrente con `progress.submit`

- **Classe/priorità/stato:** bug di concorrenza, P2, aperto.
- **Thread Codex:**
  [discussion_r3692939671](https://github.com/max23468/CF-Ready/pull/105#discussion_r3692939671).
- **Evidenza:** `app/routes/app.onboarding.tsx:139-150` usa un secondo fetcher,
  ma `busy` osserva soltanto il fetcher principale. Arrivati al passo 4, la
  richiesta `progress(step=4)` può terminare dopo `activate/finish`.
  `saveOnboarding` conserva `completed` ma aggiorna sempre `onboarding_step`
  (`app/validation.server.ts:627-640`), riportandolo da 1 a 4.
- **Impatto:** riaprendo la procedura si atterra sul riepilogo anziché ripartire
  dal primo passo; la persistenza contraddice §15.9.
- **Correzione proporzionata:** disabilitare le azioni finali mentre `progress`
  non è idle oppure serializzare la singola scrittura pendente. Non serve un
  nuovo store di stato.

#### F-M6-105-02 — checkbox e istruzioni divergenti

- **Classe/priorità/stato:** bug UI/stato, P2, aperto.
- **Thread Codex:**
  [discussion_r3692939674](https://github.com/max23468/CF-Ready/pull/105#discussion_r3692939674).
- **Evidenza:** lo stato `declared` nasce da `saved.address2Declared`
  (`app/routes/app.onboarding.tsx:134`) e viene aggiornato dal form; tornando dal
  passo 4 al 3, la checkbox viene rimontata con
  `defaultChecked={saved.address2Declared}` (`:318-326`), mentre lo stato React
  conserva l’ultima scelta non salvata.
- **Impatto:** le istruzioni possono apparire con checkbox spenta o sparire con
  checkbox accesa; il valore inviato è quello del DOM, non quello mostrato dalle
  istruzioni.
- **Correzione proporzionata:** riallineare `declared` quando si entra nel passo
  4 o far condividere alla checkbox il solo stato già esistente.

#### F-M6-105-03 — `NaN` come passo D1

- **Classe/priorità/stato:** validazione trust-boundary, P3, aperto.
- **Evidenza:** `app/routes/app.onboarding.tsx:49-56` converte qualsiasi input
  con `Number`; `Math.min/max` non corregge `NaN`. Una POST autenticata con
  `intent=progress&step=x` arriva quindi al binding D1 come numero non valido.
- **Impatto:** errore 500 evitabile su input manipolato; nessuna escalation di
  privilegi.
- **Correzione proporzionata:** `Number.isInteger(step)` e range 1–4 prima della
  scrittura, con un test mirato.

### [PR #106 — riconoscimento chiusura procedura](https://github.com/max23468/CF-Ready/pull/106)

**Stato:** merged, `d497179`; 4 file, `+26/-7`; review Codex non eseguita.

**Finding:** la schermata finale dopo attivazione è corretta. La PR non tocca i
due thread di #105, che restano aperti.

### [PR #107 — registro M6 e chiavi senza lettore](https://github.com/max23468/CF-Ready/pull/107)

**Stato:** merged, `978acf4`; 3 file, `+16/-9`; review Codex non eseguita.
Completa la tabella snapshot fino a `0.4.21` e rimuove tre stringhe morte.

**Finding:** nessun finding aperto. Il follow-up al commento Codex di #108 ha
allineato stato corrente in README e intestazione del Master Plan, aggiunto
contratti ed evidenza M6 all’indice e sostituito i riferimenti prescrittivi alle
cinque pagine con le quattro pagine permanenti effettive. Non è stato introdotto
alcun meccanismo di sincronizzazione documentale.

---

## 7. Ordine operativo consigliato

1. Correggere la descrizione compliance dello SHA-256 come identificatore
   pseudonimizzato, non anonimo o non reversibile (F-M5-67-03).
2. Preservare integrità e unicità degli eventi billing, selezionando l'importo
   dalla risorsa effettiva (F-M5-67-01/02/04).
3. Validare al confine server gli errori Shopify, il `returnUrl` e il piano già
   attivo (F-M5-74-01, F-M5-76-01, F-M5-79-01).
4. Chiudere il percorso di mutazione condiviso: errori Shopify tipizzati,
   riconciliazione entitlement, readback completo, rifiuto dell’attivazione
   senza diritto e configurazione riletta dentro la lease (F-M6-83-01/03/05 e
   F-M6-99-01).
5. Persistire le dichiarazioni D1 soltanto dopo il successo Shopify
   (F-M6-83-02, F-M6-99-02).
6. Correggere i residui UX statici con componenti e stati già presenti: login
   bilingue, banner salvataggio, frase Home, loading del pulsante e Setup guide
   (F-M6-83-04, F-M6-86-01, F-M6-90-01, F-M6-87-01).
7. Aggiungere la conferma cancellazione F-M6-99-03 riusando la modale presente.
8. Stabilizzare stato e layout dell'onboarding con i test minimi di regressione
   (F-M6-101-01, F-M6-105-01/02/03).
9. Conservare F-M3-57-01 come gate esplicito M10, senza inventare workaround
   prima della prova reale.

Questo ordine non richiede retrocompatibilità, supporto di formati legacy,
nuovi provider o nuove astrazioni. Ogni correzione può restare nel punto
condiviso già esistente e lasciare un solo test di regressione mirato.
