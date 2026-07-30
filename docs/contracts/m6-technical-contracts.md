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

La configurazione vive nel metafield della Validation, che è il suo unico
owner. Il primo salvataggio crea quindi la Validation **disattivata**: senza
owner la configurazione non avrebbe dove stare, e §11.3 vieta soltanto di
crearla alla sola installazione. L'attivazione resta una seconda operazione
esplicita.

Il diritto commerciale scritto nel metafield viene ricalcolato a ogni scrittura
da prova e conto commerciale letti in D1, non ereditato da quello osservato.

## Dichiarazione sul campo “Interno”

`app_state.address2_conflict_declared_at`, aggiunta dalla migrazione `0007`
insieme alle colonne di onboarding, registra la dichiarazione FR-058. È una
dichiarazione del merchant, non un rilevamento: CF Ready non legge e non
modifica quell'impostazione (D-125). Finché la colonna è valorizzata, la Home
mostra il promemoria di rimuovere quell'uso.

## Codici aggiunti da M6

| Codice | Origine |
| --- | --- |
| `validation_limit_reached` | Shopify rifiuta la creazione perché lo store ha già il numero massimo di Validation Function attive (FR-098) |
| `country_not_eligible` | operazione richiesta su uno store con indirizzo fuori dall'Italia |

`validation_limit_reached` si ricava dal testo dello userError, unico segnale
che Shopify espone: se il testo cambia si ricade su `validation_write_failed`,
che resta corretto ma meno utile. Nessuna Validation di altre app viene
toccata e la configurazione del merchant resta salvata.

I codici restano valori chiusi, sicuri da mostrare e da confrontare, come da
contratti M4.
