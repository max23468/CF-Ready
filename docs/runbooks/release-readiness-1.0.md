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
`0.9.12` sono distribuiti. La candidata è stata promossa su `main` dalla PR
[#232](https://github.com/max23468/CF-Ready/pull/232) e il deploy è stato
verificato dal run
[#31107867823](https://github.com/max23468/CF-Ready/actions/runs/31107867823).
La navigazione embedded della `0.9.11` è stata verificata in Chrome sullo store
`cf-ready-dev`: una sola voce Home e tutti i flussi primari dentro l'Admin.

---

## 1. Candidato

| Voce | Valore |
| --- | --- |
| Versione candidata | `0.9.12` |
| Commit candidato | `89e716f`, HEAD di `develop` promosso con la PR [#232](https://github.com/max23468/CF-Ready/pull/232) |
| Branch | `main`; `0.9.12` promossa con la PR [#232](https://github.com/max23468/CF-Ready/pull/232) |
| Ultimo snapshot Development provato | `0.9.12`, run [31105952620](https://github.com/max23468/CF-Ready/actions/runs/31105952620) |
| Submission | inviata a Shopify il 4 agosto 2026 |
| Tag `v1.0.0` | non creato: si crea alla promozione Production della `1.0.0` |

### Ricevuta del deploy Development `0.9.13`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.13`, commit `f16d25b` |
| Worker | deployment `0d236209-fcb6-41c7-8ebe-b73a051ef571`, versione `1e736d48-4b62-4729-9689-0f0784c5a9bb`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31112000908](https://github.com/max23468/CF-Ready/actions/runs/31112000908) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 20 ms, 0 errori |
| Shopify | versione `0.9.13` attiva (`gid://shopify/Version/1078945447937`), commit verificato |
| Rollback | snapshot coordinato `0.9.12`, commit `4d84481`, verificato prima del deploy |

### Ricevuta del deploy Development `0.9.12`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.12`, commit `4d84481` |
| Worker | deployment `dd31444a-fc17-42e5-b039-b6c0116804e4`, versione `29315905-b24c-48a5-aac3-392cfc698eef`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31105952620](https://github.com/max23468/CF-Ready/actions/runs/31105952620) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 2 ms, massimo 29 ms, 0 errori |
| Shopify | versione `0.9.12` attiva (`gid://shopify/Version/1078843441153`), commit verificato |
| Rollback | snapshot coordinato `0.9.11`, verificato prima del deploy |

### Ricevuta del deploy Production `0.9.12`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.12`, commit `008a4a7` |
| Worker | `cf-ready-prod`, deployment `c0f16832-21e6-4f92-84c1-843ac661ef94`, versione `970e2a2f-92de-4f9e-8d62-2728276b449d`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31107867823](https://github.com/max23468/CF-Ready/actions/runs/31107867823) |
| Smoke e readback | Worker raggiungibile; Shopify `0.9.12` attiva (`gid://shopify/Version/1078876569601`); commit verificato |
| Code e trigger | producer e consumer `cf-ready-webhooks-prod`, consumer failure queue, cron `0 * * * *` |
| Rollback | snapshot coordinato Worker e Shopify `0.9.11`, registrato prima delle scritture |

### Ricevuta del deploy Development `0.9.11`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.11`, commit `639b73d` |
| Worker | deployment `50c648f2-7e37-4f01-b67e-247d18e8b115`, versione `0444529d-7b8a-4f88-8d21-fe61c00411f0`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30995275981](https://github.com/max23468/CF-Ready/actions/runs/30995275981) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 20 ms, 0 errori |
| Shopify | versione `0.9.11` attiva (`gid://shopify/Version/1077095432193`), commit verificato |
| Rollback | snapshot coordinato `0.9.10`, commit `5c172da`, verificato prima del deploy |

### Ricevuta del deploy Development `0.9.10`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.10`, commit `5c172da` |
| Worker | deployment `56fef4de-0907-421a-8ebd-79b053e6e936`, versione `2943db5f-57f8-49bb-b64c-7a861e9b74d0`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30985696894](https://github.com/max23468/CF-Ready/actions/runs/30985696894) |
| Smoke e readback | Worker raggiungibile; startup 7 ms; Shopify `0.9.10` attiva (`gid://shopify/Version/1076892631041`); commit verificato |
| Rollback | snapshot coordinato `0.9.9` verificato prima del deploy |

### Ricevuta del deploy Production `0.9.11`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.11`, commit `117ecb6` |
| Worker | `cf-ready-prod`, deployment `0fafa0d1-42de-466c-8531-328d921ba56f`, versione `3c4a9d6b-1586-43ee-9f97-df3d09e586e8`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30989878088](https://github.com/max23468/CF-Ready/actions/runs/30989878088) |
| Smoke e readback | Worker raggiungibile; startup 6 ms; Shopify `0.9.11` attiva (`gid://shopify/Version/1076974125057`); commit verificato |
| Code e trigger | producer e consumer `cf-ready-webhooks-prod`, consumer failure queue, cron `0 * * * *` |
| Rollback | Worker `0.9.9`, deployment `b4334786-36ab-4025-8f1d-abe63144f214`, versione `98b88912-be2f-4614-b81f-15f16ac37281` |

Il primo tentativo della `0.9.11`, run
[30988063494](https://github.com/max23468/CF-Ready/actions/runs/30988063494),
ha rilevato le code Production mancanti e ha ripristinato il Worker precedente.
La PR [#227](https://github.com/max23468/CF-Ready/pull/227) ha corretto la
configurazione condivisa; il retry coordinato ha poi completato Worker, Shopify,
smoke e readback.

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
sono verdi. La navigazione embedded della Production `0.9.9` è stata verificata
in Safari dopo il deploy del 4 agosto 2026.

### Ricevuta del deploy Production `0.9.9`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.9`, commit di promozione `a21dc98` |
| Worker | `cf-ready-prod`, deployment `b4334786-36ab-4025-8f1d-abe63144f214`, versione `98b88912-be2f-4614-b81f-15f16ac37281` |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [30954478305](https://github.com/max23468/CF-Ready/actions/runs/30954478305) |
| Smoke e readback | Worker raggiungibile; Shopify `0.9.9` attiva (`gid://shopify/Version/1076466515969`); commit verificato |
| Rollback | Worker deployment `41d9c08c-5630-4cae-8ed1-2d669ed6bcb4`, versione `328a0869-07c4-4c9a-b4d0-bf6a628276c9`; Shopify `0.9.8` |

**Contenuto della `0.9.9`:** conserva la voce «Home» senza il doppione `/app`,
limita centralmente a 16 KiB i body dei form merchant e chiude i residui
dell'audit M9. In Safari, sullo store
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
| Gate locale completo `npm run check` | run Production [30989878088](https://github.com/max23468/CF-Ready/actions/runs/30989878088), commit `117ecb6` | ✅ |
| Test della Validation Function | `npm run test:function`, 109 test | ✅ |
| E2E pubblici | job `e2e` della PR [#216](https://github.com/max23468/CF-Ready/pull/216), run `30952011063`: WebKit e Chromium verdi | ✅ |
| Snapshot Development verificato | run `30995275981`: gate, capacità, Worker, Shopify e readback verdi; 120 richieste, CPU p95 1 ms, massimo 20 ms, 0 errori | ✅ |
| Deploy Pages Production e smoke | run `30743184121`, otto URL e header di sicurezza | ✅ |
| Rollback Pages esercitato e letto | run `30741094451` | ✅ |
| Backup D1 Production e restore | run `30769584725`: export cifrato, restore locale di 32 comandi, `integrity_check=ok`, readback dello slot R2 | ✅ |
| Security audit e manutenzione provider | run `30749648119`, entrambi i job verdi | ✅ |
| Audit pre-submission App Store | [audit aggiornato il 4 agosto 2026](../audits/2026-08-03-app-store-pre-submission.md), 31 requisiti locali probabilmente conformi | ✅ |
| Audit Built for Shopify | [audit del 5 agosto 2026](../audits/2026-08-05-built-for-shopify-readiness.md): integrazione, UI, accessibilità, materiali e matrice checkout | ⚠️ metriche differite separate |
| Migrazioni D1 Development | nessuna pendente al readback del run `30943459841` | ✅ |
| Migrazioni D1 Production | dieci migrazioni versionate applicate, readback senza pendenti, 11 tabelle | ✅ |
| `noindex` sui documenti legali | verificato **live** dopo il deploy del 3 agosto 2026: i quattro percorsi rispondono `X-Robots-Tag: noindex`, la Home, l'assistenza e la Home inglese no | ✅ |
| Iniezione dell'identità del titolare | verificata **live**: Privacy e Termini, IT ed EN, dichiarano il nome della persona fisica titolare e nessuna pagina pubblica contiene ancora il segnaposto. Il segnaposto nei sorgenti è protetto da un test in `scripts/check-docs.node-test.mjs` | ✅ |
| Configurazione Worker Production | `wrangler.json` env `production`: Worker `cf-ready-prod`, D1 `cf-ready-db-prod`, `ALLOWED_SHOP` vuota, addebiti reali | ✅ |
| Worker Production distribuito | versione `0.9.11`, run `30989878088`, commit `117ecb6`; `https://cf-ready-prod.tmsf.workers.dev` risponde | ✅ |
| URL Production nel manifest Shopify | `shopify.app.toml` punta a `https://cf-ready-prod.tmsf.workers.dev`, con aggiornamento automatico degli URL vietato | ✅ |
| **`BILLING_TEST=false` in Production** | `wrangler.json` env `production` la definisce a `"false"` ed è effettiva sul Worker dalla `0.9.6` (D-129): gli addebiti dei merchant sono reali | ✅ |
| Secret Production separati | tre secret runtime caricati sul Worker `cf-ready-prod` il 4 agosto 2026; il preflight li verifica a ogni deploy | ✅ |
| Versione attiva dell'app CF Ready | Development `0.9.11`, readback del run `30995275981`; Production `0.9.11`, readback del run `30989878088` | ✅ |
| Navigazione embedded D-130 | verificata in Chrome il 5 agosto 2026 sullo store `cf-ready-dev` con la Production `0.9.11`: una sola Home e route primarie dentro l'Admin | ✅ |
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
| Deploy Worker Production | `0.9.11` eseguita e verificata dal run [30989878088](https://github.com/max23468/CF-Ready/actions/runs/30989878088) |
| Promozione `develop` → `main` | `0.9.11` unita con [#226](https://github.com/max23468/CF-Ready/pull/226) e completata con [#228](https://github.com/max23468/CF-Ready/pull/228) |
| Submission App Store | autorizzata ed eseguita dall'owner il 4 agosto 2026; stato `Submitted` |
| Attivazione billing reale | autorizzata e attiva in Production dalla `0.9.6` |
| Passaggio della listing a visibilità completa | M12, non autorizzato |
