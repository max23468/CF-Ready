# AGENTS.md

Regole operative condivise per questa repository. `CLAUDE.md` importa il file:
mantieni qui le regole comuni e non duplicarle altrove.

## Progetto e fonti

CF Ready è una public app Shopify per validare Codice Fiscale e PEC nei
localized fields del checkout italiano. Il target usa React Router e TypeScript
su Cloudflare Workers, D1 per dati e sessioni, R2 per i backup e una Cart and
Checkout Validation Function. Non presentare un deliverable pianificato come
già implementato: codice, test e configurazioni provano lo stato corrente.

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

- La 1.0 gestisce solo Codice Fiscale e PEC. Partita IVA, Codice SDI,
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
- Mantieni lo scope Shopify minimo: non leggere ordini, clienti, prodotti o
  inventario senza un requisito approvato.
- Non inviare Codice Fiscale, PEC o dati merchant a log, telemetria o provider
  esterni; usa identificatori tecnici minimizzati.
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
| Docs | documentazione o governance | riferimenti e comandi citati, formato, `git diff --check` |
| Standard | TypeScript, route, config o test | test mirati e `npm run check` |
| Sicurezza | auth, webhook, cifratura o dipendenze | Standard, audit/lockfile applicabile e regressione mirata |
| Deploy | provider, migrazioni, Worker o Function | gate completo, preflight, backup se serve, smoke, readback e rollback |

`npm run check` è il gate locale completo dello scaffold corrente. Provider,
database remoto, browser e deploy richiedono prove fresche; un exit code `0` non
dimostra da solo lo stato live. Dichiara sempre i controlli non eseguiti.

Prima della `1.0.0`, riconferma nelle fonti Shopify correnti la Function API
`2026-07`, rigenera con la CLI supportata e ripeti fixture e checkout reali.

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

I finding P2/P3 della review restano advisory e non autorizzano modifiche:
l'agente li implementa soltanto su richiesta esplicita del proprietario. Quando
la review è conclusa e l'evidenza si riferisce all'HEAD esatto, li riepiloga e
prosegue con la pubblicazione; i finding P0/P1 validi restano bloccanti. Il gate
può scartare soltanto un falso finding riconoscibile in modo univoco e smentito
dallo stato autorevole di GitHub, con condizioni strette e regressioni dedicate;
non può riclassificare o ignorare un P0/P1 reale.

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
- Dopo l'autorizzazione dell'owner, una promozione usa l'auto-merge nativo con
  metodo `MERGE`: il metodo registrato da GitHub diventa evidenza autorevole per
  i gate prima che il merge avvenga. Non abilitare auto-merge `SQUASH` o `REBASE`
  sulle promozioni.
- Commit e titoli PR seguono Conventional Commits. Non fare push diretti
  intenzionali su `main` o `develop`.
- La ricevuta di deploy è l’unico dato che nasce dopo il merge, e non ha mai una
  PR propria. Quella di uno snapshot intermedio viaggia con la prima PR utile
  successiva; quella dell’ultimo snapshot va nella PR di chiusura della
  milestone, insieme all’esito dei gate live. Una milestone ha quindi le PR del
  lavoro e, alla fine, quella di chiusura.
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
