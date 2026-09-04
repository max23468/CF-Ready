# Contratti tecnici M6

Questo documento fissa i contratti introdotti da M6 — lingua dell'interfaccia,
editor della configurazione e stato UI — perché le pagine successive li riusino
invece di reinventarli. Estende i [contratti M4](m4-technical-contracts.md) e
[M5](m5-technical-contracts.md), che restano validi per webhook, eventi,
riconciliazione e stato commerciale. Il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md) resta canonico per
requisiti e decisioni; qui c'è come sono implementati.

## Lingua dell'interfaccia

`resolveLocale(request)` in `app/i18n.ts` è l'unico punto che decide la lingua.
Legge il parametro `locale` dell'URL, che Shopify aggiunge al caricamento
dentro l'Admin, e in sua assenza l'header `Accept-Language`, che App Bridge
imposta sulle richieste verso il dominio dell'app. Ogni tag che non inizia per
`it` è inglese: non esiste un terzo comportamento.

Nessuna preferenza viene salvata, coerente con §12.2: due membri dello staff
sullo stesso store possono vedere lingue diverse. I testi sono due dizionari
TypeScript in `app/i18n.ts`, senza libreria i18n. L'italiano è la lingua
sorgente e l'inglese ha le stesse chiavi: un test lo verifica.
Anche la rotta pubblica di login usa la stessa risoluzione e gli stessi
dizionari, così lingua del documento, etichette ed errori restano coerenti.

I messaggi mostrati al cliente nel checkout non passano di qui. Sono dati del
merchant nel metafield e seguono FR-060.

## Dove vive la configurazione

Il contratto di §11.1 — valori ammessi, limiti e default — sta in
`app/config.ts`, fuori da un modulo `.server`, perché la UI deve poter mostrare
le stesse opzioni che il server accetta. `app/validation.server.ts` conserva
soltanto l'I/O verso Shopify e ne riesporta i simboli per gli usi server.

`readConfig(value)` non lancia mai: una configurazione assente, malformata o di
uno schema che non conosciamo torna ai default, e la prima scrittura del
merchant la sostituisce intera. Un messaggio vuoto o oltre i 200 caratteri
osservato sul metafield torna al default della sua lingua, perché FR-061 non
consente di presentarlo vuoto nell'editor.

FR-050 fissa i default della prima installazione: entrambi i campi
`unmanaged`, `errorDisplay` `inline`, Validation disattivata.

## Scrittura della configurazione

`writeValidation(admin, db, shopDomain, next, enable)` è il percorso unico
condiviso da salvataggio delle regole e attivazione: lease per store,
configurazione intera mai a patch, readback e stato persistito in `app_state`.

`enable` a `null` conserva lo stato corrente della Validation ed è ciò che il
salvataggio usa: FR-051 tiene separati salvataggio e attivazione.

Il salvataggio passa anche la firma della configurazione che stava guardando,
letta dal metafield all'apertura della pagina. Se nel frattempo un'altra
sessione l'ha cambiata, la mutazione non parte: è il controllo ottimistico di
§11.4, e usa lo stesso hash canonico di `app_state.config_hash`. Attivazione e
disattivazione non lo usano, perché non modificano la configurazione.

La configurazione vive nel metafield della Validation, che è il suo unico
owner. Il primo salvataggio crea quindi la Validation **disattivata**: senza
owner la configurazione non avrebbe dove stare, e §11.3 vieta soltanto di
crearla alla sola installazione. L'attivazione resta una seconda operazione
esplicita.

Il diritto commerciale scritto nel metafield viene ricalcolato a ogni scrittura
dalla prova D1 e dal billing riletto da Shopify e sincronizzato in D1. Se la
lettura Shopify fallisce si conserva lo stato operativo noto, come nella
riconciliazione Home; se fallisce la successiva sincronizzazione D1, la scrittura
Validation viene interrotta. Una transizione da disattivata ad attiva è
rifiutata se il diritto risultante è `none`.

## Dichiarazione sul campo “Interno”

`app_state.address2_conflict_declared_at`, aggiunta dalla migrazione `0007`
insieme alle colonne di onboarding, registra la dichiarazione FR-058. È una
dichiarazione del merchant, non un rilevamento: CF Ready non legge e non
modifica quell'impostazione (D-125). Finché la colonna è valorizzata, la Home
mostra il promemoria di rimuovere quell'uso.

Le istruzioni mostrate al merchant descrivono due passaggi verificati sulle
fonti Shopify: la seconda riga dell'indirizzo si porta su “Facoltativo” o “Non
includere” in Impostazioni → Checkout, sezione Opzioni del modulo, e
l'etichetta, se cambiata, si rimette da “Gestisci la lingua del checkout” o da
Impostazioni → Lingue, scheda “Checkout e sistema”. Non è il tema a governare
quell'etichetta.

La dichiarazione si revoca solo togliendo la spunta. Il blocco viene reso solo
quando il Codice Fiscale è gestito, ed è lì che nasce la sovrapposizione fra i
due campi; un invio che non lo contiene non dice nulla sulla dichiarazione e la
lascia com'è. `address2Declaration(form)` esprime la regola e distingue i tre
casi: dichiarata, revocata, non toccata.
Quando la dichiarazione accompagna un salvataggio o un'attivazione Validation,
D1 viene aggiornato dentro la stessa lease, soltanto dopo il readback Shopify;
il completamento onboarding senza attivazione resta invece una scrittura locale
diretta.

## Codici aggiunti da M6

| Codice | Origine |
| --- | --- |
| `validation_limit_reached` | Shopify rifiuta la creazione perché lo store ha già il numero massimo di Validation Function attive (FR-098) |
| `config_conflict` | la configurazione è cambiata fra l'apertura della pagina e il salvataggio: la scrittura non parte |
| `duplicate_validations` | Shopify espone più Validation CF Ready, tutte disattivate |
| `duplicate_validations_active` | Shopify espone più Validation CF Ready e almeno una è ancora attiva |

`validation_limit_reached` si ricava dal testo dello userError, unico segnale
che Shopify espone: se il testo cambia si ricade su `validation_write_failed`,
che resta corretto ma meno utile. Nessuna Validation di altre app viene
toccata e la configurazione del merchant resta salvata.

I codici restano valori chiusi, sicuri da mostrare e da confrontare, come da
contratti M4.

## Onboarding e recensioni

`app_state.onboarding_status` e `onboarding_step` guidano la procedura di
§15.9. Le regole scelte al secondo passo vengono salvate subito con il percorso
ordinario, quindi la Validation nasce disattivata e sopravvive a una ricarica;
attivare resta il gesto finale, separato, di FR-051. Completare senza attivare
conserva la configurazione e porta lo stato a `completed`, che è anche ciò che
valorizza `setup_checklist_dismissed_at`: la checklist della Home non ricompare
più (D-063). Riaprire la procedura dalla Guida non azzera nulla — si ripercorre
sulla configurazione salvata.
Il confine server accetta soltanto passi interi da 1 a 4; quando lo stato è già
`completed`, scritture di avanzamento tardive conservano il passo 1. Nel quarto
passo checkbox e istruzioni leggono lo stesso stato controllato.

La richiesta di recensione usa la modale nativa di Shopify, che decide da sé
idoneità, frequenza e rifiuti: le tre risposte di FR-094 sono sue. L'app sceglie
soltanto il momento, e la scelta è espressa da `reviewIsDue`: onboarding
concluso, Validation attiva, nessun codice errore aperto e almeno sette giorni
dall'ultimo evento `validation_enabled`, che è già nel registro e rende inutile
una colonna dedicata. `Shop.plan.partnerDevelopment` sopprime la richiesta nei
development store, dove la modale non può inviare recensioni e verrebbe
riproposta a ogni Home. La chiamata non parte mai da un'azione del merchant,
come la documentazione Shopify richiede.

`onboarding_completed` si aggiunge agli eventi, di classe `onboarding`, con
`enabled` a dire se la procedura si è chiusa attivando o no.

## Dove vive lo stato commerciale

Non esiste una rotta `plan`: §15.6 è reso dalla Home in due blocchi. `PlanStatus`
sta nella colonna laterale e non ha azioni — è ciò che si legge. `PlanChoice`
sta in quella principale con i propri bottoni, e resta visibile anche quando non
c'è nulla da scegliere: con un pagamento unico attivo spiega perché.

La riconciliazione di §11.6, che il Master Plan chiedeva all'apertura della Home
e di Piano e fatturazione, ora avviene in un punto solo.

Quando resta un errore operativo, la Home espone `Ripara configurazione`, che
ripete la stessa riconciliazione autorevole senza introdurre un secondo percorso
di scrittura. Più Validation CF Ready producono `duplicate_validations`: la Home
resta accessibile, tutte vengono disattivate per mantenere il checkout fail-open
e nessuna risorsa viene scelta o cancellata automaticamente. Se Shopify non
conferma la disattivazione, il codice resta `duplicate_validations_active` e
l'azione di riparazione la ritenta. Finché restano duplicati, nessuna loro
configurazione viene scelta: la pagina Regole mostra l'anomalia invece di
presentare i default come configurazione attiva.

L'esito `retryable` della riconciliazione è separato da `errorCode`: il primo
governa esclusivamente il consumer webhook, il secondo resta il codice sicuro
persistito e mostrato alla UI. In questo modo lock, duplicati attivi e mancata
cancellazione dell'abbonamento dopo un acquisto una tantum restano ritentabili
anche quando la stessa esecuzione osserva un altro errore operativo.
