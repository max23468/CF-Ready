# CF Ready — Ricognizione delle capacità Shopify

Glossario del dossier di richieste alla piattaforma. L'indagine comprende il prodotto attuale e le sue possibili evoluzioni, anche quando escluse oggi per limiti Shopify; non costituisce una specifica di implementazione.

## Language

**Campo fiscale nativo**:
Dato fiscale strutturato raccolto direttamente nel checkout Shopify come localized field. Nel prodotto attuale CF Ready gestisce Codice Fiscale e PEC; il dossier chiede di estendere il percorso nativo ad altri dati.
_Evitare_: campo custom, campo Interno.

**Comparsa del campo**:
Momento e condizioni in cui Shopify rende disponibile un localized field nel checkout e nell'input della Function. Dipende almeno da destinazione, origine della consegna e Paese del negozio.
_Evitare_: attivazione del campo, quando non esiste un'impostazione del merchant.

**Segnale di intento**:
Informazione che distingue il tentativo del cliente di proseguire o completare l'ordine dal semplice caricamento o aggiornamento del checkout.
_Evitare_: step, quando si intende il tentativo del cliente.

**Etichetta effettiva**:
Testo che il cliente vede su un campo nella lingua e nel mercato del suo checkout.
_Evitare_: traduzione salvata, quando non ne è stata verificata la visualizzazione.

**Opzione del campo Interno**:
Scelta del merchant che rende la seconda riga dell'indirizzo obbligatoria, facoltativa o nascosta.
_Evitare_: etichetta Interno, quando si intende la presenza o l'obbligatorietà del campo.

**Funzionalità sospesa per Shopify**:
Capacità desiderata per CF Ready, anche esclusa dall'implementazione attuale, che non può essere completata con gli strumenti pubblici Shopify disponibili e pertinenti. Comprende Partita IVA e Codice Destinatario SDI, secondo il chiarimento dell'owner e le motivazioni del Master Plan.
_Evitare_: backlog, quando il rinvio dipende da priorità, domanda o verifiche interne.

**Invio**:
Richiesta autonoma da presentare a Shopify, con canale, prove, richiesta e criterio di accettazione.
_Evitare_: scheda, quando si intende un punto di analisi non destinato a Shopify.

**Domanda secondaria**:
Quesito da porre a Shopify quando la lacuna non è dimostrata o riguarda un'evoluzione futura del prodotto.

**Costruibile oggi**:
Capacità realizzabile con API pubbliche già esistenti; resta lavoro di prodotto di CF Ready e non va chiesta a Shopify.
_Evitare_: API mancante.

**Intestatario fiscale dell'acquisto**:
Persona o organizzazione per cui viene effettuato un determinato acquisto. Non coincide necessariamente con chi usa l'account cliente o riceve la spedizione.

**Profilo fiscale**:
Insieme riutilizzabile dei dati scelti per intestare un acquisto e ricevere eventuali documenti. Un cliente può voler utilizzare profili differenti per acquisti differenti.

**Codice Destinatario SDI**:
Dato richiesto per il recapito della fattura elettronica nel contesto pertinente. La sua raccolta è una capacità distinta dall'emissione e trasmissione della fattura.
_Evitare_: integrazione SDI, quando si intende soltanto il campo da compilare.

**Verifica formale e verifica esterna**:
La verifica formale controlla la struttura del dato; quella esterna consulta una fonte identificata per uno specifico esito. Un controllo superato non prova automaticamente identità, titolarità o trattamento fiscale dell'operazione.
