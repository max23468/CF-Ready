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
| `0.4.14` | `71e6a6c` | `4ecbf652-8118-4c5a-bc7b-54a90cd83b79` | `1072105848833` | `30654891748` |
| `0.4.15` | `a8c606f` | `f4c7788e-c208-400c-9fad-efde7a1b73e7` | `1072116105217` | `30655705611` |
| `0.4.16` | `427ae55` | `80412182-72dd-4b23-8e2f-82593c39fe09` | `1072130654209` | `30656638831` |
| `0.4.17` | `0f03a37` | `7ecf5691-c10b-48de-aa52-a87a5985838a` | `1072141959169` | `30657284427` |
| `0.4.18` | `91fa954` | `21c7ff7b-adba-4b8e-a9ed-fb2bbb425a60` | `1072153165825` | `30658192024` |
| `0.4.19` | `488ebed` | `9128599c-0ace-4b30-a839-546b838e655e` | `1072164962305` | `30658975959` |
| `0.4.20` | `a46ff27` | `9e98abf9-31d2-4119-b92f-331da8a6b4a9` | `1072177119233` | `30659886865` |
| `0.4.21` | `d497179` | `2b13a7ef-b10d-4ccc-963c-f63ed7652689` | `1072184786945` | `30660443646` |
| `0.4.22` | `6bb01d3` | `1814626e-c044-4645-8cf1-0a57b9598ca8` | `1072742957057` | `30704039699` |
| `0.4.23` | `f13c14c` | `a310b057-7eb7-4066-992a-2a1e1e74c17a` | `1072789684225` | `30707318436` |
| `0.4.24` | `6e931c9` | `062372ef-91e8-4255-b00e-fd73bc83844b` | `1072798892033` | `30707986047` |
| `0.4.25` | `31939bc` | `063256eb-5905-4f2e-ba28-aff24e3294e3` | `1072804790273` | `30708276253` |
| `0.4.26` | `3ca5d5e` | `b0fc6149-42b3-41a5-9383-bebee6313063` | `1072810622977` | `30708633016` |
| `0.4.27` | `75468e3` | `7da7f2b0-26dc-4089-92a7-38c16e4857f3` | `1072819339265` | `30709246370` |
| `0.4.28` | `8da4bd1` | `ef113a64-8388-4cef-afa8-905d96e9a5e3` | `1072828383233` | `30709857755` |

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
nell'intervallo fra migrazione e deploy. All'epoca, prima di usare le colonne,
era possibile eliminarle insieme alla riga in `d1_migrations`; non è una
procedura valida sullo schema corrente. Il rollback ordinario ripristina il
Worker compatibile e usa una nuova migrazione forward-fix; Time Travel resta
riservato a corruzione o perdita.

### Migrazione D1 `0008`

Il workflow `30707318436` ha applicato
`0008_webhook_claim_ownership.sql` prima del Worker `0.4.23`: tre colonne e un
indice parziale, 5 comandi. Il readback remoto ha confermato zero migrazioni
pendenti. Non serviva un backup dedicato perché la migrazione è soltanto
additiva; un rollback del Worker usa la versione compatibile precedente e un
eventuale problema di schema richiede una migrazione forward-fix.

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
patch da `0.4.1` a `0.4.21`, fra cui: la conferma di disattivazione senza
pulsanti, le azioni della Home non rese, il Save Bar che non si spegneva
tornando sui propri passi, il titolo dell'app che portava al form di accesso,
il blocco Piano rimasto in italiano nell'interfaccia inglese, e la spaziatura
disuguale fra le due colonne. Gli ultimi otto snapshot hanno riguardato la
procedura guidata e la guida di configurazione: passi che saltavano o si
bloccavano, radio che sfarfallavano, la dichiarazione sul campo “Interno” che
non si salvava, e la schermata finale che non compariva pur avendo attivato la
validazione. Quasi tutti nascevano dallo stesso errore di fondo, il passo della
procedura tenuto in due posti insieme.

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

## Navigazione a quattro voci

La milestone si chiude con quattro pagine permanenti invece di cinque: `Piano e
fatturazione` è stata assorbita dalla Home, dove lo stato commerciale sta nella
colonna laterale e la scelta della modalità in quella principale. La decisione
è dell'owner ed è registrata in §15.2 e §15.6 del Master Plan e in §1.3, §8.3 e
§8.4 della Brand Foundation, che perdono il tetto dei blocchi e la regola di una
sola azione primaria per schermata limitatamente alla Home.

## E2E di §23.10

La matrice di §23.10 elenca diciannove scenari da eseguire in un browser dentro
l'Admin Shopify. Un'automazione richiederebbe una sessione staff autenticata e
un'infrastruttura browser che il repository oggi non ha: introdurla è una
decisione di dipendenza, rimandata a M8 insieme al perimetro proposto.

Gli scenari sono stati eseguiti **manualmente** dall'owner sul dev store, uno
per snapshot rilasciato, e i difetti emersi sono elencati sopra. I casi non
riproducibili sullo store — stati commerciali e store non italiano — restano
coperti dai test automatici e dichiarati come residui, il secondo già registrato
negli Open items §34.7.

## Residui dichiarati

| Residuo | Dove si chiude |
| --- | --- |
| Modulo di supporto e casella verificata: la Guida rimanda a un contatto non ancora attivo | M7 |
| Link alla gestione nativa Shopify nel blocco del piano: percorso non documentato | quando Shopify lo documenta |
| Nomi dei piani in italiano nella fattura Shopify | decisione commerciale dell'owner |
| Automazione degli E2E di §23.10 | M8, dove la decisione è stata registrata |
| Stati commerciali non riproducibili sul dev store | M10, canary |
