# Release readiness `1.0`

Record richiesto da §24.9 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md). Non ripete i
requisiti: collega, per ogni gate bloccante, la prova che lo sostiene.

**Una casella spuntata senza link, ID o risultato osservato non è readiness.**
Dove la prova non esiste ancora, la riga dice «assente» e resta assente finché
qualcuno non la produce. Le righe si aggiornano nella stessa modifica che
produce la prova.

**Stato complessivo: non pronto.** Mancano il deploy Production, i materiali
visivi della listing e la riconferma della Function API.

---

## 1. Candidato

| Voce | Valore |
| --- | --- |
| Versione candidata | `0.9.0` |
| Commit candidato | da registrare al merge di `feat/m9-release-candidate` |
| Branch | `develop` → promozione a `main` solo con autorizzazione dell'owner |
| Ultimo snapshot Development provato | `0.8.6`, run `30768120300` |
| Tag `v1.0.0` | non creato: si crea alla promozione Production |

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
| Migrazioni D1 Production | dieci migrazioni versionate applicate, readback senza pendenti, 11 tabelle | ✅ |
| **Worker Production distribuito** | nessuno: `wrangler.json` descrive solo `cf-ready-dev` | ❌ assente |
| **URL Production nel manifest Shopify** | `shopify.app.toml` punta ancora a `https://example.com` | ❌ assente |
| **`BILLING_TEST=false` in Production** | variabile non definita: ogni addebito è di prova | ❌ assente |
| **Secret Production separati** | `SHOPIFY_API_SECRET`, `SESSION_ENCRYPTION_KEY` e `TRIAL_LEDGER_HMAC_KEY` Production da generare | ❌ assente |
| Function API `2026-07` stabile e rigenerata | fonte Shopify del 3 agosto 2026: stabile dal 1º luglio 2026, accessibile fino al 16 luglio 2027. Schema rigenerato con CLI 4.6.0, identico al committato a meno della formattazione | ✅ |
| **Checkout reali ripetuti sulla Function** | nessuno in questa sessione; è anche il gate di M10 | ❌ assente |
| **Screenshot della listing** | piano e didascalie pronti in [`screenshots.md`](../listing/screenshots.md); nessun file prodotto | ❌ assente |
| **Demo screencast** | copione pronto in [`screencast-script.md`](../listing/screencast-script.md); nessuna ripresa | ❌ assente |
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
segnaposto. **Il deploy che rende effettiva questa sostituzione non è ancora
stato eseguito.**

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
