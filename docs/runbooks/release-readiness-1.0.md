# Release readiness `1.0`

Record richiesto da §24.9 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md). Non ripete i
requisiti: collega, per ogni gate bloccante, la prova che lo sostiene.

**Una casella spuntata senza link, ID o risultato osservato non è readiness.**
Dove la prova non esiste ancora, la riga dice «assente» e resta assente finché
qualcuno non la produce. Le righe marcate ⚠️ riportano una dichiarazione
dell'owner su qualcosa che vive fuori dal repository: valgono come impegno, non
come verifica, e chi legge deve poterle distinguere dalle altre. Una verifica
manuale live è invece marcata ✅ soltanto quando registra data, target esatto e
risultato osservato. Le righe si aggiornano nella stessa modifica che produce la
prova.

**Stato complessivo: M10 chiusa sul canary reale Numisleo.** La `0.9.40` è
stata distribuita e riletta live in Chrome: la Home usa un testo generico sui
prossimi ordini, senza richiedere transazioni create appositamente per il test.
La review è approvata e la listing bilingue è
pubblicata con visibilità limitata. La submission è partita il 4 agosto
2026; il 10 agosto Shopify l'ha sospesa sui requisiti 1.2.2 e 2.1.1 perché il
piano approvato non risultava attivo e l'azione checkout restava disabilitata
(riferimento `128156`). La `0.9.20` ha corretto la lettura billing che causava
entrambi i sintomi, è stata promossa con la PR
[#257](https://github.com/max23468/CF-Ready/pull/257), distribuita e riletta dal
run Production [31410532325](https://github.com/max23468/CF-Ready/actions/runs/31410532325),
quindi pubblicata come release
[`v0.9.20`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.20). L'ultimo
snapshot M9 è la `0.9.22`: candidato `f338f63`, promozione Production
[#272](https://github.com/max23468/CF-Ready/pull/272), merge commit `2c5bc8f`,
deploy [32648669434](https://github.com/max23468/CF-Ready/actions/runs/32648669434)
e release [`v0.9.22`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.22).
Il 23 agosto 2026 il Partner Dashboard mostra l'app e la listing in stato
`Published`, con visibilità limitata e URL diretto
`https://apps.shopify.com/cf-ready`; italiano primario e inglese sono entrambi
`Live` sotto «Lingue pubblicate» e non resta alcuna lingua non pubblicata. Il
readback ha verificato anche feature media, cinque screenshot desktop e alt
text localizzati in entrambe le listing. L'email ufficiale dello Shopify App
Store Team ricevuta dall'owner conferma approvazione e pubblicazione come
applicazione listata, stato `Published`, visibilità limitata, lo stesso URL e il
riferimento `128156`; i link di tracciamento dell'email non sono conservati nel
repository. L'accesso del reviewer non è più un gate mancante ma una decisione
registrata (D-132). La `0.9.40`, commit `bd80fb7`, è attiva in Production e
sullo store dell'owner; il readback del 25 agosto conferma concessione omaggio
D-135 attiva, assenza di charge e rinnovi, onboarding completato, Validation
attiva e zero errori monitorati. M10 non crea ordini, clienti o pagamenti artificiali sullo store reale:
usa prove automatiche, ricognizione non transazionale e osservazione passiva
dei soli ordini autentici, come registrato nella
[ricevuta M10](../evidence/2026-08-25-m10-canary-numisleo.md).
La navigazione embedded della `0.9.11` è stata verificata in Chrome sullo store
`cf-ready-dev`: una sola voce Home e tutti i flussi primari dentro l'Admin.

---

## 1. Candidato

| Voce | Valore |
| --- | --- |
| Versione candidata verificata | `0.9.40` |
| Commit candidato | `bd80fb745c1bfab83dfbf730142e83e3b7da3777`, commit Production verificato dal run [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670) |
| Branch | `main`; promozione [#314](https://github.com/max23468/CF-Ready/pull/314) unita con merge commit a due parent e deploy Production completato sul commit candidato |
| Ultimo snapshot Development provato | `0.9.40`, commit `018d188a568c185ef31295eb4b84b6d1232f5030`, run [32786444195](https://github.com/max23468/CF-Ready/actions/runs/32786444195); gate, migrazioni, capacità, Worker e Shopify verificati prima della promozione |
| Submission | approvata: il Partner Dashboard mostra app e listing `Published`, con italiano e inglese `Live`, il 23 agosto 2026 |
| Tag `v1.0.0` | non creato: si crea dopo deploy, smoke e readback Production riusciti della `1.0.0` |

### Ricevuta del deploy Production `0.9.40`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.40`, commit `bd80fb745c1bfab83dfbf730142e83e3b7da3777` |
| Worker | deployment `21f591be-4d20-4722-98b7-e66ed9b74755`, versione `dbc15dfb-3d8c-4d73-961b-8de3e6601094`, 100% del traffico |
| Migrazioni | dodici migrazioni applicate; nessuna migrazione pendente al readback |
| Run | [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670) |
| Gate, smoke e readback | `npm run check`, build Production, preflight, Worker, smoke e readback Shopify riusciti |
| Shopify | versione `0.9.40` attiva (`1101700857857`), commit verificato |
| Release | [`v0.9.40`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.40), pubblicata sul commit candidato dopo deploy e readback riusciti |
| Rollback | snapshot Production coordinato `0.9.39` registrato prima delle scritture provider |

### Ricevuta del deploy Production `0.9.39`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.39`, commit `15655a60642c33b755900c41d2228696a7044cb1` |
| Migrazioni | `0012_complimentary_entitlements.sql` applicata; nessuna migrazione pendente al readback |
| Run | [32781055852](https://github.com/max23468/CF-Ready/actions/runs/32781055852) |
| Gate, smoke e readback | `npm run check`, preflight, Worker, smoke e readback Shopify riusciti |
| Shopify | versione `0.9.39` attiva (`1101646659585`), commit verificato |
| Release | [`v0.9.39`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.39), pubblicata dopo deploy e readback riusciti |

### Ricevuta del deploy Production `0.9.22`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.22`, merge commit `2c5bc8f`; candidato `f338f63` |
| Worker | deployment `5d286e6a-6a50-45d5-86fc-aeb72cdca827`, versione `6d7368a8-2862-4b45-bfeb-534f69f25297`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [32648669434](https://github.com/max23468/CF-Ready/actions/runs/32648669434) |
| Smoke e readback | Worker raggiungibile; deployment, commit e traffico riletti dopo il deploy |
| Shopify | versione `0.9.22` attiva (`gid://shopify/Version/1099955142657`), commit verificato |
| Release | [`v0.9.22`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.22), pubblicata dopo deploy e readback riusciti |
| Rollback | Worker deployment `d3386938-af5c-4807-b5b8-270a49fc1b40`, versione `a0cc71cb-b33a-4c6e-a491-22832efe91fe`; Shopify `0.9.20` |

### Ricevuta del deploy Production `0.9.20`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Production: `wrangler.json` env `production`, `shopify.app.toml` |
| Versione repository e commit | `0.9.20`, merge commit `4d7fc4c`; codice candidato `9bbd438` |
| Worker | deployment `d3386938-af5c-4807-b5b8-270a49fc1b40`, versione `a0cc71cb-b33a-4c6e-a491-22832efe91fe`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31410532325](https://github.com/max23468/CF-Ready/actions/runs/31410532325) |
| Smoke e readback | Worker raggiungibile; deployment, commit e traffico riletti dopo il deploy |
| Shopify | versione `0.9.20` attiva (`gid://shopify/Version/1083299561473`), commit verificato |
| Release | [`v0.9.20`](https://github.com/max23468/CF-Ready/releases/tag/v0.9.20), pubblicata dopo deploy e readback riusciti |
| Rollback | snapshot coordinato `0.9.19`, registrato prima del deploy |

### Ricevuta del deploy Development `0.9.18`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.18`, commit `2af7843` |
| Worker | deployment `3862505e-262d-4d92-aafc-5dd7c6eb7020`, versione `22c91218-1aee-42eb-a67d-809c105ffbf1`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31166490429](https://github.com/max23468/CF-Ready/actions/runs/31166490429) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 17 ms, 0 errori |
| Shopify | versione `0.9.18` attiva (`gid://shopify/Version/1079963516929`), commit verificato |
| Rollback | snapshot coordinato `0.9.17`, commit `0d83c47`, verificato prima del deploy |

### Ricevuta del deploy Development `0.9.17`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.17`, commit `0d83c47` |
| Worker | deployment `51d2a9bb-64ae-462b-b094-0e7dc9db7bdf`, versione `ac215315-85b7-4cdd-b84b-8393af494292`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31164473236](https://github.com/max23468/CF-Ready/actions/runs/31164473236) |
| Smoke e capacità | Worker raggiungibile; 115 richieste, CPU p95 2 ms, massimo 4 ms, 0 errori |
| Shopify | versione `0.9.17` attiva (`gid://shopify/Version/1079922720769`), commit verificato |
| Rollback | snapshot coordinato `0.9.16`, commit `1d9f001`, verificato prima del deploy |

### Ricevuta del deploy Development `0.9.16`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.16`, commit `1d9f001` |
| Worker | deployment `012bf36e-b2b1-473c-ad91-e5c637fd4a86`, versione `c8ade09b-0846-46c3-8cd7-b31d1e04ec3d`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31163570208](https://github.com/max23468/CF-Ready/actions/runs/31163570208) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 2 ms, 0 errori |
| Shopify | versione `0.9.16` attiva (`gid://shopify/Version/1079908040705`), commit verificato |
| Rollback | snapshot coordinato `0.9.15`, commit `b82c3b9`, verificato prima del deploy |

Il primo tentativo, run
[31163291264](https://github.com/max23468/CF-Ready/actions/runs/31163291264),
si è fermato prima di Shopify perché il tail Cloudflare non era pronto entro 60
secondi e ha ripristinato con successo lo snapshot coordinato `0.9.15`.

### Ricevuta del deploy Development `0.9.15`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.15`, commit `b82c3b9` |
| Worker | deployment `07fcf015-561a-4da0-8f75-9703fb1e8f83`, versione `cfab7a67-786d-4332-b6fb-ef3782a69140`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31162391439](https://github.com/max23468/CF-Ready/actions/runs/31162391439) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 2 ms, massimo 3 ms, 0 errori |
| Shopify | versione `0.9.15` attiva (`gid://shopify/Version/1079886086145`), commit verificato |
| Rollback | snapshot coordinato `0.9.14`, commit `f81093c`, verificato prima del deploy |

### Ricevuta del deploy Development `0.9.14`

| Campo | Valore |
| --- | --- |
| Ambiente e configurazione | Development: `wrangler.json`, `shopify.app.dev.toml` |
| Versione repository e commit | `0.9.14`, commit `f81093c` |
| Worker | deployment `8f2008c1-d151-4032-9b81-87d71dee1880`, versione `4dd3e54e-22f7-49de-95de-fd55156667f8`, 100% del traffico |
| Migrazioni | nessuna pendente, confermato dal readback remoto |
| Run | [31160317539](https://github.com/max23468/CF-Ready/actions/runs/31160317539) |
| Smoke e capacità | Worker raggiungibile; 120 richieste, CPU p95 1 ms, massimo 3 ms, 0 errori |
| Shopify | versione `0.9.14` attiva (`gid://shopify/Version/1079846797313`), commit verificato |
| Rollback | snapshot coordinato `0.9.13`, commit `f16d25b`, verificato prima del deploy |

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
| Gate locale completo `npm run check` | run Production [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670), commit `bd80fb7` | ✅ |
| Test della Validation Function | `npm run test:function`, 109 test | ✅ |
| E2E pubblici | job `e2e` della PR [#216](https://github.com/max23468/CF-Ready/pull/216), run `30952011063`: WebKit e Chromium verdi | ✅ |
| Snapshot Development verificato | run [32786444195](https://github.com/max23468/CF-Ready/actions/runs/32786444195): `0.9.40`, commit `018d188`; gate completo, migrazioni, Worker, capacità, Shopify e readback verdi | ✅ |
| Deploy Pages Production e smoke | run `30743184121`, otto URL e header di sicurezza | ✅ |
| Rollback Pages esercitato e letto | run `30741094451` | ✅ |
| Backup D1 Production e restore | run `30769584725`: export cifrato, restore locale di 32 comandi, `integrity_check=ok`, readback dello slot R2 | ✅ |
| Security audit e manutenzione provider | run `30749648119`, entrambi i job verdi | ✅ |
| Audit pre-submission App Store | [audit aggiornato il 4 agosto 2026](../audits/2026-08-03-app-store-pre-submission.md), 31 requisiti locali probabilmente conformi | ✅ |
| Audit Built for Shopify | [audit del 5 agosto 2026](../audits/2026-08-05-built-for-shopify-readiness.md): integrazione, UI, accessibilità, materiali e matrice checkout | ⚠️ metriche differite separate |
| Migrazioni D1 Development | migrazione `0012_complimentary_entitlements.sql` applicata e nessuna pendente al readback del run [32779854802](https://github.com/max23468/CF-Ready/actions/runs/32779854802) | ✅ |
| Migrazioni D1 Production | dodici migrazioni versionate applicate e nessuna pendente nel readback del run [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670) | ✅ |
| `noindex` sui documenti legali | verificato **live** dopo il deploy del 3 agosto 2026: i quattro percorsi rispondono `X-Robots-Tag: noindex`, la Home, l'assistenza e la Home inglese no | ✅ |
| Iniezione dell'identità del titolare | verificata **live**: Privacy e Termini, IT ed EN, dichiarano il nome della persona fisica titolare e nessuna pagina pubblica contiene ancora il segnaposto. Il segnaposto nei sorgenti è protetto da un test in `scripts/check-docs.node-test.mjs` | ✅ |
| Configurazione Worker Production | `wrangler.json` env `production`: Worker `cf-ready-prod`, D1 `cf-ready-db-prod`, `ALLOWED_SHOP` vuota, addebiti reali | ✅ |
| Worker Production distribuito | versione `0.9.40`, run [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670), commit `bd80fb7`; deployment `21f591be-4d20-4722-98b7-e66ed9b74755`, smoke e readback riusciti | ✅ |
| URL Production nel manifest Shopify | `shopify.app.toml` punta a `https://cf-ready-prod.tmsf.workers.dev`, con aggiornamento automatico degli URL vietato | ✅ |
| **`BILLING_TEST=false` in Production** | `wrangler.json` env `production` la definisce a `"false"` ed è effettiva sul Worker dalla `0.9.6` (D-129): gli addebiti dei merchant sono reali | ✅ |
| Secret Production separati | tre secret runtime caricati sul Worker `cf-ready-prod` il 4 agosto 2026; il preflight li verifica a ogni deploy | ✅ |
| Versione attiva dell'app CF Ready | Production `0.9.40`, ID `1101700857857`, commit `bd80fb7`, readback del run [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670) | ✅ |
| Navigazione embedded D-130 | verificata in Chrome il 5 agosto 2026 sullo store `cf-ready-dev` con la Production `0.9.11`: una sola Home e route primarie dentro l'Admin | ✅ |
| Function API `2026-07` stabile e rigenerata | fonti Shopify rilette il 25 agosto 2026: stabile dal 1º luglio 2026, accessibile fino al 16 luglio 2027. Precheck M11 con CLI 4.7.0 e `npm run verify:function-schema`: schema semanticamente identico al committato | ✅ precheck M11 |
| **Matrice server-side della Function** | `npm run test:function` sull'HEAD Production `0.9.40`: 109 test verdi; casi geografici, senza spedizione, ritiro, misto ed entitlement in abbonamento nella [ricevuta M10](../evidence/2026-08-25-m10-canary-numisleo.md) | ✅ |
| **Riconferma schema sul candidato `1.0.0`** | ripetere `npm run verify:function-schema`, typegen, fixture e build sull'HEAD esatto del candidato M11; il [precheck di avvio](../evidence/2026-08-25-m11-controlled-launch.md) non sostituisce questa prova | ⛔ M11 bloccante, non eseguita sul candidato |
| **Checkout reale prima di `1.0.0`** | osservare un ordine nato organicamente sul canary, idoneo a una regola italiana attiva, e confermare esecuzione ed esito atteso della Function; non creare ordini, clienti, prodotti o pagamenti artificiali | ⛔ M11 bloccante, in attesa di un ordine organico idoneo |
| Listing nel Partner Dashboard | readback manuale live del 23 agosto 2026 sull'app Production CF Ready (`403321946113`): stato `Published`, visibilità limitata e URL diretto `https://apps.shopify.com/cf-ready`; italiano primario e inglese entrambi `Live` sotto «Lingue pubblicate», nessuna lingua non pubblicata | ✅ M9 chiusa |
| Conferma Shopify App Store | email ufficiale dello Shopify App Store Team ricevuta dall'owner il 23 agosto 2026: app approvata e pubblicata come applicazione listata; nome `CF Ready - Codice Fiscale`, stato `Published`, visibilità limitata, URL `https://apps.shopify.com/cf-ready`, riferimento `128156` | ✅ |
| Screenshot della listing | readback manuale live del 23 agosto 2026: feature media e cinque screenshot desktop presenti nelle listing italiana e inglese; la serie italiana è riutilizzata in inglese con cinque alt text localizzati. File esclusi dal repository per decisione dell'owner; piano e testi in [`screenshots.md`](../listing/screenshots.md) | ✅ |
| Demo screencast | registrato, **dichiarato dall'owner il 4 agosto 2026**. Non entra nel repository: il copione resta in [`screencast-script.md`](../listing/screencast-script.md), aggiornato all'avvio esplicito della prova | ⚠️ dichiarato, non verificato da qui |
| Contatto tecnico d'emergenza | requisito 4.5.6: registrato dall'owner nelle impostazioni dell'account Partner il 4 agosto 2026 | ✅ |
| Accesso del reviewer | nessuno store né credenziali forniti: l'app dichiara di non richiedere un account e le istruzioni chiedono l'installazione su un development store italiano (D-132). Il 4.5.5 è condizionale e non si applica; lo store preinstallato è un requisito delle sole Payment app (5.2.1) | ✅ deciso |
| **Canary su store reale** | [ricevuta M10](../evidence/2026-08-25-m10-canary-numisleo.md): installazione, piano Basic, Validation, omaggio, matrice automatica, ricognizione non transazionale, monitoraggio, Home `0.9.40`, marchio e contrasto verificati live in Chrome senza creare ordini | ✅ M10 chiusa |

## 3. Configurazioni e API validate

| Voce | Valore verificato |
| --- | --- |
| Function API | `2026-07`, pinnata in `extensions/cf-ready-validation/shopify.extension.toml`, riconfermata stabile il 25 agosto 2026 |
| Admin GraphQL API | `2026-07` |
| Webhook API version | `2026-07` |
| Access scope | `write_validations`, unico |
| Target Function | `cart.validations.generate.run` |
| `blockOnFailure` | `false`, verificato dopo ogni update |
| Compatibility date Worker | `2026-08-22`, massima data supportata dal `workerd` incluso nella toolchain Cloudflare latest; migrazione runtime M11 da verificare in Development prima della promozione Production |

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
| Wallet non tutti disponibili nello stesso browser | M10 chiusa con matrice server-side automatica e ricognizione delle superfici disponibili; Apple Pay resta un'osservazione non bloccante su Safari/dispositivo compatibile |

## 6. Autorizzazioni operative

L'avanzamento di M9, da solo, non autorizza azioni remote. Una richiesta
affermativa di pubblicazione autorizza deploy e promozione tecnici applicabili;
submission App Store e attivazione billing richiedono sempre un'autorizzazione
esplicita e distinta dell'owner al momento dell'esecuzione.

| Azione | Stato |
| --- | --- |
| Deploy Worker Production | `0.9.40`, eseguito e verificato dal run [32786987670](https://github.com/max23468/CF-Ready/actions/runs/32786987670) |
| Promozione `develop` → `main` | `0.9.40` unita con [#314](https://github.com/max23468/CF-Ready/pull/314), merge commit `bd80fb7` a due parent |
| Submission App Store | autorizzata ed eseguita il 4 agosto 2026; review approvata e listing bilingue `Published` verificata il 23 agosto 2026 |
| Attivazione billing reale | autorizzata e attiva in Production dalla `0.9.6` |
| Passaggio della listing a visibilità completa | M12, non autorizzato |
