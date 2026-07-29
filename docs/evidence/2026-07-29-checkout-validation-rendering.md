# Checkout Validation — rendering degli errori

**Data:** 29 luglio 2026

**Ambiente:** Development

**Store:** `cf-ready-dev.myshopify.com`

**App:** CF Ready Development

**Deploy:** nessuno

## Esito

La causa del blocco silenzioso nel checkout standard è il target al plurale:

```text
$.cart.localizedFields.TAX_CREDENTIAL_IT
$.cart.localizedFields.TAX_EMAIL_IT
```

Shopify esegue correttamente la Function e blocca l’ordine, ma non collega né
mostra gli errori. La forma camelCase al singolare rende invece il messaggio
inline sotto il localized field corrispondente:

```text
$.cart.localizedField.TAX_CREDENTIAL_IT
$.cart.localizedField.TAX_EMAIL_IT
```

Il candidato locale usa quindi il target singolare. La modalità inline
predefinita continua a validare soltanto a `CHECKOUT_COMPLETION`.

Resta un difetto distinto della piattaforma: con il passaggio di conferma
ordine attivo, la review read-only blocca il submit finale senza mostrare il
messaggio, anche quando la Function restituisce il target singolare corretto.

## Preparazione e perimetro

Prima delle scritture remote sono stati verificati:

- store `cf-ready-dev.myshopify.com`;
- organizzazione Temisfera;
- app CF Ready Development;
- ambiente Development e dev preview;
- una sola Validation CF Ready;
- rollback alla versione Development rilasciata precedente;
- checkout standard guest con dati esclusivamente sintetici.

Production non è stata aperta né modificata. Non sono stati eseguiti deploy,
release, billing o ordini reali.

## Matrice osservata

| Variabile | Esito |
| --- | --- |
| Target plurale, one-page, conferma OFF | ordine bloccato, messaggio assente |
| Target plurale, one-page, conferma ON | review raggiunta; submit finale bloccato, messaggio assente |
| Target plurale, three-page, conferma OFF | ordine bloccato, messaggio assente |
| Target plurale, three-page, conferma ON | submit finale bloccato, messaggio assente |
| Messaggio solo ASCII con target plurale | messaggio assente |
| Target singolare camelCase per CF | messaggio inline visibile e presente nell’albero accessibile |
| Target singolare camelCase per PEC | messaggio inline visibile e presente nell’albero accessibile |
| CF mancante | messaggio required inline |
| CF formalmente invalido | messaggio invalid inline |
| CF formalmente valido | errore rimosso durante la modifica |
| PEC mancante con regola temporaneamente required | messaggio required inline |
| Lingua italiana | messaggio italiano inline |
| Lingua inglese | messaggio inglese inline |
| API Function `2026-07` | target singolare funzionante |
| API Function `2026-04` | target singolare funzionante |
| One-page, conferma OFF, target singolare | funzionante |
| Three-page, conferma OFF, target singolare | funzionante |
| One-page, conferma ON, target singolare | submit finale nella review bloccato senza messaggio |
| Three-page, conferma ON, target singolare | submit finale nella review bloccato senza messaggio |

Il testo non è la causa: il target plurale fallisce anche con ASCII semplice,
mentre il target singolare rende correttamente apostrofi tipografici e accenti.
La versione API non è la causa: `2026-04` e `2026-07` hanno lo stesso esito.

## Modalità preventiva verificata

La combinazione diagnostica seguente è stata verificata live:

- `CHECKOUT_INTERACTION` con target globale `$.cart`;
- `CHECKOUT_COMPLETION` mantenuto come barriera finale;
- un errore globale per CF e uno per PEC.

I due errori vengono mostrati come box distinti in cima al checkout già al
caricamento. Con checkout a pagina singola e conferma ordine attiva, “Rivedi
l’ordine” blocca l’avanzamento e riporta la pagina sui due box, evitando la
review con blocco silenzioso.

L’owner ha approvato questa modalità come opzione configurabile per il merchant.
Il motore locale la implementa con `errorDisplay: "preventive"` nello schema
config v2; `inline` resta il default. Il comportamento live è stato verificato
con la stessa combinazione di step e target prima di consolidarlo nel contratto.
La UI completa in M6 dovrà:

- avvertire che i box possono apparire al caricamento;
- mantenere `CHECKOUT_COMPLETION`;
- consigliarla nella Guida e FAQ quando il merchant usa la conferma ordine;
- non dichiarare di rilevare automaticamente l’impostazione Shopify.

## Ipotesi escluse

| Ipotesi | Evidenza |
| --- | --- |
| Motore, regole, entitlement o geografia | input e output live sono coerenti; la stessa logica rende con il target singolare |
| Serializzazione Wasm | fixture reali del Wasm e messaggi Unicode corretti |
| Testo, lingua o lunghezza | ASCII fallisce col plurale; IT/EN e Unicode rendono col singolare |
| Versione API | stesso comportamento su `2026-04` e `2026-07` |
| Layout come causa primaria | plurale fallisce e singolare rende sia one-page sia three-page con conferma OFF |
| Configurazione della Validation | una sola Validation, Function eseguita con successo e output atteso |
| `blockOnFailure` | non governa gli errori di validazione restituiti, ma le eccezioni runtime |

## Incoerenza nelle fonti Shopify

Le fonti ufficiali correnti indicano tre forme diverse:

| Forma | Fonte |
| --- | --- |
| `$.cart.localizedFields.TAX_CREDENTIAL_USE_MX` | esempio della [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/2026-07/cart-and-checkout-validation) |
| `$.cart.localizedfield.key` | tabella “Supported checkout field targets” della stessa pagina |
| `$.cart.localizedField.${taxIdField.key}` | esempio della [Localized Fields API](https://shopify.dev/docs/api/checkout-ui-extensions/2026-07/target-apis/checkout-apis/localized-fields-api) |

La prova live dimostra che la terza forma, camelCase al singolare, è quella che
Shopify collega ai localized fields nel checkout corrente. La forma plurale
dell’esempio Function blocca senza rendere. Prima di una release Production
resta necessario chiedere a Shopify quale forma sia contrattuale.

## Superfici non disponibili

- Cliente autenticato: non provato perché il nuovo account cliente richiede un
  codice inviato via email e non era disponibile una casella sintetica
  controllata.
- Checkout accelerati: nel checkout osservato era disponibile soltanto il Test
  Payment Gateway; Shop Pay, Apple Pay, Google Pay e PayPal non erano
  selezionabili.
- Function ufficiale minimale separata: non necessaria, perché una variante
  locale minima del solo target ha risolto il rendering standard.

Questi limiti non vengono trasformati in esiti positivi impliciti.

## Verifiche locali

- build della Function riuscita;
- 105 test Function verdi;
- fixture Wasm aggiornata al target singolare;
- Function API ripristinata a `2026-07`;
- messaggi ripristinati e configurazione PoC locale aggiornata allo schema v2,
  con modalità inline predefinita;
- `git diff --check` verde.

I log live restano in `.shopify/logs`, ignorati da Git. Non vengono allegati
perché contengono identificatori tecnici e configurazione; l’evidenza riporta
soltanto risultati sanitizzati.

## Rollback e stato finale

Al termine delle prove:

- Validation PoC disattivata;
- una sola Validation CF Ready presente e inattiva;
- checkout a pagina singola ripristinato;
- conferma ordine disattivata e riletta nell’Admin Shopify;
- codice diagnostico sostituito dal ramo configurabile
  `errorDisplay: "preventive"`;
- modalità inline locale predefinita e Completion-only;
- nessuna scrittura remota eseguita dopo l’introduzione dello schema v2;
- nessun deploy eseguito.

## Conclusione e escalation

Il fix locale del rendering standard è il target
`$.cart.localizedField.<KEY>`. Il bug della review con conferma ordine ON è
confermato separatamente e coincide con la classe di difetti già riconosciuta
da Shopify.

L’indagine resta aperta soltanto per:

1. conferma Shopify della sintassi contrattuale del target;
2. stato del bug Completion nella review europea;
3. percorso supportato per coprire localized fields, conferma ordine e checkout
   accelerati senza errori prematuri;
4. prove su cliente autenticato e wallet quando saranno disponibili superfici
   sintetiche controllabili.

Il [piano temporaneo](../plans/2026-07-29-checkout-validation-rendering-investigation.md)
resta quindi presente e non viene rimosso dall’indice.
