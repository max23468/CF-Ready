# Risposta a un sospetto incidente di sicurezza

Attivare questa procedura quando emergono credenziali esposte, accessi o
mutazioni non autorizzati, perdita di dati o altri indizi credibili di
compromissione. Non attendere la conferma dell'abuso per contenere il rischio.
Un controllo fallito senza indizi di compromissione segue invece
[Manutenzione sicurezza](security-maintenance.md#gestione-di-un-fallimento).

La sequenza segue la guida Shopify
[When something goes wrong](https://shopify.dev/docs/apps/build/security/following-security-best-practices#when-something-goes-wrong),
consultata il 21 ottobre 2026. Questo runbook documenta la risposta: la sua
lettura o modifica non autorizza operazioni remote, rotazioni o notifiche.

## Responsabile e registro

L'owner coordina l'incidente, autorizza gli interventi e cura le comunicazioni.
Chi rileva il problema registra subito l'ora UTC, l'indizio e la superficie
coinvolta e lo porta all'owner tramite un canale privato attendibile. Se un
account o dispositivo è sospetto, usare un accesso indipendente e attendibile.

Aprire un registro riservato fuori dal repository, dalle issue pubbliche e
dalle chat con provider AI. Conservare qui soltanto una sintesi tecnica
anonimizzata, se necessaria. Nel registro annotare:

- ID incidente, responsabile, scoperta e cronologia UTC;
- ambiente, account, app, Worker e risorse coinvolte; SHA e deployment ID;
- fatti confermati, ipotesi e informazioni mancanti, con fonte e intervallo;
- azioni autorizzate, esecutore, esito e verifica indipendente nel provider;
- riferimenti alle prove protette, comunicazioni, prossima azione e scadenza.

Applicare la severità del [Master Plan, §26](../plans/2026-07-28-CF-Ready-Master-Plan.md#26-operazioni-incidenti-backup-e-rollback)
all'impatto operativo osservato; una classificazione ancora incerta non deve
ritardare il contenimento. Identificare sempre il target prima di una scrittura:
Development e Production hanno app e credenziali distinte.

## 1. Contenere

L'owner dispone l'arresto dell'operazione compromessa o l'isolamento del servizio
interessato, limitando l'intervento alle risorse CF Ready. Per esempio, fermare
un workflow che distribuisce codice sospetto, impedire nuove mutazioni dal
componente coinvolto o sospenderne il consumo Queue. Registrare impatto,
arretrati e piano di recupero; non eliminare messaggi, database o installazioni
per ottenere un apparente ritorno alla normalità.

Preservare, appena possibile, gli identificativi e lo stato precedente senza
ritardare l'arresto di un abuso attivo. Verificare poi che l'operazione sia
effettivamente ferma. Spegnere il Worker non disattiva da solo una Validation
già attiva su Shopify: per checkout legittimi bloccati seguire anche il runbook
P0 del Master Plan (§26.2), senza toccare Validation di altre app.

## 2. Revocare o ruotare gli accessi esposti

Partire dall'[inventario secret](secret-inventory.md), verificando nel provider
le destinazioni e i consumatori attuali, comprese CI, Worker e backup.
L'inventario storico non prova che un accesso sia ancora valido o confinato.
Non aspettare la prova dell'utilizzo di una credenziale esposta.

| Accesso coinvolto | Intervento da eseguire con autorità dell'owner |
| --- | --- |
| Client secret Shopify (`SHOPIFY_API_SECRET`) | Seguire [Rotate your client secret](https://shopify.dev/docs/apps/build/authentication-authorization/manage-credentials#rotate-your-client-secret). In caso di abuso attivo revocare subito il vecchio secret, anche a costo di interrompere l'accesso; ripristinare poi con il nuovo. Per la transizione coordinata verificare prima supporto alle firme webhook vecchie e nuove e sostituzione dei token legati al vecchio secret: non presumere che il runtime corrente supporti due secret. |
| Access token, refresh token e sessioni Shopify | Revocare presso Shopify gli accessi esposti con il percorso supportato per il tipo di token; coordinare con Shopify se il perimetro non è chiaro. Invalidare anche le sessioni locali coinvolte e ripetere l'autenticazione dopo la messa in sicurezza. Cancellare righe D1 o cambiare la chiave di cifratura non revoca un token già sottratto. |
| `SESSION_ENCRYPTION_KEY` | Usare la [procedura esistente](secret-inventory.md#rotazione-di-session_encryption_key). Se possono essere stati letti anche dati cifrati, trattare separatamente i token contenuti come potenzialmente esposti. |
| Token Cloudflare, GitHub, Shopify Automation/Partner, Telegram e chiavi di automazione | Revocare l'accesso presso il rispettivo provider, sostituirlo con permessi minimi e aggiornare tutti i consumatori verificati. Esaminare anche sessioni account, integrazioni e accessi creati dall'attaccante. |
| `TRIAL_LEDGER_HMAC_KEY` o `D1_BACKUP_KEY` | Applicare i vincoli dell'inventario e di [Backup D1 in R2](operations.md#backup-d1-in-r2): preservare in custodia protetta le versioni necessarie a prove e ripristino. Non sostituirle alla cieca; contenere prima l'accesso abusivo e definire la migrazione o ricifratura necessaria. |

Registrare nomi, identificativi e orari di revoca, mai valori. Verificare nel
provider l'invalidazione del vecchio accesso e il funzionamento del nuovo,
senza stampare credenziali. Se una verifica manca, lasciare l'azione aperta.
Un rollback non deve ripristinare una credenziale compromessa, anche se il
runbook di rotazione ordinaria consente il ritorno al valore precedente.

## 3. Preservare le prove

Acquisire tempestivamente le prove volatili disponibili: audit degli accessi
provider, run e artefatti CI pertinenti, ricevute di deploy, configurazioni e
metadati tecnici dei log. Usare [Workers Logs](operations.md#workers-logs)
per filtri e limiti di raccolta; registrare correlation ID, sorgente,
intervallo UTC, filtri, retention osservata e lacune. Non ampliare i log
applicativi con payload, header, token, Codice Fiscale o PEC.

Conservare gli originali necessari in un archivio cifrato con accesso ristretto
all'owner e agli incaricati autorizzati; annotare chi li acquisisce, quando,
checksum e accessi successivi. Preparare copie redatte per la condivisione.
Non scaricare dati personali nel checkout di sviluppo e non copiare dump,
segreti o log grezzi in repository, ticket o strumenti AI. Se serve preservare
il database, riusare il percorso protetto di backup in operations; salvare le
prove senza sovrascrivere le copie precedenti e senza eseguire un restore.

## 4. Avvisare Shopify e valutare le notifiche

L'owner contatta tempestivamente `security@shopify.com`, anche con una
valutazione incompleta. Non attendere la conclusione dell'indagine. La prima
comunicazione deve contenere app e ambiente, orari UTC, natura del sospetto,
impatto noto, contenimento già eseguito, aspetti ancora incerti e recapito
attendibile. Non allegare credenziali o dati personali; concordare con Shopify
un canale sicuro per eventuali prove riservate. Conservare riferimento del
messaggio inviato, risposta e successivi aggiornamenti nel registro privato.

L'owner valuta parallelamente gli obblighi legali e contrattuali di notifica,
con supporto qualificato quando necessario, registrando destinatari, termini,
decisioni e invii effettivi. Coordinare le comunicazioni a merchant e persone
interessate con Shopify quando applicabile; il contatto Shopify non sostituisce
gli altri obblighi. Il runbook non effettua alcun invio automatico.

## 5. Delimitare negozi, utenti e dati

Ricostruire la finestra dal primo accesso o esposizione plausibile fino alla
revoca e al contenimento verificati. Confrontare permessi effettivi della
credenziale, risorse raggiungibili e accessi osservati, inclusi eventuali altri
ambienti se una credenziale era condivisa. Non dedurre assenza di impatto dalla
sola assenza di errori.

Per le richieste effettuate con token dell'app consultare i
[log API del Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/monitoring-and-logs):
Shopify indica una finestra di 30 giorni con negozio, IP client e user agent.
Verificarne disponibilità e copertura al momento dell'incidente e preservarli
prima della scadenza. Questi log non coprono da soli accessi diretti a D1, R2,
CI o account provider; incrociarli con gli audit pertinenti.

Tenere nel registro privato una riga per negozio o risorsa, con nome e
identificativo verificati, utenti coinvolti, categorie di dati, possibile
lettura/modifica/esfiltrazione, prove e livello di certezza. Distinguere
interessati confermati, potenzialmente interessati ed esclusi con motivazione.
Se mancano log o copertura temporale, segnare «non determinabile» e chiedere
supporto al provider. Verificare codice, schema e scope attivi prima di
concludere quali dati fossero accessibili; non richiedere nuovi scope per
l'indagine e non presumere che CF Ready conservi i campi fiscali del checkout.

## 6. Correggere, ripristinare e verificare

Riprodurre la causa in locale con fixture sintetiche e correggere il punto
condiviso con il test minimo di regressione. Eseguire i gate previsti da
AGENTS.md per il diff effettivo. Per un ripristino seguire
[Ripristino di emergenza](operations.md#ripristino-di-emergenza) e il rollback
del Master Plan (§26.3), dopo aver verificato che la copia scelta preceda la
compromissione e non reintroduca accessi o codice compromessi.

Pubblicazione e Production mantengono le autorizzazioni e i gate ordinari.
Dopo l'intervento autorizzato verificare sul target esatto: causa non più
riproducibile, accessi esposti invalidati, nuovi accessi funzionanti, isolamento
fra negozi, autenticazione embedded, firma webhook e flussi Queue se coinvolti.
Se cambia il checkout, verificarlo con dati sintetici sullo store Development
autorizzato e raccogliere separatamente la prova Production richiesta.
Conservare SHA, deployment ID, migrazioni, smoke, readback e rollback sicuro
secondo la [ricevuta deploy/readback](operations.md#ricevuta-deployreadback).

Prima di riaprire le operazioni sospese, l'owner verifica gli esiti, definisce
come recuperare gli arretrati senza duplicare effetti e fissa una finestra di
osservazione con fonti, durata, responsabile e criteri di nuova escalation.
Un test locale verde o un deploy riuscito non chiude la verifica remota.

## 7. Chiudere e prevenire la ricorrenza

Chiudere solo con approvazione dell'owner e prove di contenimento, revoche,
correzione e ripristino, valutazione dell'impatto e notifiche dovute concluse.
Annotare esplicitamente gli aspetti non confermati e le attività residue con
responsabile e scadenza; non dichiarare «nessun dato coinvolto» senza prove.

Redigere un postmortem riservato con cronologia, causa, impatto, efficacia della
risposta e controllo che avrebbe intercettato il problema. Aggiornare test e
fonti canoniche interessate con una sintesi priva di dati sensibili. Definire
retention e cancellazione delle prove con l'owner secondo gli obblighi
applicabili. Provare periodicamente questa sequenza con uno scenario sintetico,
senza revoche, notifiche o interventi remoti reali.
