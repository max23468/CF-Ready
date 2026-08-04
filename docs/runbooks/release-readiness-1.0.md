# Release readiness `1.0`

Record richiesto da §24.9 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md). Non ripete i
requisiti: collega, per ogni gate bloccante, la prova che lo sostiene.

**Una casella spuntata senza link, ID o risultato osservato non è readiness.**
Dove la prova non esiste ancora, la riga dice «assente» e resta assente finché
qualcuno non la produce. Le righe marcate ⚠️ riportano una dichiarazione
dell'owner su qualcosa che vive fuori dal repository: valgono come impegno, non
come verifica, e chi legge deve poterle distinguere dalle altre. Le righe si aggiornano nella stessa modifica che
produce la prova.

**Stato complessivo: inviato, non approvato.** La submission è partita il
4 agosto 2026 e il gate che chiude M9 è l'approvazione di Shopify, che non
dipende da noi. Materiali e listing ci sono per dichiarazione dell'owner.
L'accesso del reviewer non è più un gate mancante ma una decisione registrata
(D-132). Il checkout reale ripetuto resta nel canary M10; gli addebiti reali
sono invece attivi in Production. Il sito pubblico e la versione Production
`0.9.8` sono distribuiti; la candidata `0.9.9` è verificata in Development ed è
stata promossa su `main` dalla PR [#217](https://github.com/max23468/CF-Ready/pull/217).
La chiusura documentale di M9 attende la promozione nella PR
[#219](https://github.com/max23468/CF-Ready/pull/219).
La navigazione embedded della `0.9.8` è stata verificata in Safari sullo store
`cf-ready-dev`: una sola voce Home, senza il doppione `/app`.

---

## 1. Candidato

| Voce | Valore |
| --- | --- |
| Versione candidata | `0.9.9` |
| Commit candidato | `8fc5d5b`, merge della PR [#216](https://github.com/max23468/CF-Ready/pull/216) |
| Branch | `develop`; `0.9.9` promossa con la PR [#217](https://github.com/max23468/CF-Ready/pull/217), chiusura M9 aperta nella PR [#219](https://github.com/max23468/CF-Ready/pull/219) |
| Ultimo snapshot Development provato | `0.9.9`, run [30952347931](https://github.com/max23468/CF-Ready/actions/runs/30952347931) |
| Submission | inviata a Shopify il 4 agosto 2026 |
| Tag `v1.0.0` | non creato: si crea alla promozione Production della `1.0.0` |

### Ricevuta del deploy Development `0.9.9`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.9`, commit `8fc5d5b` |
| Worker | deployment `bf422da7-bae0-42cb-b8ea-7055e4253bdf`, versione `c6409191-a333-4f18-82d4-1bc400923498` |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30952347931](https://github.com/max23468/CF-Ready/actions/runs/30952347931) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 18 ms, 0 errori |
| Shopify | versione `0.9.9` attiva (`gid://shopify/Version/1076439842817`) |
| Rollback | snapshot coordinato `0.9.8` verificato prima del deploy |

**Contenuto della `0.9.9`:** chiude i residui dell'audit su rollback, prova già
consumata, percorso onboarding, governance e scadenze credenziali. Test e gate
sono verdi. La navigazione embedded della Production `0.9.8` è stata verificata
in Safari il 4 agosto 2026.

### Ricevuta del deploy Production `0.9.8`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.8`, commit di promozione `fb0ba43` |
| Worker | `cf-ready-prod`, versione `328a0869-07c4-4c9a-b4d0-bf6a628276c9` |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30946345558](https://github.com/max23468/CF-Ready/actions/runs/30946345558) |
| Smoke e readback | superati: Worker, versione Shopify e commit verificati |
| Rollback | armato dal workflow, versione precedente registrata negli output del run |

**Contenuto della `0.9.8`:** conserva la voce «Home» senza il doppione `/app` e
limita centralmente a 16 KiB i body dei form merchant. In Safari, sullo store
`cf-ready-dev`, il menu embedded espone una sola Home, Regole checkout, Messaggi
al cliente e Guida e FAQ.

### Ricevuta del primo deploy Production

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.1`, commit `fef471b` |
| Worker | `cf-ready-prod`, `https://cf-ready-prod.tmsf.workers.dev` |
| Versione Shopify | `0.9.1` attiva; `cf-ready-2` e `cf-ready-1` conservate inattive come rollback |
| Migrazioni | dieci già applicate, nessuna pendente al readback remoto |
| Run | [30888857219](https://github.com/max23468/CF-Ready/actions/runs/30888857219) |
| Smoke e readback | Worker raggiungibile; deployment, versione Shopify e commit verificati |
| Addebiti | **di prova**, come dichiarato nella ricevuta del run |
| Rollback Worker | non armato: era il primo deploy e non esisteva una versione precedente |

Il tentativo precedente ([30888124042](https://github.com/max23468/CF-Ready/actions/runs/30888124042))
si è fermato sul passo che compila la ricevuta, prima di migrazioni e deploy:
`require()` non carica un modulo ESM con top-level await. Production è rimasta
intatta.

### Ricevuta del deploy Pages Production

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Pages Production, progetto `cf-ready`, branch `main`, dominio `cf-ready.pages.dev` |
| Versione repository e commit | `0.9.0`, commit `1dd28e7` |
| Versione Shopify e migrazioni | non applicabile: il deploy Pages riguarda il solo sito statico |
| Run | [30858646562](https://github.com/max23468/CF-Ready/actions/runs/30858646562); deployment ID, URL e target di rollback sono nel riepilogo del run |
| Smoke | otto URL, header di sicurezza, `noindex` sui quattro documenti legali e assenza del segnaposto |
| Readback | commit corrispondente, `commit_dirty` falso, deployment canonico in stato `success` |
| Rollback verificato | sì, esercitato davvero: il primo tentativo ([30857854448](https://github.com/max23468/CF-Ready/actions/runs/30857854448)) è fallito sullo smoke e il rollback ha ripristinato il deployment precedente senza intervento manuale |

Il primo tentativo è fallito perché le regole di `_headers` diventano effettive
all'edge con un ritardo proprio, distinto dalla propagazione del contenuto che
lo smoke già attendeva. Lo smoke ora attende anche quelle e, soprattutto, dice
quale URL ha fallito invece di uscire in silenzio ([#187](https://github.com/max23468/CF-Ready/pull/187)).

## 2. Gate bloccanti

| Gate | Prova | Stato |
| --- | --- | --- |
| Gate locale completo `npm run check` | run Development [30952347931](https://github.com/max23468/CF-Ready/actions/runs/30952347931), commit `8fc5d5b` | ✅ |
| Test della Validation Function | `npm run test:function`, 109 test | ✅ |
| E2E pubblici | job `e2e` della PR [#216](https://github.com/max23468/CF-Ready/pull/216), run `30952011063`: WebKit e Chromium verdi | ✅ |
| Snapshot Development verificato | run `30952347931`: gate, capacità, Worker, Shopify e readback verdi; 120 richieste, CPU p95 1 ms | ✅ |
| Deploy Pages Production e smoke | run `30743184121`, otto URL e header di sicurezza | ✅ |
| Rollback Pages esercitato e letto | run `30741094451` | ✅ |
| Backup D1 Production e restore | run `30769584725`: export cifrato, restore locale di 32 comandi, `integrity_check=ok`, readback dello slot R2 | ✅ |
| Security audit e manutenzione provider | run `30749648119`, entrambi i job verdi | ✅ |
| Audit pre-submission App Store | [audit aggiornato il 4 agosto 2026](../audits/2026-08-03-app-store-pre-submission.md), 31 requisiti locali probabilmente conformi | ✅ |
| Migrazioni D1 Development | nessuna pendente al readback del run `30943459841` | ✅ |
| Migrazioni D1 Production | dieci migrazioni versionate applicate, readback senza pendenti, 11 tabelle | ✅ |
| `noindex` sui documenti legali | verificato **live** dopo il deploy del 3 agosto 2026: i quattro percorsi rispondono `X-Robots-Tag: noindex`, la Home, l'assistenza e la Home inglese no | ✅ |
| Iniezione dell'identità del titolare | verificata **live**: Privacy e Termini, IT ed EN, dichiarano il nome della persona fisica titolare e nessuna pagina pubblica contiene ancora il segnaposto. Il segnaposto nei sorgenti è protetto da un test in `scripts/check-docs.node-test.mjs` | ✅ |
| Configurazione Worker Production | `wrangler.json` env `production`: Worker `cf-ready-prod`, D1 `cf-ready-db-prod`, `ALLOWED_SHOP` vuota, addebiti reali | ✅ |
| Worker Production distribuito | versione `0.9.8`, run `30946345558`, commit `fb0ba43`; `https://cf-ready-prod.tmsf.workers.dev` risponde | ✅ |
| URL Production nel manifest Shopify | `shopify.app.toml` punta a `https://cf-ready-prod.tmsf.workers.dev`, con aggiornamento automatico degli URL vietato | ✅ |
| **`BILLING_TEST=false` in Production** | `wrangler.json` env `production` la definisce a `"false"` ed è effettiva sul Worker dalla `0.9.6` (D-129): gli addebiti dei merchant sono reali | ✅ |
| Secret Production separati | tre secret runtime caricati sul Worker `cf-ready-prod` il 4 agosto 2026; il preflight li verifica a ogni deploy | ✅ |
| Versione attiva dell'app CF Ready | Development `0.9.9`; Production `0.9.8`, entrambe verificate dai rispettivi readback del 4 agosto 2026 | ✅ |
| Navigazione embedded D-130 | verificata in Safari il 4 agosto 2026 sullo store `cf-ready-dev` con la Production `0.9.8`: una sola Home, nessun doppione `/app` | ✅ |
| Function API `2026-07` stabile e rigenerata | fonte Shopify del 3 agosto 2026: stabile dal 1º luglio 2026, accessibile fino al 16 luglio 2027. Schema rigenerato con CLI 4.6.0, identico al committato a meno della formattazione | ✅ |
| **Checkout reali ripetuti sulla Function** | nessuno in questa sessione; è anche il gate di M10 | ❌ assente |
| Listing compilata nel Partner Dashboard | testi IT/EN, icona, disponibilità solo Italia e categoria, **dichiarato dall'owner il 4 agosto 2026**, con la submission inviata lo stesso giorno. La feature image corretta è pronta nel repository; la sostituzione nella submission resta in carico all'owner | ⚠️ sostituzione feature image aperta |
| Screenshot della listing | prodotti e caricati nella listing, **dichiarato dall'owner il 4 agosto 2026**. Non entrano nel repository per decisione dello stesso giorno: piano di cattura e didascalie restano in [`screenshots.md`](../listing/screenshots.md) | ⚠️ dichiarato, non verificato da qui |
| Demo screencast | registrato, **dichiarato dall'owner il 4 agosto 2026**. Non entra nel repository: il copione resta in [`screencast-script.md`](../listing/screencast-script.md), aggiornato all'avvio esplicito della prova | ⚠️ dichiarato, non verificato da qui |
| Contatto tecnico d'emergenza | requisito 4.5.6: registrato dall'owner nelle impostazioni dell'account Partner il 4 agosto 2026 | ✅ |
| Accesso del reviewer | nessuno store né credenziali forniti: l'app dichiara di non richiedere un account e le istruzioni chiedono l'installazione su un development store italiano (D-132). Il 4.5.5 è condizionale e non si applica; lo store preinstallato è un requisito delle sole Payment app (5.2.1) | ✅ deciso |
| **Canary su store reale** | milestone M10, non ancora iniziata | ❌ assente |

## 3. Configurazioni e API validate

| Voce | Valore verificato |
| --- | --- |
| Function API | `2026-07`, pinnata in `extensions/cf-ready-validation/shopify.extension.toml`, riconfermata stabile il 3 agosto 2026 |
| Admin GraphQL API | `2026-07` |
| Webhook API version | `2026-07` |
| Access scope | `write_validations`, unico |
| Target Function | `cart.validations.generate.run` |
| `blockOnFailure` | `false`, verificato dopo ogni update |
| Compatibility date Worker | `2026-07-28` |

## 4. Superfici pubbliche

| Voce | URL | Stato |
| --- | --- | --- |
| Sito | `https://cf-ready.pages.dev/` | pubblicato |
| Privacy | `https://cf-ready.pages.dev/privacy` e `/en/privacy` | pubblicata; identità del titolare completata in M9 |
| Termini | `https://cf-ready.pages.dev/terms` e `/en/terms` | pubblicati; identità del titolare completata in M9 |
| Assistenza | `https://cf-ready.pages.dev/support` e `/en/support` | pubblicata, `mailto:` verificato |
| Segnalazione vulnerabilità | `SECURITY.md` e canale privato del repository | operativo, verificato in M7 |

I quattro documenti legali sono serviti con `X-Robots-Tag: noindex`: restano
pubblici e raggiungibili, fuori dai motori di ricerca. Il nome della persona
fisica titolare non è nel repository — sta nel secret `OWNER_LEGAL_NAME` e viene
iniettato dal workflow Pages, che verifica nello smoke di non aver pubblicato il
segnaposto. Deploy eseguito il 3 agosto 2026 e verificato live.

## 5. Rischi accettati, non bloccanti

| Rischio | Decisione |
| --- | --- |
| Sigla `CF` dentro l'icona, contro la raccomandazione Shopify | accettato dall'owner il 28 luglio 2026 (D-114). Rimedio pronto: `icon-app-notext.svg`, si sostituisce solo l'icona della listing |
| Nessun indirizzo geografico nei documenti legali | accettato dall'owner il 3 agosto 2026: titolare persona fisica senza Partita IVA, identificato con nome e recapito email. La review potrebbe chiedere un indirizzo |
| Nessun dominio proprio | deciso in M7: il sito resta su `pages.dev` per la 1.0; ne consegue il `mailto:` al posto del modulo con invio |
| Generazioni ricorrenti degli abbonamenti non coperte | limite della piattaforma, dichiarato in listing, termini e reviewer instructions |
| Wallet non tutti disponibili in ambiente di test | matrice completa rimandata a M10 su store reale |

## 6. Autorizzazioni separate

Nessuna di queste azioni è coperta dall'avanzamento di M9. Ognuna richiede
un'autorizzazione esplicita e distinta dell'owner, al momento in cui viene
eseguita.

| Azione | Stato |
| --- | --- |
| Deploy Worker Production | `0.9.8` eseguita; promozione `0.9.9` autorizzata con «pubblica» il 4 agosto 2026 |
| Promozione `develop` → `main` | `0.9.9` unita con [#217](https://github.com/max23468/CF-Ready/pull/217); chiusura M9 aperta in [#219](https://github.com/max23468/CF-Ready/pull/219) |
| Submission App Store | autorizzata ed eseguita dall'owner il 4 agosto 2026; stato `Submitted` |
| Attivazione billing reale | autorizzata e attiva in Production dalla `0.9.6` |
| Passaggio della listing a visibilità completa | M12, non autorizzato |
