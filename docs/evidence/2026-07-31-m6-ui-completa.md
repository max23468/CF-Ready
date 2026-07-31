# Operazioni Development M6 — UI completa

**Data:** 31 luglio 2026 · **Ambiente:** Development. Registra gli snapshot
rilasciati durante la milestone, i gate live eseguiti sul dev store e i residui
dichiarati. La numerazione segue il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md) §19.5: `0.4.0` apre
la milestone e ogni snapshot successivo incrementa la patch.

## Snapshot rilasciati

Nessuno di questi deploy ha richiesto backup: la sola migrazione della
milestone aggiunge colonne con default e non altera dati esistenti.

| Versione | Commit | Worker | Versione Shopify | Workflow |
| --- | --- | --- | --- | --- |
| `0.4.0` | `ae19f1a` | `0a6c98d1-632e-4386-95d2-98cc1b60613d` | `1071432957953` | `30617900510` |
| `0.4.1` | `4c38091` | `9f08d243-c1c5-4db2-b380-faa772a8189f` | `1071550791681` | `30623646274` |
| `0.4.2` | `5bd3302` | `cfcc4887-5ca7-40aa-84b6-e453acddaf2e` | `1071618555905` | `30626769265` |
| `0.4.3` | `62bb764` | `673b9df5-6925-41c8-9243-956fbfe69936` | `1071649128449` | `30628351454` |
| `0.4.4` | `bc1765d` | `519facba-2e06-41e2-8dc9-7e3216b7ce38` | `1071729770497` | `30632461744` |
| `0.4.5` | `8613e32` | `1b989d1a-597f-432e-a5b8-88f5eef192b1` | `1071744122881` | `30633183453` |
| `0.4.6` | `efcae31` | `9c1cbe84-bd9d-48f2-bd80-dcd77a9420a2` | `1071765028865` | `30634233705` |
| `0.4.7` | `1ac8722` | `c844c9d4-e169-4189-8c68-80fd5a067237` | `1071787180033` | `30635363826` |
| `0.4.8` | `e429594` | `50fea34d-9fa1-4667-9f01-bbeece9bb7d0` | `1071802646529` | `30636125268` |
| `0.4.9` | `0fc7f1d` | `93537210-746e-449b-af59-8f860b781a24` | `1071823749121` | `30637179734` |
| `0.4.10` | `5f780e6` | `d4c5ba2a-3c9a-44ea-9327-2649bfee88e0` | `1071842459649` | `30638136124` |
| `0.4.11` | `8bcfc70` | `955a7926-0b2b-455e-b6e6-053ff9a6d185` | `1071867035649` | `30639554463` |
| `0.4.12` | `114586b` | `92d28fd2-1dc4-417f-8339-67e63557175a` | `1071889514497` | `30640809528` |
| `0.4.13` | `c621046` | `0fe74add-1b03-4a4b-8eb2-854da22b1048` | `1071898198017` | `30641382862` |

Il rollback di ogni riga è la versione Worker della riga precedente, e per
Shopify lo snapshot precedente.

### Migrazione D1

Applicata prima del deploy della `0.4.0`, con il Worker `0.3.6` ancora in
esecuzione.

| Voce | Valore |
| --- | --- |
| Database | `cf-ready-db-dev` (`9490eaea-3a12-465d-bb48-e2622b31fc4d`) |
| Migrazione | `0007_onboarding.sql`, 5 comandi |
| Bookmark pre-migrazione | `00000035-00000000-000050b9-b4dad325c9149397fa8a2ded0de00108` |
| Stato precedente | 6 migrazioni applicate, 1 store, 1 riga `app_state`, 1 sessione |
| Readback | quattro colonne presenti, dati intatti, `onboarding_status` a `not_started` |

`ALTER TABLE ADD COLUMN` con default: il Worker allora attivo inseriva in
`app_state` con lista colonne esplicita, quindi ha continuato a funzionare
nell'intervallo fra migrazione e deploy. Rollback: `DROP COLUMN` sulle quattro
colonne e rimozione della riga in `d1_migrations`; nessun dato applicativo
andrebbe perso.

### Un'etichetta non corrispondente

La versione Worker `269e2036-977d-4a7d-9587-7d2e45ec9c9c` porta il messaggio
`Release 0.4.1` ma contiene il codice della `0.4.0`: il deploy è stato lanciato
prima di accorgersi che la merge non era passata. Il codice era identico a
quello già attivo, quindi nessun effetto sullo store, ma la versione resta in
cronologia con un'etichetta sbagliata e non va usata come riferimento. La
`0.4.1` reale è `9f08d243`.

## Gate live sul dev store

Eseguiti dall'owner sullo store `cf-ready-dev.myshopify.com` lungo tutta la
milestone, uno per snapshot rilasciato. Hanno prodotto i difetti corretti nelle
patch da `0.4.1` a `0.4.13`, fra cui: la conferma di disattivazione senza
pulsanti, le azioni della Home non rese, il Save Bar che non si spegneva
tornando sui propri passi, il titolo dell'app che portava al form di accesso,
il blocco Piano rimasto in italiano nell'interfaccia inglese, e la spaziatura
disuguale fra le due colonne.

Verificati direttamente sull'Admin: navigazione fra le pagine, coerenza dello
stato in Home, salvataggio che non attiva né disattiva, rilevamento del
conflitto fra due schede, avviso e dichiarazione sul campo “Interno”,
anteprima che si aggiorna al cambio delle regole, ripristino dei testi
predefiniti per lingua, interfaccia inglese con importi e date localizzati.

Restano non verificabili su questo store, per stato commerciale: gli avvisi di
prova a sette, tre e ultimo giorno, la data del primo addebito, l'etichetta
`Consigliato` sull'annuale e la cancellazione del rinnovo. Lo store ha un
pagamento unico attivo. Sono coperti dai test automatici e la verifica reale
appartiene a M10, sul canary.

## E2E di §23.10

La matrice di §23.10 elenca diciannove scenari da eseguire in un browser dentro
l'Admin Shopify. Un'automazione richiederebbe una sessione staff autenticata e
un'infrastruttura browser che il repository oggi non ha: introdurla è una
decisione di dipendenza da prendere a parte, non un dettaglio di questa
milestone.

Gli scenari sono stati eseguiti **manualmente** dall'owner sul dev store, uno
per snapshot rilasciato, e i difetti emersi sono elencati sopra. I casi non
riproducibili sullo store — stati commerciali e store non italiano — restano
coperti dai test automatici e dichiarati come residui, il secondo già registrato
negli Open items §34.7.

## Residui dichiarati

| Residuo | Dove si chiude |
| --- | --- |
| Modulo di supporto e casella verificata: la Guida rimanda a un contatto non ancora attivo | M7 |
| Link alla gestione nativa Shopify nella pagina Piano: percorso non documentato | quando Shopify lo documenta |
| Nomi dei piani in italiano nella fattura Shopify | decisione commerciale dell'owner |
| Automazione degli E2E di §23.10 | decisione di dipendenza, da prendere a parte |
| Stati commerciali non riproducibili sul dev store | M10, canary |
