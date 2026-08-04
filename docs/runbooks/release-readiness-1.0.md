# Release readiness `1.0`

Record richiesto da §24.9 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md). Non ripete i
requisiti: collega, per ogni gate bloccante, la prova che lo sostiene.

**Una casella spuntata senza link, ID o risultato osservato non è readiness.**
Dove la prova non esiste ancora, la riga dice «assente» e resta assente finché
qualcuno non la produce. Le righe si aggiornano nella stessa modifica che
produce la prova.

**Stato complessivo: non pronto.** Mancano i materiali visivi della listing, la
sua compilazione nel Partner Dashboard, lo staff account per il reviewer e un
checkout reale ripetuto. Sito pubblico e app sono invece distribuiti e
verificati.

---

## 1. Candidato

| Voce | Valore |
| --- | --- |
| Versione candidata | `0.9.1` |
| Commit candidato | `290f053`, promosso a `main` con `4b6c7b8` |
| Branch | `develop`, promosso a `main` il 3 agosto 2026 |
| Ultimo snapshot Development provato | `0.8.6`, run `30768120300` |
| Tag `v1.0.0` | non creato: si crea alla promozione Production della `1.0.0` |

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
| Gate locale completo `npm run check` | eseguito il 3 agosto 2026 su `feat/m9-release-candidate` | ✅ |
| Test della Validation Function | `npm run test:function`, 109 test | ✅ |
| E2E pubblici | `tests/e2e/site.spec.ts` e `tests/e2e/login.spec.ts`, WebKit e Chromium, due viewport — job `e2e` della PR #185, run `30855651057` | ✅ |
| Snapshot Development verificato | run `30768120300`: gate, capacità, Worker, Shopify e readback verdi; 120 richieste, CPU p95 1 ms | ✅ |
| Deploy Pages Production e smoke | run `30743184121`, otto URL e header di sicurezza | ✅ |
| Rollback Pages esercitato e letto | run `30741094451` | ✅ |
| Backup D1 Production e restore | run `30769584725`: export cifrato, restore locale di 32 comandi, `integrity_check=ok`, readback dello slot R2 | ✅ |
| Security audit e manutenzione provider | run `30749648119`, entrambi i job verdi | ✅ |
| Audit pre-submission App Store | [audit del 3 agosto 2026](../audits/2026-08-03-app-store-pre-submission.md) | ✅ con quattro punti aperti |
| Migrazioni D1 Development | applicate e verificate a ogni snapshot, da ultimo nel run `30768120300` | ✅ |
| Migrazioni D1 Production | dieci migrazioni versionate applicate, readback senza pendenti, 11 tabelle | ✅ |
| `noindex` sui documenti legali | verificato **live** dopo il deploy del 3 agosto 2026: i quattro percorsi rispondono `X-Robots-Tag: noindex`, la Home, l'assistenza e la Home inglese no | ✅ |
| Iniezione dell'identità del titolare | verificata **live**: Privacy e Termini, IT ed EN, dichiarano il nome della persona fisica titolare e nessuna pagina pubblica contiene ancora il segnaposto. Il segnaposto nei sorgenti è protetto da un test in `scripts/check-docs.node-test.mjs` | ✅ |
| Configurazione Worker Production | `wrangler.json` env `production`: Worker `cf-ready-prod`, D1 `cf-ready-db-prod`, `ALLOWED_SHOP` vuota, addebiti di prova | ✅ |
| Worker Production distribuito | run `30888857219` del 4 agosto 2026, commit `fef471b`; `https://cf-ready-prod.tmsf.workers.dev` risponde | ✅ |
| URL Production nel manifest Shopify | `shopify.app.toml` punta a `https://cf-ready-prod.tmsf.workers.dev`, con aggiornamento automatico degli URL vietato | ✅ |
| **`BILLING_TEST=false` in Production** | variabile non definita: ogni addebito è di prova | ❌ assente |
| Secret Production separati | tre secret runtime caricati sul Worker `cf-ready-prod` il 4 agosto 2026; il preflight li verifica a ogni deploy | ✅ |
| Versione attiva dell'app CF Ready | `0.9.1`, pubblicata il 4 agosto 2026. `cf-ready-2` e `cf-ready-1` restano inattive come rollback | ✅ |
| Function API `2026-07` stabile e rigenerata | fonte Shopify del 3 agosto 2026: stabile dal 1º luglio 2026, accessibile fino al 16 luglio 2027. Schema rigenerato con CLI 4.6.0, identico al committato a meno della formattazione | ✅ |
| **Checkout reali ripetuti sulla Function** | nessuno in questa sessione; è anche il gate di M10 | ❌ assente |
| **Screenshot della listing** | piano e didascalie pronti in [`screenshots.md`](../listing/screenshots.md); nessun file prodotto | ❌ assente |
| **Demo screencast** | copione pronto in [`screencast-script.md`](../listing/screencast-script.md); nessuna ripresa | ❌ assente |
| Contatto tecnico d'emergenza | requisito 4.5.6: registrato dall'owner nelle impostazioni dell'account Partner il 4 agosto 2026 | ✅ |
| **Staff account per il reviewer** | da creare sul dev store con i permessi *Manage and install apps and channels*, *Approve app charges* e *Orders → View*; credenziali nelle testing instructions (requisiti 4.5.4 e 4.5.5) | ❌ assente |
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
| Deploy Worker Production | non autorizzato |
| Promozione `develop` → `main` | non autorizzata |
| Submission App Store | non autorizzata |
| Attivazione billing reale | non autorizzata |
| Passaggio della listing a visibilità completa | M12, non autorizzato |
