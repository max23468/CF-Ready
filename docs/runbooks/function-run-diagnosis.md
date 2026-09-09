# Diagnosi dei run della Validation Function

Questo runbook ricostruisce il ramo eseguito da
`cartValidationsGenerateRun` a partire dall'input e dall'output che Shopify
conserva nel Dev Dashboard. Serve soprattutto a rispondere a «perché il
checkout non è stato bloccato?» senza aggiungere telemetria alla Function.

Il riferimento per l'ordine delle decisioni è
[`cart_validations_generate_run.ts`](../../extensions/cf-ready-validation/src/cart_validations_generate_run.ts).
La query che determina la forma dell'input è
[`cart_validations_generate_run.graphql`](../../extensions/cf-ready-validation/src/cart_validations_generate_run.graphql).
Se il sorgente cambia, aggiornare questa pagina nello stesso diff.

## Recuperare il run

Nel Dev Dashboard aprire **Apps**, scegliere CF Ready, quindi **Logs** e
**Functions**. Filtrare per store, Function e intervallo temporale, aprire il
run interessato e copiare input e output esatti in un file locale temporaneo
accessibile soltanto all'operatore. Annotare nel ticket soltanto identificativo,
orario ed esito: input e output possono contenere Codice Fiscale, PEC e
configurazione merchant e non vanno incollati in ticket, chat o log. Eliminare
il file temporaneo subito dopo la diagnosi.

Shopify mostra i dettagli del run quando l'app dispone degli accessi richiesti
dai campi della input query. Se mancano, il Dev Dashboard indica quali accessi
servono. Un membro staff o collaborator dello store può vedere tutti i dettagli
anche senza quegli scope; per i development store dell'organizzazione i
dettagli sono quindi sempre disponibili. Queste regole sono descritte in
[Monitoring and handling errors in production](https://shopify.dev/docs/apps/build/functions/monitoring-and-errors#access-function-run-details).

Se il dettaglio non è visibile sullo store segnalato, registrare gli accessi
indicati dal Dashboard e fermare la diagnosi del ramo: il solo output aggregato
non basta. Non attribuire l'esito a CF Ready finché l'input del run non è stato
letto o riprodotto su un development store.

JavaScript supporta `console.log` nelle Shopify Functions e Shopify conserva i
log fino al limite previsto. CF Ready non ne aggiunge per questa diagnosi:
l'input e l'output esistenti contengono già tutte le variabili della decisione,
mentre i campi fiscali e checkout non devono entrare nella telemetria. La fonte
corrente per logging e replay è
[Test and debug Shopify Functions](https://shopify.dev/docs/apps/build/functions/test-debug-functions).

## Leggere l'output

L'output di consenso ha questa forma logica:

```json
{
  "operations": [{ "validationAdd": { "errors": [] } }]
}
```

Uno o due elementi in `errors` indicano invece che la Function ha chiesto a
Shopify di bloccare. Se il checkout è proseguito con errori presenti, il ramo
della Function è stato ricostruito: verificare rendering e comportamento del
checkout con l'identificativo del run, perché la causa è successiva all'output.

Applicare i controlli seguenti nell'ordine indicato. Il primo consenso
anticipato incontrato chiude la diagnosi; se nessuno si applica, passare alle
regole dei singoli campi.

## 1. Configurazione e diritto

La Function restituisce consenso se `validation.metafield` è assente oppure se
`validation.metafield.jsonValue` non supera tutti i controlli seguenti.

| Controllo nell'input | Configurazione accettata                                                                                                                                                                     | Cosa dire al merchant se non coincide                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Struttura base       | oggetto con `schemaVersion: 2` o `schemaVersion: 3` ed `enabled: true`                                                                                                                        | La configurazione attiva non era disponibile al run; CF Ready ha lasciato proseguire il checkout. Verificare lo stato della Validation e salvare di nuovo le regole. |
| Data locale          | `shop.localTime.date` è una data reale nel formato `YYYY-MM-DD`, inclusi anni bisestili corretti                                                                                             | La data locale ricevuta non era utilizzabile; CF Ready ha applicato il comportamento fail-open.                                                                      |
| Regole               | `rules` è un oggetto; entrambi i campi accettano i tre valori storici e la PEC accetta anche `required_when_company` nello schema 3                                                         | Una regola non era riconosciuta; CF Ready ha lasciato proseguire il checkout. Salvare di nuovo le regole.                                                            |
| Messaggi             | `messages.it` e `messages.en` contengono tutte le chiavi `taxCodeRequired`, `taxCodeInvalid`, `pecRequired`, `pecInvalid`; ogni valore è una stringa già trimmata lunga da 1 a 200 caratteri | I messaggi erano incompleti o non validi; CF Ready ha lasciato proseguire il checkout. Ripristinare o salvare di nuovo i messaggi.                                   |
| Diritto una tantum   | `entitlement.kind` è `one_time` e `validThrough` è `null`                                                                                                                                    | Il diritto una tantum non risultava valido nel run; controllare lo stato commerciale mostrato dall'app.                                                              |
| Prova o abbonamento  | `entitlement.kind` è `trial` o `subscription`, `validThrough` è una data reale e non precede `shop.localTime.date`                                                                           | Il diritto risultava scaduto o non valido nel run; controllare prova o abbonamento mostrati dall'app.                                                                |

Qualunque altro `entitlement.kind`, un oggetto `entitlement` assente o una
scadenza malformata produce lo stesso consenso fail-open. L'ultimo giorno
indicato da `validThrough` è ancora valido.

Il campo storico `errorDisplay`, se presente, è ignorato dalla Function e non
decide più alcun ramo. Una scrittura corrente lo normalizza a `inline` soltanto
per compatibilità fra snapshot.

## 2. Step del checkout

| Come riconoscerlo nell'input                 | Esito                | Cosa dire al merchant                                                                                  |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `buyerJourney.step` è `CHECKOUT_COMPLETION`  | La diagnosi continua. | Il run apparteneva al completamento del checkout; vanno controllati geografia e campi.                 |
| `buyerJourney.step` è `CHECKOUT_INTERACTION` | La diagnosi continua. | Il run apparteneva alla compilazione del checkout; vanno controllati geografia, consegna e campi.      |
| Qualunque altro step                         | Consenso anticipato.  | CF Ready non valida in questo passaggio del percorso checkout.                                         |

## 3. Paesi osservati

I controlli geografici hanno questa precedenza.

| Come riconoscerlo nell'input                                           | Esito                                                                                                          | Cosa dire al merchant                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cart.billingAddress.countryCode` è presente e diverso da `IT`         | Consenso anticipato, anche se esiste una consegna italiana.                                                    | La fatturazione osservata era estera; CF Ready non ha applicato i campi fiscali italiani.                   |
| Almeno un `deliveryAddress.countryCode` è presente e nessuno vale `IT` | Consenso anticipato.                                                                                           | Tutte le consegne osservabili erano estere; CF Ready non doveva bloccare.                                   |
| Nessun Paese di consegna è osservabile                                 | La diagnosi continua sui soli localized field presenti. Gli indirizzi `null` non contano come Paesi osservati. | Shopify non aveva ancora esposto una consegna italiana; CF Ready può controllare soltanto i campi presenti. |
| Almeno una consegna vale `IT`, anche insieme a consegne estere         | La diagnosi continua. A Completion i campi obbligatori assenti vengono trattati come vuoti.                    | Era presente una consegna italiana; CF Ready ha applicato le regole configurate.                            |

Un indirizzo di fatturazione assente non produce consenso anticipato. Se
`cart.localizedFields` è vuoto e non esiste una consegna italiana osservabile,
la Function restituisce consenso: spiegare al merchant che Shopify non aveva
fornito né i campi da controllare né una consegna italiana che rendesse
significativa la loro assenza.

La query richiede soltanto `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`; altri localized
field non compaiono nell'array usato da questa Function. Legge inoltre
`billingAddress.company` per la regola PEC condizionale.

## 4. Regole dei singoli campi

Applicare questa tabella separatamente al Codice Fiscale e alla PEC. Il
checkout riceve consenso quando nessuno dei due campi produce un errore.

| Campo e regola osservati                                                                               | Esito                                                      | Cosa dire al merchant                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Il campo è assente, non esiste una consegna italiana e la regola è qualsiasi                           | Nessun errore per il campo.                                | Shopify non ha esposto il campo e non era osservabile una consegna italiana; CF Ready lo ha ignorato in modo fail-open.                 |
| La regola è `unmanaged`                                                                                | Nessun errore, indipendentemente dal valore.               | Il campo non era gestito dalle regole attive al momento del run.                                                                        |
| La regola è `optional_validated` e il valore è assente, `null`, vuoto o composto da soli spazi         | Nessun errore.                                             | Il campo era facoltativo e non conteneva un valore da validare.                                                                         |
| La PEC è `required_when_company`, Azienda è assente o vuota dopo il trim e la PEC è vuota              | Nessun errore.                                             | Azienda non era compilata, quindi la PEC era facoltativa.                                                                               |
| La PEC è `required_when_company`, Azienda è compilata e la PEC è vuota                                 | Errore con il messaggio `pecRequired`.                     | Azienda era compilata, quindi CF Ready ha chiesto a Shopify di bloccare per la PEC mancante.                                             |
| La regola è `required_validated` e il valore, dopo il trim, è vuoto                                    | Errore con il messaggio `taxCodeRequired` o `pecRequired`. | Il campo era obbligatorio e vuoto; CF Ready ha chiesto a Shopify di bloccare.                                                           |
| Una regola gestita e un valore non vuoto non supera il validatore                                      | Errore con il messaggio `taxCodeInvalid` o `pecInvalid`.   | Il valore non rispettava la validazione formale configurata; CF Ready ha chiesto a Shopify di bloccare.                                 |
| Una regola gestita e un valore non vuoto supera il validatore                                          | Nessun errore.                                             | Il valore rispettava la validazione formale; CF Ready non attesta che appartenga a una persona o che una casella sia realmente una PEC. |

Con almeno una consegna italiana, a Completion un campo assente viene trattato
come vuoto: `required_validated` produce quindi l'errore obbligatorio, mentre
`required_when_company` lo produce per la PEC soltanto con Azienda compilata;
`optional_validated` e `unmanaged` non producono errori. A Interaction un campo
assente non produce errori.

A Interaction un valore non vuoto segue subito la tabella. Un required vuoto
viene invece controllato soltanto se il campo è presente, ogni delivery group
ha un Paese e tutte le delivery group italiane hanno
`selectedDeliveryOption` valorizzato. Questo segnale descrive un contesto di
consegna risolto, ma non prova un clic su “Continua”.

## 5. Lingua e target degli errori

Questi dati non decidono se bloccare, ma permettono di verificare che l'output
appartenga al ramo ricostruito.

| Dato nell'input                                               | Output atteso                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `localization.language.isoCode` è `IT`                        | Messaggi presi da `messages.it`.                                                         |
| Qualunque altra lingua                                        | Messaggi presi da `messages.en`.                                                         |
| Step `CHECKOUT_INTERACTION` e campo presente                  | Target `$.cart.localizedField.TAX_CREDENTIAL_IT` o `$.cart.localizedField.TAX_EMAIL_IT`. |
| Step `CHECKOUT_COMPLETION` e campo presente                   | Target `$.cart.localizedField.TAX_CREDENTIAL_IT` o `$.cart.localizedField.TAX_EMAIL_IT`. |
| Step `CHECKOUT_COMPLETION`, consegna italiana e campo assente | Target `$.cart`.                                                                         |

## Fail-open inatteso e replay locale

L'intera funzione è racchiusa in un `try/catch`: qualunque eccezione non
prevista restituisce lo stesso output di consenso. L'input e l'output da soli
non provano che questo ramo sia stato eseguito. Se la configurazione, lo step,
la geografia e i due campi non spiegano un output vuoto, classificare il caso
come **fail-open inatteso** e riprodurlo localmente sullo stesso commit della
versione Shopify osservata.

Dire al merchant che l'output è compatibile con un fail-open inatteso e che il
caso viene riprodotto sullo stesso artefatto prima di attribuirgli una causa più
specifica.

Per un run Development già salvato dalla CLI, dalla directory dell'estensione
usare il relativo identificativo:

```bash
CFR_FUNCTION_LOG_ID=abc123
npm exec -- shopify app function replay --log "$CFR_FUNCTION_LOG_ID"
unset CFR_FUNCTION_LOG_ID
```

Per un input copiato dal Dev Dashboard, creare fuori dal repository un file
temporaneo leggibile soltanto dall'operatore, incollarvi l'input esatto e
invocare il modulo Wasm corrente. Non usare `--verbose`, perché può mostrare
dati sensibili:

```bash
cd extensions/cf-ready-validation
CFR_FUNCTION_INPUT="$(mktemp -t cf-ready-function-input)"
chmod 600 "$CFR_FUNCTION_INPUT"
# Incollare nel file l'input esatto copiato dal Dev Dashboard.
npm run build
npm run preview -- --input "$CFR_FUNCTION_INPUT" --export cart-validations-generate-run
rm "$CFR_FUNCTION_INPUT"
unset CFR_FUNCTION_INPUT
```

Confrontare l'output riprodotto byte per byte nella struttura degli errori. Se
il replay produce ancora consenso senza che alcun ramo documentato lo spieghi,
aprire un difetto sul commit e allegare soltanto una fixture sintetica minima.
Se diverge dal run Shopify, verificare prima versione, commit e input usati nel
replay. Non modificare l'input prima del replay e non conservare nel repository
l'input reale del merchant.
