# Piano di indagine — rendering errori checkout

**Stato:** attivo, nessuna prova prevista da questo documento è ancora stata
autorizzata o eseguita.

**Ambiente consentito:** esclusivamente Development,
`cf-ready-dev.myshopify.com`.

Questo documento coordina un’indagine temporanea. Non sostituisce il
[Master Plan](2026-07-28-CF-Ready-Master-Plan.md) né descrive lo stato generale
del progetto. Alla chiusura del problema, i risultati definitivi confluiscono
nell’[evidenza](../evidence/2026-07-29-checkout-validation-rendering.md), questo
piano viene eliminato e il relativo collegamento viene rimosso dall’indice.

## 1. Obiettivo

Determinare perché la Cart and Checkout Validation Function:

- riceve `TAX_CREDENTIAL_IT` vuoto;
- restituisce un errore completo;
- blocca la creazione dell’ordine;
- non mostra al cliente il messaggio restituito.

Prima di escalare a Shopify vanno provate, una variabile alla volta, tutte le
strade locali e di configurazione che possono produrre una soluzione valida per
Basic, Grow, Advanced e Plus senza tema o Checkout UI Extension.

## 2. Baseline verificata

- L’esempio ufficiale della Function API `2026-07` per i localized fields usa
  `CHECKOUT_COMPLETION` e `$.cart.localizedFields.<KEY>`.
- La tabella dei target della stessa pagina indica invece
  `$.cart.localizedfield.key`.
- L’esempio della Checkout UI Extension usa
  `$.cart.localizedField.<KEY>`, ma appartiene a un’API diversa.
- I log locali ignorati da Git contengono 89 esecuzioni reali:
  - 52 a `CHECKOUT_INTERACTION`;
  - 27 a `CHECKOUT_COMPLETION`;
  - due controlli Completion con target globale `$.cart`;
  - output completi, `status: success` e checkout bloccato nei casi invalidi.
- Molte esecuzioni Interaction ricevono i localized fields già presenti ma
  vuoti. Validare a questo step può quindi mostrare errori prima che il cliente
  inizi a compilare.
- Non è documentato quale metodo di pagamento sia stato usato nelle prove
  precedenti.
- Non è stata eseguita una prova live con un messaggio solo ASCII.
- La Shopify CLI locale osservata è `4.5.2`.
- La Validation è stata disattivata dopo le prove precedenti.

Il caso coincide con un
[bug già confermato da Shopify](https://community.shopify.dev/t/bug-cart-validation-functions-two-issues-blocking-migration-from-usebuyerjourneyintercept/31931):
con lo step di conferma attivo, Completion avviene nella review read-only,
l’ordine viene bloccato e il messaggio non viene mostrato.

Fonti operative:

- [Function API `2026-07`](https://shopify.dev/docs/api/functions/2026-07/cart-and-checkout-validation);
- [checkout one-page](https://help.shopify.com/en/manual/checkout-settings/customize-checkout-configurations/one-page-checkout);
- [conferma ordine](https://help.shopify.com/en/manual/checkout-settings/order-processing);
- [Checkout UI Extension](https://shopify.dev/docs/api/checkout-ui-extensions/latest).

## 3. Confini

### Consentito dopo autorizzazione esplicita

- scritture temporanee sull’app e sullo store Development;
- attivazione temporanea della sola Validation CF Ready;
- deploy di versioni diagnostiche della Function Development;
- modifica temporanea e reversibile di layout e conferma ordine;
- checkout con dati interamente sintetici;
- creazione di una Function Development minimale e temporanea.

### Vietato

- qualsiasi operazione Production;
- release, submission App Store o attivazione commerciale;
- dati fiscali, email o indirizzi reali;
- più di una Validation attiva durante una prova;
- Theme App Extension o Checkout UI Extension;
- modifiche al tema come workaround;
- disattivazione permanente dei checkout accelerati;
- associazione definitiva dell’errore CF a un campo semanticamente diverso;
- blocco silenzioso come comportamento pubblicabile;
- pubblicazione di codice diagnostico o di conclusioni non verificate.

## 4. Preparazione e rollback

Prima della prima scrittura remota:

1. leggere l’identità dello store e confermare
   `cf-ready-dev.myshopify.com`;
2. confermare app e ambiente Development;
3. lavorare separatamente dalle modifiche documentali non committate;
4. registrare:
   - commit Git;
   - app version e deployment ID;
   - UID e versione API della Function;
   - Validation GID, stato, `blockOnFailure` e hash della configurazione;
   - configurazione checkout attiva;
   - layout one-page o three-page;
   - stato della conferma ordine;
   - metodi standard e accelerati disponibili;
5. preparare il rollback alla versione app corrente;
6. usare soltanto fixture e valori sintetici;
7. stabilire una sigla univoca per ogni esecuzione.

Dopo ogni gruppo di prove:

1. disattivare la Validation;
2. ripristinare layout e conferma ordine;
3. ripristinare configurazione e versione app iniziali;
4. eseguire il readback;
5. confermare che non esista una seconda Validation attiva.

## 5. Dati da raccogliere per ogni prova

| Campo | Valore da registrare |
| --- | --- |
| esecuzione | sigla e timestamp |
| app | versione, Function UID e API |
| checkout | layout, conferma ON/OFF, guest/autenticato |
| ingresso | checkout standard, carrello o wallet |
| pagamento | standard, Shop Pay, Apple Pay, Google Pay o PayPal |
| input | presenza dei localized fields e sole lunghezze dei valori |
| output | target, lunghezza messaggio, stato e fuel |
| interfaccia | testo visibile, focus, scroll e albero accessibile |
| rete | presenza dell’errore nella risposta, senza header o token |
| risultato | ordine bloccato o completato |
| rollback | versione e configurazione ripristinate |

Non allegare i log completi: contengono identificatori tecnici e configurazione.
Produrre soltanto estratti sanitizzati.

## 6. Checkout e step di conferma

Usare la Function corrente, il target plurale e il messaggio corrente.

| Prova | Layout | Conferma | Utente | Scopo |
| --- | --- | --- | --- | --- |
| A | corrente | ON | guest | riprodurre il blocco silenzioso |
| B | corrente | OFF | guest | isolare il bug della review |
| C | layout alternativo | ON | guest | separare layout e conferma |
| D | layout alternativo | OFF | guest | completare il controllo |

Il checkout deve essere standard, non accelerato. Cercare il messaggio
nell’intera pagina, nel focus, nello scroll e nell’albero accessibile, non solo
nel contenitore `alert`.

### Decisione

- ON fallisce e OFF funziona: bug dello step di conferma isolato.
- Entrambi funzionano: il problema precedente dipendeva da sessione, autenticazione
  o pagamento; passare alla matrice delle superfici.
- Entrambi falliscono: proseguire con messaggio e target.

Disattivare stabilmente la conferma ordine non è un workaround di prodotto
accettabile per merchant italiani.

## 7. Messaggio e target

Mantenere checkout standard guest, stesso layout e `CHECKOUT_COMPLETION`.
Usare come baseline la prima configurazione della sezione 6 che rende un errore
Completion: se conferma ON fallisce e OFF funziona, eseguire le prove di
sintassi con conferma OFF. Se nessuna configurazione rende l’errore, gli esiti
visuali dei target non possono escludere alcuna sintassi; registrare comunque
input e output e passare alla Function minimale. Cambiare una sola variabile per
volta.

1. Target plurale ufficiale con messaggio ASCII:
   `Codice Fiscale obbligatorio`.
2. Target singolare camelCase:
   `$.cart.localizedField.TAX_CREDENTIAL_IT`.
3. Se negativo, forma letterale della tabella:
   `$.cart.localizedfield.TAX_CREDENTIAL_IT`.
4. Target globale `$.cart`, se le prove precedenti non erano certamente
   standard guest.
5. Un campo standard visibile, solo come controllo diagnostico.

Il campo standard non può diventare il target definitivo: collegherebbe
l’errore CF a un dato diverso e produrrebbe un’esperienza scorretta e
inaccessibile.

### Decisione

Se una forma singolare funziona:

1. verificarla con `TAX_EMAIL_IT`;
2. provare valore mancante e invalido;
3. provare italiano e inglese;
4. ripeterla con conferma ON per misurare separatamente il bug della review,
   senza invalidare il risultato ottenuto con conferma OFF;
5. verificare API stabile e API corrente;
6. eseguire la matrice essenziale delle superfici;
7. chiedere a Shopify quale sintassi sia contrattuale prima della release.

## 8. `CHECKOUT_INTERACTION`

Usare target plurale e messaggio ASCII. La Function deve validare sia a
`CHECKOUT_INTERACTION` sia a `CHECKOUT_COMPLETION`: il gate finale non viene
rimosso.

Osservare separatamente:

1. primo caricamento con CF vuoto;
2. modifica di un campo non correlato;
3. digitazione parziale del CF;
4. CF valido;
5. cancellazione di un CF precedentemente valido;
6. ingresso nella review;
7. submit finale.

Se il target inline non rende, ripetere una sola volta con `$.cart` a
Interaction.

### Criterio UX

Il workaround è candidabile soltanto se:

- il messaggio non appare prima che il cliente tenti di avanzare;
- il focus conduce chiaramente al CF;
- l’errore scompare con un valore valido;
- il cliente può continuare a modificare il checkout;
- Completion resta una barriera non aggirabile;
- checkout standard e accelerati restano coerenti.

La Function non riceve uno stato `touched` o un evento equivalente a “Continua”.
Se Interaction mostra l’errore al caricamento, non esiste un guard locale
affidabile che riproduca la validazione nativa senza aggiungere stato o UI.

Se Interaction funziona, il problema non diventa soltanto documentale:
Completion continua ad avere un difetto di rendering; Interaction è un
workaround che cambia l’UX e richiede una nuova decisione di prodotto.

## 9. Function ufficiale minimale

Se nessuna variante precedente è accettabile:

1. generare una nuova Function con la CLI supportata;
2. usare lo stesso dev store con la Validation corrente disattivata;
3. mantenere una sola regola per `TAX_CREDENTIAL_IT`;
4. usare la query ufficiale con `key`, `title` e `value`;
5. usare il codice ufficiale, target plurale dinamico, ASCII e solo Completion;
6. partire dalla Function API stabile `2026-04`;
7. ripetere con `2026-07` soltanto per isolare la versione;
8. ripetere le prove con conferma ON/OFF.

Se la Function pulita funziona:

1. provare lo stesso bundle nell’UID esistente;
2. se funziona, reintrodurre gli elementi CF Ready uno alla volta;
3. se fallisce soltanto nell’UID esistente, ricreare registrazione
   dell’estensione e Validation dopo backup e con readback.

Se fallisce anche la Function ufficiale, fermare le ipotesi locali. Un secondo
dev store italiano è soltanto l’ultimo controllo facoltativo per distinguere un
flag dello store da un difetto generale.

## 10. Matrice del solo candidato vincente

Non ripetere la matrice completa per ogni esperimento. Sul primo candidato che
funziona verificare:

- checkout standard guest;
- cliente autenticato con dati precompilati;
- one-page e three-page;
- conferma ON e OFF;
- CF mancante, invalido e valido;
- PEC mancante, invalida e valida;
- messaggi italiano e inglese;
- Shop Pay;
- Apple Pay, Google Pay e PayPal disponibili;
- ingresso accelerato dal carrello e dal checkout;
- focus, screen reader e assenza di loop.

## 11. Criteri di stop

- **Fix locale:** una sintassi target funziona coerentemente e supera la matrice
  minima.
- **Workaround candidabile:** Interaction funziona senza errori prematuri,
  conserva Completion e supera standard e accelerati.
- **Workaround respinto:** Interaction mostra errori al caricamento o durante
  una compilazione ancora incompleta.
- **Bug confermato:** conferma OFF rende il messaggio e ON lo inghiotte.
- **Escalation immediata:** la Function ufficiale minimale blocca ancora senza
  messaggio su checkout standard guest.
- **Stop anticipato:** il bug della conferma è isolato; completare soltanto i
  test singolare e Interaction già richiesti, senza altre combinazioni
  speculative.

## 12. Strade valutate e scartate

- **Checkout UI Extension nelle fasi principali:** richiede Shopify Plus e non
  copre Basic, Grow o Advanced; il relativo blocco client-side è inoltre in
  deprecazione a favore delle Validation Function.
- **Thank you o Order status extension:** interviene dopo l’ordine e non può
  rendere obbligatorio il CF.
- **Theme App Extension o avviso nel carrello:** non copre il checkout ospitato
  né tutti gli ingressi accelerati e non garantisce il blocco server-side.
- **Disattivare conferma ordine:** utile solo come controllo diagnostico; non è
  una precondizione imponibile ai merchant italiani.
- **Disattivare wallet o checkout accelerati:** impatto commerciale
  sproporzionato e promessa di compatibilità non rispettata.
- **Target su email o indirizzo:** ammesso esclusivamente come controllo;
  semanticamente e accessibilmente errato come soluzione.
- **Blocco senza messaggio:** tecnicamente osservato, ma non è un’esperienza
  comprensibile o pubblicabile.
- **Script, DOM injection o modifiche checkout non supportate:** incompatibili
  con il checkout ospitato e con la sicurezza della piattaforma.

## 13. Escalation Shopify

Se necessaria, preparare:

- Function minimale e commit riproducibile;
- store, app, Function UID, API e CLI;
- layout, conferma, autenticazione e pagamento;
- matrice degli esiti;
- timestamp e run ID;
- estratti sanitizzati di input e output;
- risposta di rete sanitizzata;
- video e accessibility snapshot;
- confronto tra target plurale e singolari;
- collegamento al bug già confermato.

Domande:

1. Qual è il target contrattuale dei localized fields per una Validation
   Function?
2. Qual è lo stato del bug di rendering a Completion nella review europea?
3. Qual è il percorso supportato per validare un localized field obbligatorio
   senza errori prematuri e su tutti i piani?
