# Rilascio Development M5

**Data:** 30 luglio 2026 · **Ambiente:** Development · **Release:** `0.3.0`.

Ordine seguito: merge del codice, bump di versione, migrazioni D1, deploy del
Worker, snapshot Shopify. Le tabelle nuove non sono referenziate dal Worker
precedente, quindi applicarle prima è sicuro.

## Migrazioni D1

| Voce | Valore |
| --- | --- |
| Database | `cf-ready-db-dev` (`9490eaea-3a12-465d-bb48-e2622b31fc4d`) |
| Migrazioni | `0004_trials`, `0005_trial_ledger`, `0006_billing` |
| Bookmark Time Travel | `00000020-00000000-000050b8-6b94b3e028723b07d94f9ef44acfeaf0` |
| Readback | `trials`, `trial_ledger`, `billing_accounts`, `billing_events` presenti |
| Dati preesistenti | 1 riga in `shops`, 1 in `shopify_sessions`, 1 in `app_state` |

Rollback: `DROP TABLE` delle quattro tabelle e delle righe corrispondenti in
`d1_migrations`. Nessun dato applicativo esistente verrebbe perso.

## Deploy

| Voce | Valore |
| --- | --- |
| Sorgente runtime | `1caabc5` (PR #67 e #68) |
| Versione Worker attiva | `25af30df-4ae1-4f8c-b844-c819412a0e40` |
| Rollback Worker | versione `33331e71-0d5a-475d-90f7-24d3188f0cc8` |
| Versione Shopify attiva | `0.3.0`, `gid://shopify/Version/1070657568769` |
| Rollback Shopify | versione `0.2.1` |
| Workflow | `Deploy Development` run `30562130950` |

Lo snapshot registra il topic `app_subscriptions/update`, aggiunto da M5.

## Smoke

| Prova | Esito |
| --- | --- |
| `GET /` | `302` verso `/auth/login` |
| `POST` sulle cinque rotte webhook senza HMAC | `400`, nessuna elaborazione |

Gli addebiti restano in modalità di prova: `BILLING_TEST` non è valorizzata e il
valore predefinito è `true`. Portarla a `"false"` è una voce del preflight
Production.

## Gate M5 non ancora eseguiti

Richiedono azioni dell'owner sul dev store con addebiti di test:

- sottoscrizione durante la prova, con verifica dei giorni residui;
- cambio fra mensile e annuale;
- passaggio a una tantum, con abbonamento cancellato solo dopo l'acquisto;
- acquisto abbandonato che lascia l'abbonamento invariato;
- cancellazione ordinaria con accesso fino a fine periodo.

Nessun diritto deve risultare concesso al ritorno da Shopify prima della
riconciliazione: il readback in D1 lo rende osservabile.
