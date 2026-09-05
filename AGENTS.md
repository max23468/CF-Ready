# AGENTS.md

Regole operative condivise per questa repository. `CLAUDE.md` importa il file:
mantieni qui le regole comuni e non duplicarle altrove.

## Progetto e fonti

CF Ready è una public app Shopify per validare Codice Fiscale e PEC nei
localized fields del checkout italiano. Il target usa React Router e TypeScript
su Cloudflare Workers, Queues per il lavoro webhook durevole, D1 per dati e
sessioni, R2 per i backup, Pages per il sito pubblico e una Cart and Checkout
Validation Function. Non presentare un deliverable pianificato come già
implementato: codice, test e configurazioni provano lo stato corrente.

- `docs/plans/2026-07-28-CF-Ready-Master-Plan.md`: requisiti, decisioni,
  milestone e gate.
- `docs/adr/`: decisioni architetturali accettate.
- Codice, test e configurazioni: comportamento implementato.
- `README.md` e `package.json`: setup e comandi correnti.

Se le fonti contraddicono lo stesso fatto, correggi nella stessa modifica la
fonte canonica coinvolta senza nascondere il disallineamento.
I documenti non hanno versioni proprie e rimandano agli altri documenti per
percorso o sezione; la cronologia resta in Git.

## Invarianti di prodotto

- CF Ready gestisce esclusivamente Codice Fiscale e PEC. Partita IVA, Codice SDI,
  fatturazione elettronica, POS, modifiche al tema, Theme App Extension e
  Checkout UI Extension sono fuori perimetro.
- Usa `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`; non creare campi alternativi e non
  rinominare il campo “Interno”.
- Ogni campo ha tre modalità indipendenti: `unmanaged`, `optional`, `required`.
  Salvataggio delle regole e attivazione della Validation restano separati.
- La validazione è formale, non anagrafica: non attestare l’appartenenza di un
  Codice Fiscale o che una casella email sia realmente una PEC.
- Configurazione o entitlement incerti ed errori runtime devono essere
  fail-open. Un localized field obbligatorio assente blocca con errore globale
  soltanto quando Shopify espone almeno una consegna italiana; senza consegna
  osservabile resta fail-open. Un errore dell’app non blocca vendite legittime.
- Shopify è autorevole per Validation e billing; D1 conserva stato operativo,
  non una verità alternativa.
- Gestisci una sola Validation per store e non modificare risorse di altre app.
- Non ampliare scope, runtime, provider o dipendenze senza un requisito
  verificato e una decisione esplicita.

## Sicurezza e dati

- Non committare né stampare segreti, token, credenziali, `.env` reali, dati
  fiscali o personali. Verifica le env senza mostrarne il valore e usa fixture
  sintetiche.
- Valida HMAC, firma, stato o nonce ai confini Shopify. Webhook e callback
  ritentabili devono essere idempotenti.
- Per i webhook conserva l'ordine claim D1, consegna a Cloudflare Queues e ACK;
  gli errori durevoli passano dalla DLQ senza perdere o duplicare il lavoro.
- Mantieni lo scope Shopify minimo: non leggere ordini, clienti, prodotti o
  inventario senza un requisito approvato.
- Non inviare Codice Fiscale, PEC, dati checkout, nome o email dell'owner e altri
  dati merchant a log, telemetria o provider esterni; usa identificatori tecnici
  minimizzati. Fa eccezione soltanto la notifica Telegram privata dell'owner
  definita in D-134, che può includere nome pubblico e dominio tecnico dello store
  senza dati personali di owner o clienti né identificatori Shopify.
- Telemetria e prestazioni conservano soltanto esiti, durate e aggregati
  allowlistati. Attribuisci Web Vitals alla rotta e al `Server-Timing` acquisiti
  all'avvio del documento, senza contenuti merchant.
- Le migrazioni applicate sono immutabili. Preferisci forward-fix e non unire
  migrazioni distruttive a una release non verificata.

## Lavorare nel repository

- Inizia da `git status --short --branch -uall` e preserva le modifiche non tue.
- Per analisi, review o diagnosi, ispeziona e riferisci senza modificare. Per fix
  o implementazioni, applica le modifiche locali richieste e i controlli
  pertinenti.
- Prima di correggere un bug, individua la causa nel punto condiviso e aggiungi
  il test minimo che falliva prima del fix.
- Mantieni il diff stretto: niente refactor, compatibilità legacy, astrazioni,
  dipendenze o documenti non richiesti.
- Segui stile, naming e densità di commenti del codice vicino. Per la UI
  embedded usa Polaris e App Bridge Web Components prima di markup, CSS o stato
  custom.
- UI merchant e contenuti checkout sono bilingui dove previsto, con fallback
  inglese. Non lasciare copy parziale tra italiano e inglese.
- Aggiorna il Master Plan per decisioni di prodotto; usa un ADR per deviazioni
  architetturali stabili. README, script e configurazioni descrivono soltanto
  comandi e comportamento correnti.

## Verifica

| Corsia | Quando | Gate minimo |
| --- | --- | --- |
| `docs` | contenuti documentali senza effetto operativo | riferimenti e comandi citati, `npm run check:docs` |
| `standard` | TypeScript, route, config o test ordinari | test mirati, `npm run check:standard`, coverage ratchet e mutation applicabile |
| `full` | governance, workflow, auth, webhook, cifratura, migrazioni, manifest o lockfile | `npm run check`, coverage ratchet, mutation applicabile e regressione mirata |
| `promotion` | PR `develop` → `main` con ascendenza valida | provenienza, review, tree e gate esatti di `develop`, `promotion-guard` |
| `deploy` | provider, migrazioni, Worker, Function o Pages | gate completo, preflight, backup se serve, smoke, readback e rollback |

`npm run check` è il gate locale della corsia `full`; `coverage:check`, i gate
mutation condizionali e gli E2E restano controlli separati applicabili al diff.
Se una modifica cambia la misura della coverage, esegui
`npm run coverage:update`, verifica il report in `.coverage/global/` e includi
`config/coverage-baseline.json` nello stesso diff. Provider, database remoto,
browser e deploy richiedono prove fresche; un exit code `0` non dimostra da solo
lo stato live. Dichiara sempre i controlli non eseguiti.

Prima di ogni release Shopify verifica con il workflow lo schema Function API
`2026-07`. Se la modifica tocca Function, versione API, query o CLI, riconferma
il contratto nelle fonti Shopify correnti, rigenera con la CLI supportata e
ripeti fixture e checkout reali applicabili.

## Significato di `Pubblica`

Quando il proprietario, riferendosi alla repository o alla modifica corrente,
dice `Pubblica` o chiede in modo affermativo e inequivocabile di pubblicare,
autorizza l'intero ciclo tecnico applicabile. Domande, ipotesi, pianificazioni e
negazioni non costituiscono autorizzazione. L'agente non si ferma a stati
intermedi e completa tutti i passaggi applicabili: preparazione e verifiche,
branch e commit, versione e changelog quando richiesti, push, PR, soli gate
bloccanti, merge, tag e GitHub Release quando previsti, deploy o promozione
tecnica e verifica live. La sequenza concreta, in particolare tra versionamento,
merge, deploy e release, è quella definita dalla policy della repository.

La pulizia finale rimuove soltanto branch e worktree temporanei creati nel ciclo
corrente e già assorbiti; controlla stash e altri residui senza alterare elementi
preesistenti o estranei alla pubblicazione. Se un passaggio non è applicabile, lo
dichiara e prosegue con gli altri. La richiesta affermativa di pubblicazione
vale come autorizzazione a PR, merge, deploy tecnico e release previsti dal
ciclo, senza una seconda conferma. Non autorizza pubblicazione di temi Shopify
live, submission Shopify App Store, billing o nuove attivazioni produttive,
TestFlight o App Store, invii Aruba, email o scansioni reali, né aggiornamenti
Notion: queste azioni richiedono una richiesta esplicita separata. Una richiesta
riferita soltanto a una di queste azioni non avvia la pubblicazione della
repository. Non dichiarare `pubblicato` finché il ciclo applicabile e la
rilettura finale di PR, check, deploy, release e stato Git non sono completi.

## Ambienti, Git e operazioni remote

| Ambiente | ID | Branch | Uso |
| --- | --- | --- | --- |
| Development | `dev` | feature locali e `develop` | sviluppo e collaudo sul dev store |
| Production | `prod` | `main` | merchant reali |

- Le PR ordinarie puntano a `develop` e usano squash. `main` accetta soltanto
  promozioni autorizzate da `develop`, unite con merge commit per preservare
  l’ascendenza tra i due rami. Prima del merge l’head della PR resta quindi il
  tip di `develop`: il commit di promozione a due parent nasce soltanto unendo
  la PR con metodo `MERGE`, mai simulando o preparando uno squash. Dopo uno
  squash elimina il branch temporaneo; non eliminare mai `develop` dopo una
  promozione.
- Nella review di una promozione, identifica l’head dalla PR GitHub
  (`head.ref=develop` e relativo SHA), non dal commit sintetico costruito
  nell’ambiente di review. Verifica il metodo `MERGE` e i due parent tramite il
  candidato restituito da GitHub; un commit sintetico locale a parent singolo
  non è il commit che verrà unito e non prova una perdita di ascendenza.
- Commit e titoli PR seguono Conventional Commits. Non fare push diretti
  intenzionali su `main` o `develop`. Fa eccezione soltanto il fast-forward
  automatico di `develop` al merge commit Production già verificato: lo esegue
  una GitHub App dedicata, ammessa dal ruleset esclusivamente dopo deploy e
  readback verdi, solo se il secondo parent è l'HEAD corrente di `develop` e i
  tree sono identici. Se quel fast-forward fallisce e `develop` avanza prima del
  retry, la stessa App può aggiungere in modo manuale un merge di sola ascendenza
  con tree `develop` invariato e senza force, soltanto dopo aver verificato la
  ricevuta Production, il parent promosso e la discendenza lineare. Lo stesso
  recupero manuale è ammesso senza ricevuta per una promozione `main` dichiarata
  senza deploy, soltanto se il merge non cambia il tree del parent `develop` e
  il branch corrente ne è un avanzamento lineare; il commit risultante conserva
  il tree corrente di `develop` e non modifica provider. L'avvio manuale del
  workflow dichiara obbligatoriamente `deploy-retry` oppure
  `no-deploy-promotion`: la prima modalità verifica sempre la ricevuta, anche
  nel recupero avanzato; la seconda termina senza scrivere se il parent promosso
  è ancora l'HEAD di `develop`.
- La ricevuta di deploy è l'unico dato che nasce dopo il merge e non apre PR:
  il workflow la conserva come artifact JSON legato a commit e tree; quella
  Production è anche attestata. Le PR di chiusura collegano queste prove senza
  ricopiarle nel repository.
- Development usa `X.Y.Z-dev.<tree>` come versione Shopify immutabile del
  contenuto. Un commit diverso con lo stesso tree riusa lo snapshot e ripete
  soltanto readback, smoke e controlli provider freschi. Production continua a
  usare la SemVer esatta di `package.json`.
- Submission App Store e attivazioni commerciali restano azioni separate.
- Per operazioni remote preferisci l’integrazione ufficiale del provider
  disponibile; usa CLI, API raw o browser solo per la parte non coperta.
- Prima di usare il connettore Shopify, leggi sempre l’identità dello store.
  Durante sviluppo e test consenti scritture CF Ready solo su
  `cf-ready-dev.myshopify.com`; se il connettore punta a un altro store,
  fermati e cambia store. In Production serve l’autorizzazione prevista sotto:
  una richiesta affermativa di pubblicazione la soddisfa per il ciclo tecnico
  applicabile.
- Prima di una scrittura remota identifica ambiente, account Cloudflare,
  organizzazione/app/store Shopify e stato target; verifica presenza delle
  credenziali, autorizzazione, backup e rollback senza esporre segreti.
- Dopo un deploy registra ambiente, commit, deployment ID, migrazioni, smoke,
  readback e versione di rollback.
- In CF Ready crea tag e GitHub Release soltanto dopo che il workflow Production,
  lo smoke e il readback del medesimo commit sono riusciti.
- Al di fuori di una richiesta di pubblicazione, Deploy Production e release
  richiedono autorizzazione separata. Submission App Store, attivazione billing
  e altre operazioni esterne escluse sopra la richiedono sempre.

## Autonomia e comunicazione

Decidi autonomamente naming, formattazione, default e scelte locali equivalenti.
Chiedi solo per azioni distruttive o difficili da annullare e quando
interpretazioni diverse cambierebbero materialmente il risultato.

Comunica in italiano. Aggiorna brevemente all’avvio e solo per scoperte
importanti o cambi di direzione. Chiudi partendo dall’esito e includi, in modo
proporzionato, modifiche, verifiche, limiti, stato Git e stato di
pubblicazione/deploy.

## Prompting e conduzione del lavoro con Astra

- Interpreta le richieste operative come incarichi da completare, usando intento
  e contesto della sessione. Risolvi i dettagli ordinari con assunzioni ragionevoli;
  chiedi solo quando la risposta cambia materialmente il risultato.
- Prima di una conferma necessaria, completa il lavoro indipendente già autorizzato
  e prepara un risultato concreto da valutare. Non richiedere consensi già concessi;
  conserva i confini di pubblicazione, dati e operazioni esterne definiti qui.
  Un ordine esplicito di attesa o arresto interrompe il lavoro interessato.
- Le istruzioni esplicite dell'utente prevalgono sulle linee guida delle skill,
  nel rispetto delle istruzioni di sistema e sviluppatore. Verifica pertinenza,
  gerarchia e conflitti di AGENTS, override e skill prima di dedurne un blocco;
  non trasformare raccomandazioni generiche in nuovi gate.
- Se una skill causa una pausa, una richiesta di permesso o lavoro incompleto,
  cita e collega il preciso `SKILL.md`, riporta l'istruzione rilevante e distingui
  il requisito esplicito dalla tua interpretazione.
- Integra correzioni e nuovi vincoli durante il lavoro; rispondi alle domande
  laterali senza perdere l'obiettivo, salvo annullamento o cambio di scope esplicito.
- Scrivi in italiano semplice, con esito per primo e paragrafi brevi. Usa elenchi
  solo quando aiutano; evita formule ricorrenti, gergo superfluo e aggiornamenti
  che ripetono lo stesso stato. Riporta prove, limiti e prossima azione reale.
- Calibra la verifica sul rischio del diff e completa i gate applicabili. Riusa
  test esistenti; aggiungine solo per un comportamento o rischio concreto, non
  per replicare modifiche banali. Dopo un esito verde ripeti o amplia i controlli
  solo per nuove modifiche, errori o dubbi irrisolti. Verifica il diff effettivo,
  senza trattare il messaggio di successo di uno strumento come prova sufficiente.
- Quando la sessione e le regole del progetto consentono subagent, delega solo
  filoni consistenti e indipendenti, con ownership disgiunta, risultato atteso e
  verifiche espliciti. Il coordinatore integra; niente delega per microtask o
  semplice ricontrollo. Scrivi messaggi leggibili anche tra agenti.

Esempio e fonti: [prompting con Astra](CONTRIBUTING.md#prompting-con-gpt-6-astra).
