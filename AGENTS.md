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
- Configurazione o entitlement incerti, errori runtime e localized fields
  assenti devono essere fail-open. Un errore dell’app non blocca vendite
  legittime.
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

## Ambienti, Git e operazioni remote

| Ambiente | ID | Branch | Uso |
| --- | --- | --- | --- |
| Development | `dev` | feature locali | sviluppo quotidiano |
| Testing | `test` | `develop` | integrazione separata |
| Production | `prod` | `main` | merchant reali |

- Commit e titoli PR seguono Conventional Commits; il merge ordinario è squash.
- “Pubblica” richiede il ciclo Git completo fino al merge e, quando la modifica
  è deployabile, il deploy pertinente con verifica live. Le release SemVer,
  submission App Store e attivazioni commerciali restano azioni separate.
- Per operazioni remote preferisci l’integrazione ufficiale del provider
  disponibile; usa CLI, API raw o browser solo per la parte non coperta.
- Prima di una scrittura remota identifica ambiente, account Cloudflare,
  organizzazione/app/store Shopify e stato target; verifica presenza delle
  credenziali, autorizzazione, backup e rollback senza esporre segreti.
- Dopo un deploy registra ambiente, commit, deployment ID, migrazioni, smoke,
  readback e versione di rollback.
- Deploy Production, release, submission App Store, attivazione billing e altre
  operazioni esterne difficili da annullare richiedono autorizzazione separata
  ed esplicita dell’owner.

## Autonomia e comunicazione

Decidi autonomamente naming, formattazione, default e scelte locali equivalenti.
Chiedi solo per azioni distruttive o difficili da annullare e quando
interpretazioni diverse cambierebbero materialmente il risultato.

Comunica in italiano. Aggiorna brevemente all’avvio e solo per scoperte
importanti o cambi di direzione. Chiudi partendo dall’esito e includi, in modo
proporzionato, modifiche, verifiche, limiti, stato Git e stato di
pubblicazione/deploy.
