# Registro contatti merchant CF Ready

Riepilogo aggregato al 31 ottobre 2026, Europe/Rome. Il registro nominativo
con store, recapiti, schede Partners, piani e cronologia degli invii è
conservato fuori dal repository, in `private/merchant-outreach/` del checkout
locale dell'owner, esclusa da Git. Qui restano solo conteggi, criteri e testi.
Il documento non autorizza nuovi invii.

## Dati da non versionare

Nel repository non vanno nomi di store o referenti, domini, indirizzi e-mail,
ID Partners, piani o pagamenti di singoli merchant, motivi di disinstallazione
né orari di invio riferiti a uno store. Ogni aggiornamento nominativo va nel
registro locale; qui si riportano soltanto totali e decisioni di processo.

## Conteggi

| Rilevazione                                                            | Dato |
| ---------------------------------------------------------------------- | ---: |
| Installazioni attive Production, 23 ottobre, store di sviluppo esclusi |   49 |
| Installazioni attive Production, 28 ottobre, store di sviluppo inclusi |   56 |
| Di cui con Validation attiva, 28 ottobre                               |   43 |
| Store distinti con richiesta di recensione inviata, 31 ottobre         |   38 |
| Recensioni pubblicate notificate tra il 25 e il 30 ottobre             |    4 |

Il conteggio delle richieste deduplica gli store: non coincide con il numero
di e-mail inviate, perché alcune richieste sono state ripetute. Assistenza,
feedback sulle prove e messaggi dopo una disinstallazione sono contatti
distinti e non entrano nel conteggio, a meno che il testo chieda esplicitamente
una recensione. Una bozza non vale come invio; una copia in Inviati attesta
l'invio, non la consegna.

### Validation e obbligatorietà del Codice Fiscale

Rilevazione Production D1 del 23 ottobre 2026 sui 49 store eligible.
Validation e regola CF sono dati distinti: salvare una regola obbligatoria
non attiva la Validation.

| Stato Validation | CF obbligatorio | CF facoltativo e validato | CF non gestito | Regola non verificata | Totale |
| ---------------- | --------------: | ------------------------: | -------------: | --------------------: | -----: |
| Attiva           |              33 |                         1 |              0 |                     5 |     39 |
| Disattiva        |               6 |                         0 |              1 |                     3 |     10 |
| Totale           |              39 |                         1 |              1 |                     8 |     49 |

Fonti: `app_state.validation_enabled` per l'ultimo stato Shopify riconciliato
e l'ultima riga di `configuration_history` (`rules_json.taxCode`) per la regola.
I 33 store con Validation attiva e CF obbligatorio non misurano i checkout
bloccati: entitlement, prova, condizioni del checkout e disponibilità del campo
restano fattori separati.

### Validation disattiva con configurazione salvata

Dei dieci store con Validation disattiva, sette avevano una configurazione
salvata e una risorsa Validation presente ma spenta, con `last_error_code`
nullo. Nessun evento esaminato riporta errori o disattivazioni per duplicati.

| Causa osservata                                          | Store |
| -------------------------------------------------------- | ----: |
| Piano pagato, attivazione mai eseguita                   |     1 |
| Disattivazione esplicita dall'app durante la prova       |     1 |
| Percorso fermo prima di prova o piano e dell'attivazione |     5 |

Gli altri tre non avevano risorsa Validation, snapshot o onboarding avviato.
Il comportamento è coerente con il codice: il salvataggio delle regole conserva
lo stato `enabled`, l'attivazione richiede entitlement e un'azione separata e
la riconciliazione commerciale non attiva il controllo.

- [Scrittura Validation](../../app/validation/write.server.ts).
- [Onboarding](../../app/features/onboarding/onboarding.server.ts).
- [Riconciliazione commerciale](../../app/validation/reconcile-validation.server.ts).

### Snapshot di configurazione mancanti

Otto store eligible non avevano uno snapshot in `configuration_history`.
Cinque avevano Validation attiva e regole salvate prima dell'introduzione
della tabella (migrazione 0022, commit `3c098e4` del 12 settembre 2026), che
la riconciliazione non ricostruisce. Tre non avevano mai salvato regole.
Un errore assorbito nella scrittura dello snapshot resta un percorso possibile
nel codice, senza prove che sia avvenuto. Lo snapshot mancante è un limite
della copia D1, non una prova di CF facoltativo o di malfunzionamento.

- [Registrazione della configurazione](../../app/configuration-history.server.ts).
- [Riconciliazione della Validation](../../app/validation/reconcile.server.ts).
- [Persistenza dello stato](../../app/validation/repository.server.ts).
- [Tabella dello storico](../../migrations/0022_configuration_history.sql).

## Criteri di selezione

- Recensione solo dopo almeno sette giorni dall'attivazione della Validation
  e con esecuzioni della Function osservate nei log. I log campionati provano
  quelle esecuzioni, non uso continuo, ordini o checkout unici.
- Store con Validation disattiva, onboarding incompleto o recensione già
  pubblicata non ricevono richieste di recensione.
- Assistenza prioritaria a chi paga ma non ha attivato il controllo; per gli
  avvii incompleti un messaggio di aiuto, senza dedurre un malfunzionamento.
- Dopo una disinstallazione si chiede un riscontro, mai una recensione.
- Una prova con `ends_at` passato non prova la mancata conversione: leggere
  anche `billing_accounts` e lo stato Shopify corrente.
- Esclusi store di sviluppo, store di test e di app review, tester Shopify e
  lo store dell'owner. Un nome che sembra di test non basta a escluderlo.
- Recapiti presi da Shopify Partners; un recapito pubblico del sito si usa
  solo con autorizzazione dell'owner e va annotato come non verificato.
- Prima di ogni nuovo contatto rileggere Production D1, Partners, log Function
  e posta: il registro è manuale, non uno stato live.

## Testi e preferenze concordati

- Mostrare prima le bozze in chat. Creare bozze in Mail e inviarle sono azioni
  distinte, ciascuna su richiesta esplicita.
- Mittente supporto@cfready.it: il plugin iCloud Mail non sceglie l'alias, quindi
  composizione e invio passano da Mail con mittente verificato.
- Tono semplice, diretto e moderatamente cordiale; apertura “Ciao al team di”.
- Presentazione: “vi scriviamo da Temisfera, che sviluppa CF Ready”.
- Per le recensioni chiedere un'esperienza onesta, spiegare che basta un minuto
  e che anche poche righe aiutano; dire che la recensione sarebbe apprezzata.
- PS di supporto **prima di “Grazie”**, poi firma Temisfera / CF Ready.
- Per il costo chiedere prima se il merchant vuole continuare a usare l'app
  “al di là del prezzo”; discutere come venirgli incontro solo dopo.
- Oggetto del recupero: “La vostra esperienza con CF Ready”, senza enfatizzare
  subito prezzo o disinstallazione.
- Non offrire benefici in cambio di recensioni e non chiedere recensioni positive.

### Recensione

Oggetto: Una recensione per CF Ready

> Ciao al team di [store],
>
> vi scriviamo da Temisfera, che sviluppa CF Ready. Grazie per aver scelto l’app!
>
> Vi andrebbe di lasciare una recensione su Shopify raccontando la vostra
> esperienza? Basta un minuto e anche poche righe possono aiutare altri negozi
> a conoscere CF Ready. La apprezzeremmo davvero molto.
>
> https://apps.shopify.com/cf-ready?locale=it#modal-show=WriteReviewModal
>
> PS: se vi serve supporto, siamo a disposizione.
>
> Grazie,  
> Temisfera\
> CF Ready

### Feedback dopo disinstallazione per confronto tra app

Oggetto: La vostra esperienza con CF Ready

> Ciao al team di [store],
>
> vi scriviamo da Temisfera, che sviluppa CF Ready. Abbiamo visto che avete provato l’app
> e indicato di stare confrontando più soluzioni.
>
> Vi andrebbe di raccontarci cosa cercavate e se c’è qualcosa che vi ha portato
> a disinstallarla? Anche un breve riscontro ci aiuterebbe a capire come migliorarla.
>
> PS: se vi serve supporto o volete chiarire qualche dubbio sull’app, siamo a disposizione.
>
> Grazie,  
> Temisfera\
> CF Ready

### Recupero dopo rinuncia per costo

Oggetto: La vostra esperienza con CF Ready

> Ciao al team di [store],
>
> vi scriviamo da Temisfera, che sviluppa CF Ready. Abbiamo letto che il costo è stato il
> motivo della disinstallazione e volevamo chiedervi come vi siete trovati con l’app.
>
> Al di là del prezzo, CF Ready rispondeva alle vostre esigenze e vi farebbe
> piacere continuare a utilizzarla? In quel caso, possiamo valutare insieme
> come venirvi incontro sul costo.
>
> PS: se vi serve supporto, siamo a disposizione.
>
> Grazie,  
> Temisfera\
> CF Ready

## Fonti

- Production D1: `shops`, `app_state`, `trials`, `billing_accounts`,
  `configuration_history`, `app_events` e `owner_control_state`, in sola lettura.
- Shopify Partners: installazioni, disinstallazioni e recapiti.
- Shopify Dev Dashboard: log della Function.
- Mail: invii, bozze e notifiche di recensione.
- [Runbook controlled launch](controlled-launch-outreach.md): procedura.
