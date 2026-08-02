# M8 — Hardening

Questa ricevuta collega ogni riga della matrice operativa M8 a una prova
ripetibile o a un controllo manuale già osservato. Non estende il perimetro a
Production Worker/Shopify, App Store, checkout o canary.

## Superfici pubbliche

| Riga | Prova | Esito |
| --- | --- | --- |
| Sito pubblico IT/EN, lingua, skip link, landmark e CTA | `tests/e2e/site.spec.ts`, WebKit 390×844 e 1440×900 | automatizzata in `npm run test:e2e` |
| Supporto, Privacy e Termini IT/EN | `tests/e2e/site.spec.ts` | sei route automatizzate |
| Login IT/EN, errore vuoto e ordine focus | `tests/e2e/login.spec.ts`, Chromium 390×844 e 1440×900 | automatizzata in `npm run test:e2e` |

## Admin embedded

| Riga | Prova | Esito o limite |
| --- | --- | --- |
| Prima installazione, onboarding, completa senza attivare e riapertura | `tests/lifecycle.test.ts`, `tests/i18n.test.ts`, ricevuta M6 | copertura automatica; la prima installazione non è stata ripetuta in M8 perché richiede disinstallazione |
| Home, Regole, Messaggi e Guida | PR #172 sullo snapshot Development `0.8.3` | aperte nell'Admin embedded |
| Save Bar/Annulla, radio e anteprima | PR #172 e test UI; difetto osservato corretto nella `0.8.4` | verificato |
| Tab lingua e reset separato | PR #172, PR #173, `tests/i18n.test.ts`, `tests/messages-ui.test.ts` | reset reale corretto e riprovato nella `0.8.5` |
| Attivazione e disattivazione Validation | PR #172 | ciclo reale concluso con Validation attiva |
| Errore sync e riparazione fail-open | `tests/validation.test.ts`, `tests/lifecycle.test.ts`, `tests/home-billing-actions.test.ts` | prova automatica; nessun guasto remoto indotto |
| Store non italiano | `tests/lifecycle.test.ts` | prova automatica |
| Prova 7/3/1/0, billing e scadenza | `tests/i18n.test.ts`, `tests/billing.test.ts` | prova automatica |
| Reinstallazione entro 90 giorni e retention | `tests/session-storage.test.ts`, `tests/lifecycle.test.ts` | prova automatica |
| Locale italiana, inglese e fallback | `tests/i18n.test.ts` | prova automatica |
| Tastiera e viewport embedded | ricevuta M6 e PR #172 | tastiera osservata; stretto/largo già chiusi in M6 |

## Ricevute operative

- Pages Production: run `30741094451`, rollback esercitato e letto; run
  `30743184121`, deploy/readback/smoke verdi.
- Sicurezza e provider Development: run `30749648119`, entrambi i job verdi.
- Snapshot Development `0.8.6`: run `30768120300`, gate, capacità, Worker,
  Shopify e readback verdi; 120 richieste, CPU p95 1 ms, massimo 2 ms.
- D1 Production inizializzato con le dieci migrazioni versionate, readback senza
  migrazioni pendenti e 11 tabelle applicative/operative; nessun deploy Worker o
  Shopify Production.
- Backup D1 Production: run `30769584725`, export cifrato senza URL firmato nei
  log, restore locale di 32 comandi, `integrity_check=ok`, slot settimanale R2
  con readback remoto riuscito.

Il backup R2 Production usa una corsia separata autorizzata e registra la
propria ricevuta nel riepilogo GitHub del workflow.
