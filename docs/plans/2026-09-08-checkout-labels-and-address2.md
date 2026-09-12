# Piano — Etichette native checkout e controllo del campo “Interno”

**Stato:** implementazione distribuita in Development; matrice reale parziale in attesa del consenso agli scope opzionali e di uno store sacrificabile
**Data:** 8 settembre 2026
**Versione candidata:** `1.7.0`
**Ambiente della prova esplorativa:** Development

## 1. Decisione proposta

La proposta resta subordinata al gate di fattibilità descritto nel §3.1. CF
Ready abilita la scrittura automatica soltanto per le combinazioni di chiave,
lingua e mercato di cui il checkout reale Development ha confermato il
rendering. Dove Shopify espone soltanto il contenuto sorgente o registra una
traduzione senza renderla, l'app usa una procedura guidata nell'Admin e presenta
lo stato come dichiarato dal merchant.

CF Ready aggiunge una funzione facoltativa per:

1. leggere le etichette native di Codice Fiscale e PEC in italiano e inglese;
2. sincronizzare con le regole `unmanaged`, `optional_validated` e
   `required_validated` gli slot per cui la scrittura API è stata provata;
3. mostrare contenuto sorgente, traduzioni globali, override di mercato e
   contesto di fallback senza presentare il readback Admin come rendering;
4. leggere le due etichette Shopify del campo “Interno” / “Indirizzo 2”;
5. rilevare un testo non standard e riconoscere un probabile conflitto fiscale,
   senza attribuirne autore o causa;
6. ripristinare via API soltanto traduzioni e override scrivibili, e guidare il
   merchant nell'editor Shopify per il contenuto sorgente;
7. continuare a chiedere al merchant lo stato dell’opzione del modulo, perché
   Shopify non espone se “Interno” è escluso, facoltativo oppure obbligatorio.

La gestione di Codice Fiscale e PEC viene riconciliata all'apertura di Regole
checkout, al salvataggio e alla richiesta esplicita di rilettura finché il
merchant la lascia attiva. Non esiste un controllo periodico nella prima
versione. Il campo “Interno” viene controllato negli stessi momenti, ma viene
modificato soltanto su richiesta: può avere personalizzazioni legittime che CF
Ready deve preservare.

La funzione parte disattivata. Nessuna installazione esistente riceve nuove
etichette senza consenso e nessun merchant deve concedere i nuovi permessi per
continuare a usare la Validation attuale.

## 2. Risultato per il merchant

Nella stessa pagina in cui sceglie le regole, il merchant trova una sola
sezione madre “Campi del checkout”, introdotta dal riepilogo:

> CF Ready mantiene coerenti i campi fiscali nativi e controlla che il campo
> Interno non li duplichi.

La sezione contiene due blocchi distinti e impilati:

1. “Campi nativi: Codice Fiscale e PEC”, dedicato a regole, etichette IT/EN e
   sincronizzazione automatica;
2. “Controllo del campo Interno”, dedicato a lettura, possibile duplicazione e
   ripristino guidato.

Nel loro insieme i due blocchi mostrano:

- i valori registrati da Shopify per Codice Fiscale e PEC in italiano e
  inglese, distinguendo il rendering verificato da quello da controllare;
- il confronto tra testo corrente e testo che CF Ready applicherà;
- le eventuali differenze tra mercati;
- entrambe le varianti del campo “Interno”, ordinaria e facoltativa;
- un avviso basato sui testi osservati quando “Interno” sembra rinominato come
  Codice Fiscale;
- l’azione per ripristinare le etichette standard di “Interno”;
- il collegamento e le istruzioni per verificare manualmente l’opzione del
  modulo checkout.

Su uno store come Numisleo, con italiano e inglese pubblicati, CF Ready mostra
entrambe le lingue, i valori registrati e il contesto di mercato prima di
proporre qualsiasi scrittura. Chiama “effettivo” un valore soltanto dopo una
verifica nel checkout reale per quello stesso contesto.

## 3. Evidenza già raccolta in Development

La versione `1.7.0` è stata integrata in `develop` come `957fb0b` e distribuita
in Development il 9 settembre 2026. Il workflow `34348227431` ha applicato la
migrazione `0018`, attivato lo snapshot Shopify
`1.7.0-dev.066bbf281ba6`, distribuito il Worker ed eseguito smoke, capacità e
readback sullo stesso tree. La sezione “Campi nativi: Codice Fiscale e PEC” è
stata poi riletta nell’Admin reale.

La [matrice delle capacità](../evidence/2026-09-09-checkout-labels-capability-matrix.md)
registra separatamente le prove automatiche, il rilascio Development e i casi
che richiedono ancora un’azione dell’owner o un ambiente sacrificabile.

Una verifica in sola lettura sull’Admin GraphQL API `2026-07` ha trovato una
sola risorsa `ONLINE_STORE_THEME_LOCALE_CONTENT` contenente le chiavi fiscali e
le chiavi di “Interno”:

```text
gid://shopify/OnlineStoreThemeLocaleContent/186856898864
```

Il GID appartiene esclusivamente alla prova corrente e non deve essere inserito
nel codice. L’app deve scoprire la risorsa a ogni riconciliazione utile.

Le chiavi osservate sono:

```text
shopify.checkout.localized_fields.additional_information.tax_credential_it
shopify.checkout.localized_fields.additional_information.tax_email_it
shopify.checkout.contact.address2_label
shopify.checkout.contact.optional_address2_label
```

Lo store Development aveva italiano primario e inglese pubblicato. Per
“Interno” risultavano questi valori:

| Variante | Italiano | Inglese |
| --- | --- | --- |
| Ordinaria | Interno | Apartment, suite, etc. |
| Facoltativa | Interno, scala, ecc. (facoltativo) | Apartment, suite, etc. (optional) |

Il mercato Italia non aveva override specifici per le due chiavi di “Interno”.
La prova conferma che le etichette sono leggibili; non dimostra che l’API esponga
lo stato del campo nel modulo.

Le fonti Shopify pertinenti sono:

- [`shopLocales`](https://shopify.dev/docs/api/admin-graphql/latest/queries/shopLocales);
- [`TranslatableResource`](https://shopify.dev/docs/api/admin-graphql/latest/objects/translatableresource);
- [`Translation`](https://shopify.dev/docs/api/admin-graphql/latest/objects/translation);
- [`translationsRegister`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/translationsRegister);
- [`translationsRemove`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/translationsRemove);
- [`CheckoutAndAccountsConfiguration`](https://shopify.dev/docs/api/admin-graphql/latest/objects/CheckoutAndAccountsConfiguration).

### 3.1 Gate di fattibilità prima dell'implementazione

La documentazione Shopify consente `translationsRegister` nella lingua
primaria soltanto con `marketId`. La prova esplorativa ha inoltre mostrato che
un override può risultare nel readback senza cambiare le chiavi fiscali nel
checkout. Prima di progettare UI definitiva, migrazione D1 e orchestrazione del
salvataggio, una PoC isolata deve quindi provare per entrambe le chiavi fiscali:

1. lingua primaria con override del mercato effettivamente usato dal checkout;
2. lingua secondaria con traduzione globale;
3. lingua secondaria con override di mercato;
4. transizioni `optional_validated` → `required_validated` e ritorno;
5. rimozione dell'override o della traduzione e ritorno al fallback precedente;
6. readback Admin e rendering del checkout nella stessa lingua, mercato, URL e
   sessione.

Ogni esito viene registrato per `risorsa + chiave + locale esatto + mercato`.
Un successo su una stringa di controllo o su una sola chiave non abilita le
altre. Se la lingua primaria delle chiavi fiscali resta non modificabile nel
checkout, la prima versione usa per quella lingua il percorso guidato
“Impostazioni → Checkout → Modifica contenuto del checkout”.

Il gate usa uno store Development sacrificabile. I test che cambiano lingua
primaria, disinstallano l'app o modificano traduzioni di base non vengono
eseguiti sullo store Development condiviso: Shopify può eliminare traduzioni
quando cambia la lingua predefinita.

## 4. Contratto funzionale

### 4.1 Etichette di Codice Fiscale e PEC

Il merchant può scegliere “Controlla le etichette Shopify”. Il riquadro spiega
quali dati diventano accessibili, senza anticipare esempi delle etichette.
Soltanto questa azione apre la richiesta degli scope opzionali. Dopo il consenso
CF Ready legge Shopify, mostra il confronto completo e richiede una seconda
conferma prima della prima scrittura. Il rifiuto degli scope lascia disponibile
la procedura guidata manuale.

Per gli slot che hanno superato il gate automatico:

- `optional_validated` applica un’etichetta che dichiara esplicitamente che il
  campo è facoltativo;
- `required_validated` rimuove l’indicazione “facoltativo” e usa un testo
  neutro;
- `unmanaged` interrompe la gestione del campo e ripristina il valore precedente
  quando è ancora sicuro farlo;
- ogni salvataggio delle regole riconcilia le lingue e i mercati inclusi nella
  gestione;
- una modifica esterna interrompe la scrittura automatica sullo slot coinvolto
  e richiede una scelta esplicita.

Per uno slot di sola lettura, le stesse regole producono il testo consigliato e
una verifica guidata. CF Ready non dichiara sincronizzato uno slot finché il
merchant non conferma il checkout reale. Se nello stesso store alcuni slot sono
scrivibili e altri no, l'interfaccia mostra un esito distinto per ciascuno e non
trasforma un successo parziale in un successo globale.

La Validation, i messaggi d’errore e le etichette restano concetti distinti. La
Shopify Function continua a usare soltanto regole e messaggi nel proprio
metafield; non legge traduzioni e non effettua rete.

### 4.2 Testi predefiniti

| Regola | Codice Fiscale IT | PEC IT | Codice Fiscale EN | PEC EN |
| --- | --- | --- | --- | --- |
| `unmanaged` | Ripristina il testo precedente | Ripristina il testo precedente | Ripristina il testo precedente | Ripristina il testo precedente |
| `optional_validated` | Codice fiscale (facoltativo) | PEC (facoltativa) | Italian tax code (optional) | Certified email address (PEC) (optional) |
| `required_validated` | Codice fiscale | PEC | Italian tax code | Certified email address (PEC) |

Il testo dello stato obbligatorio resta neutro. Evita un’affermazione falsa se
la Validation viene disattivata, il diritto commerciale scade o l’app viene
rimossa. Il messaggio inline comunica al cliente l’obbligatorietà quando la
regola viene applicata.

La prima versione non aggiunge un editor libero per queste etichette. Questa è
una decisione di prodotto esplicita che sostituisce la richiesta iniziale di
testo arbitrario: riduce conflitti fra copy e obbligatorietà e limita le
scritture a valori deterministici verificabili. Il merchant può scegliere i
testi automatici, seguire la procedura guidata con gli stessi testi consigliati
oppure mantenere la propria personalizzazione. I messaggi di errore restano
personalizzabili nella pagina “Messaggi al cliente”.

### 4.3 Controllo di “Interno”

CF Ready legge sempre entrambe le chiavi, perché Shopify conserva sia il testo
della variante ordinaria sia quello della variante facoltativa senza indicare
quale venga mostrato dal modulo corrente.

Il controllo assegna uno dei seguenti stati:

| Stato | Significato | Azione proposta |
| --- | --- | --- |
| `expected` | Tutte le varianti osservate corrispondono alle copie di riferimento CF Ready | Verificare soltanto l’opzione del modulo |
| `nonstandard` | Almeno un testo è diverso, senza un riferimento fiscale certo | Mostrare il confronto e chiedere se il testo è intenzionale |
| `fiscal_conflict` | Un testo indica chiaramente Codice Fiscale o tax code | Mostrare un avviso forte e proporre il ripristino |
| `unknown` | Risorsa, lingua, mercato o API non sono determinabili | Conservare la verifica manuale attuale |

La classificazione è affiancata da due segnali indipendenti:

- `has_market_override`, che indica la presenza di almeno un override e mostra
  lingua, mercato e valore registrato;
- `external_change`, che indica una differenza rispetto all'ultimo valore
  scritto o accettato da CF Ready e richiede una nuova decisione.

La presenza di una traduzione non basta a dimostrare una modifica: le lingue
secondarie possiedono normalmente traduzioni Shopify. Il controllo confronta:

1. testo sorgente della lingua primaria;
2. copie standard IT/EN versionate da CF Ready;
3. override globali e di mercato;
4. ultimo valore osservato, scritto o accettato da CF Ready.

L'API non espone autore o provenienza di una traduzione. `nonstandard` significa
quindi soltanto “diverso dalla copia di riferimento CF Ready”; non dimostra che
il merchant abbia manomesso il testo né che la copia Shopify sia rimasta
immutata fra versioni.

Le espressioni fiscali servono a stabilire la gravità dell’avviso. La prima
allowlist comprende forme inequivocabili come “codice fiscale”, “tax code” e
“fiscal code”. L’acronimo isolato “CF” produce `nonstandard`, perché può avere
altri significati.

### 4.4 Ripristino di “Interno”

Il ripristino è un’azione separata dalla sincronizzazione delle etichette
fiscali e mostra sempre un confronto “attuale → dopo il ripristino”.

Per una traduzione globale o un override di mercato scrivibile, CF Ready:

1. rilegge sorgente, traduzioni e digest;
2. verifica che la fotografia mostrata al merchant sia ancora corrente;
3. conserva i valori precedenti;
4. ripristina soltanto gli slot inclusi nella conferma, registrando nuovamente
   il valore originario se esisteva o rimuovendo la traduzione se era assente;
5. esegue il readback;
6. mostra il collegamento alle impostazioni checkout;
7. chiede al merchant di confermare che la seconda riga sia “Facoltativa” o
   “Non includere”.

Il contenuto sorgente della lingua primaria è di sola lettura per questo
contratto. Se “Interno” è stato rinominato tramite “Modifica contenuto del
checkout”, CF Ready mostra il valore rilevato, la copia consigliata e il
percorso esatto nell'Admin; registra il ripristino soltanto dopo la conferma del
merchant e del checkout reale.

CF Ready non modifica automaticamente “Interno” quando incontra un testo
personalizzato. Un merchant può usarlo legittimamente per scala, citofono,
reparto o istruzioni di consegna.

### 4.5 Limite che resta manuale

`CheckoutAndAccountsConfiguration` espone branding, profili e override, ma non
lo stato della seconda riga dell’indirizzo. Le quattro etichette vengono
restituite anche quando una sola variante è visibile o il campo è escluso.

Di conseguenza:

- un’etichetta fiscale osservata prova un probabile conflitto;
- un’etichetta standard non prova che il campo non venga comunque usato per il
  Codice Fiscale;
- la conferma sullo stato del modulo resta necessaria;
- CF Ready non presenta mai il controllo come verifica completa delle opzioni
  checkout.

## 5. Lingue, mercati e contesto di rendering

Ogni slot registrato viene identificato da:

```text
risorsa + chiave + locale Shopify esatto + mercato
```

Per ciascun locale italiano o inglese supportato CF Ready legge:

1. il contenuto sorgente;
2. la traduzione globale;
3. la traduzione specifica per ogni mercato pertinente;
4. lo stato `outdated`;
5. lo stato pubblicato della lingua.

Shopify può applicare una catena che comprende:

```text
override del locale nel mercato corrente
→ valori ereditati da un mercato padre
→ traduzione globale del locale
→ lingua predefinita del mercato e relativi fallback
→ contenuto sorgente della lingua primaria
```

Il resolver Admin descrive i valori registrati e la precedenza candidata; non
assegna lo stato “reso nel checkout”. Il checkout reale, aperto con URL, lingua,
Paese e mercato determinati, assegna tale stato. Mercati annidati o una catena
non ricostruibile producono “Rendering da verificare” invece di un valore
effettivo inventato.

La prima versione gestisce la famiglia linguistica italiana e quella inglese.
Conserva e invia sempre il codice esatto restituito da `shopLocales`, per
esempio `it`, `it-IT`, `en` oppure `en-GB`; non converte un codice regionale in
un altro. Una variante regionale non coperta dalla PoC resta in sola lettura.
Una lingua abilitata ma non pubblicata viene letta e può essere preparata, con
lo stato “Non ancora visibile ai clienti”. Le altre lingue restano sotto il
fallback Shopify e vengono segnalate senza scrittura.

La risorsa viene scoperta tramite
`translatableResources(resourceType: ONLINE_STORE_THEME_LOCALE_CONTENT)`. CF
Ready risolve ogni chiave verso una sola risorsa candidata e raggruppa le
mutation per `resourceId`. Una chiave assente o associata a più risorse
ambigue blocca soltanto lo slot coinvolto; il caso osservato di una sola
risorsa con tutte le chiavi resta il percorso ordinario.

## 6. Permessi

`write_validations` resta obbligatorio. La nuova funzione dichiara come scope
opzionali:

```text
write_translations
read_locales
read_markets
```

`write_translations` comprende la lettura delle traduzioni. `read_locales`
serve a enumerare lingue primarie, abilitate e pubblicate. `read_markets` serve
a risolvere gli override effettivi.

Il merchant concede gli scope dalla sezione etichette tramite la richiesta
App Bridge prevista da Shopify. Il rifiuto lascia disponibili regole, messaggi,
simulatore e Validation. L’app non richiede accesso a ordini, clienti,
indirizzi, temi o dati protetti.

Prima della richiesta, l'app mostra la spiegazione dei permessi senza esempi dei
testi proposti. Il confronto con lo stato Shopify avviene dopo che tutti e tre
gli scope sono concessi. `app/scopes_update` aggiorna la sessione offline e marca la
funzione `scope_required` quando uno scope viene revocato; conserva baseline e
ownership per consentire un eventuale ripristino dopo un nuovo consenso, senza
tentare scritture con un token insufficiente.

I manifest Development e Production dichiarano i tre valori in
`optional_scopes`, mentre `scopes` e la variabile Cloudflare `SCOPES` continuano
a contenere soltanto `write_validations`. Preflight, parser sicuro della
configurazione, test dei manifest e readback del deploy verificano entrambi gli
ambienti senza stampare token. La configurazione Shopify con gli scope
opzionali deve essere distribuita sul Development store prima che l'interfaccia
chiami `shopify.scopes.request()`.

## 7. Proprietà e conflitti

Shopify resta la fonte autorevole per ogni etichetta. D1 conserva soltanto lo
stato operativo necessario per riconoscere le modifiche di CF Ready e offrire
un ripristino prudente.

Al primo consenso CF Ready registra, per ogni slot toccato:

- presenza o assenza della traduzione originale;
- valore originale;
- ultimo valore scritto da CF Ready;
- digest sorgente usato;
- istante dell’ultimo readback;
- decisione del merchant per le etichette di “Interno”.

Ogni nuova attivazione apre un'epoca di gestione. La baseline della nuova epoca
è il valore Shopify riletto in quel momento; una baseline appartenente a una
gestione precedente non viene riutilizzata per sovrascrivere cambiamenti
avvenuti mentre la funzione era disattivata.

Prima di ogni scrittura confronta il valore Shopify con l’ultimo valore scritto.
Se differiscono, considera la modifica esterna e offre:

- “Usa di nuovo i testi CF Ready”;
- “Mantieni i testi attuali e interrompi la gestione”.

La prima azione mostra nuovamente il confronto e richiede conferma, perché
assume intenzionalmente il controllo del valore esterno appena rilevato.

Il ripristino avviene soltanto se il valore corrente coincide ancora con
l’ultimo valore scritto da CF Ready. Una modifica più recente viene preservata.

## 8. Coerenza del salvataggio

Regole e traduzioni appartengono a risorse Shopify diverse e non condividono
una transazione. Il salvataggio usa lo stesso lock per store della Validation e
ordina le operazioni per evitare che il checkout dichiari “facoltativo” mentre
la regola è già obbligatoria.

L'implementazione corrente di `writeValidation` acquisisce internamente la
lease. Prima di aggiungere le traduzioni va estratta una primitiva di scrittura
che riceva la lease già detenuta. L'orchestratore acquisisce e rinnova una sola
lease per l'intera sequenza; non richiama `writeValidation` dall'interno di un
secondo lock.

### 8.1 Sequenza

1. Autenticare store e sessione.
2. Acquisire il lock per store.
3. Rileggere configurazione, etichette, lingue, mercati e digest.
4. Verificare `configHash`, revisione delle etichette e modifiche esterne.
5. Per i passaggi verso `required_validated`, rimuovere prima l’indicazione
   “facoltativo”.
6. Scrivere la configurazione Validation.
7. Per i passaggi verso `optional_validated`, aggiungere dopo l’indicazione
   “facoltativo”.
8. Per i passaggi verso `unmanaged`, ripristinare il valore precedente quando
   è ancora sotto il controllo di CF Ready.
9. Rileggere configurazione e traduzioni.
10. Persistire soltanto gli esiti confermati.

### 8.2 Esiti parziali

- Se la fase preventiva fallisce, le regole restano invariate.
- Se la Validation fallisce dopo la neutralizzazione, il campo conserva
  un’etichetta neutra e la regola precedente.
- Se l’applicazione di “facoltativo” fallisce dopo il salvataggio, la regola è
  facoltativa con un’etichetta neutra; l’app mostra “Regole salvate, etichette
  da sincronizzare”.
- Un readback ambiguo produce uno stato di riparazione e non un successo pieno.

`translationsRegister` usa input in batch raggruppati per `resourceId`.
`translationsRemove` viene invece suddivisa per insiemi omogenei di chiave,
locale e mercato: i suoi array possono selezionare più combinazioni e non devono
cancellare uno slot che il merchant non ha confermato. Ogni mutation controlla
errori GraphQL e `userError`, compreso il relativo `TranslationErrorCode`.

Un digest superato permette una rilettura e un solo nuovo tentativo. Un errore
`THROTTLED` usa `extensions.cost.throttleStatus` per calcolare l'attesa, con
numero di tentativi e durata massima limitati; terminato il budget, la regola
resta nell'esito parziale sicuro già descritto e l'interfaccia propone una nuova
sincronizzazione.

## 9. Persistenza D1

Il metafield della Function non cambia schema. Le etichette non partecipano
all’esecuzione checkout.

### 9.1 Stato per store

`app_state` riceve campi equivalenti a:

| Campo | Significato |
| --- | --- |
| `checkout_labels_mode` | `off`, `guided`, `automatic`, `partial` |
| `checkout_labels_management_epoch` | UUID della baseline acquisita per l'attivazione corrente |
| `checkout_labels_enabled_at` | istante del consenso alla gestione CF/PEC |
| `checkout_labels_last_sync_at` | ultimo readback completo |
| `checkout_labels_last_error_code` | errore tecnico minimizzato |
| `checkout_labels_decision` | `pending` oppure `accepted` quando il merchant sceglie di conservare le proprie etichette |
| `checkout_labels_accepted_revision` | revisione dello snapshot Shopify accettato, oppure `NULL` quando gli scope non sono stati concessi |
| `checkout_labels_reviewed_at` | istante dell’ultima scelta esplicita sulle etichette CF/PEC |
| `address2_classification` | `unknown`, `expected`, `nonstandard`, `fiscal_conflict` |
| `address2_has_market_override` | presenza di override osservati |
| `address2_external_change_at` | modifica successiva alla baseline o decisione precedente |
| `address2_decision` | `pending`, `accepted`, `restored`, `manual_restore_required` |
| `address2_reviewed_at` | ultima decisione o verifica |

La colonna esistente `address2_conflict_declared_at` viene interpretata durante
la migrazione per conservare la dichiarazione reale del merchant. Non viene
rimossa da una migrazione già applicata.

### 9.2 Slot osservati o gestiti

Una nuova tabella `checkout_label_slots` contiene:

| Campo | Significato |
| --- | --- |
| `shop_id` | store proprietario |
| `resource_id` | risorsa osservata, trattata come cache |
| `translation_key` | una delle quattro chiavi allowlistate |
| `locale` | codice Shopify esatto appartenente alla famiglia IT o EN |
| `market_id` | mercato o stringa vuota per il valore globale |
| `slot_kind` | `source`, `global_translation` oppure `market_translation` |
| `write_capability` | `read_only`, `guided` oppure `automatic` secondo il gate |
| `management_epoch` | epoca che possiede baseline e ultima scrittura |
| `original_present` | distingue traduzione assente e testo vuoto |
| `original_value` | valore precedente necessario al ripristino |
| `last_written_value` | valore che CF Ready può ancora considerare proprio |
| `source_digest` | digest dell’ultima scrittura |
| `last_observed_at` | ultimo readback dello slot |

La chiave primaria comprende store, risorsa, chiave, locale, mercato e tipo di
slot. `shop_id` mantiene la foreign key con `ON DELETE CASCADE`. La migrazione è
forward-only e i test di `shop/redact` provano l'eliminazione di righe e stato
aggregato.

Le etichette possono contenere testo libero del merchant. Non entrano in log,
telemetria, eventi owner o diagnostica copiata. Il database le conserva soltanto
per ownership e ripristino.

## 10. Superfici del prodotto

### 10.1 Regole checkout

La pagina resta il centro della funzione.

Le scelte delle regole e i controlli sulle etichette vivono nella pagina Regole.
Su desktop i box “Campo Interno” e “Testi del checkout”
occupano, in questo ordine, la colonna sinistra sotto le regole, mentre il
simulatore resta nella colonna destra. Un solo selettore mostra Italiano o
Inglese e conserva la scelta durante la sessione e le riletture Shopify. Se
mancano i permessi opzionali, il box per richiederli compare subito sotto il
selettore, prima del blocco “Campo Interno”.

Il primo blocco, “Campo Interno”, contiene:

- scelta merchant fra variante obbligatoria e facoltativa, perché Shopify non
  espone questa impostazione tramite l’Admin API;
- sola variante attiva nella lingua selezionata;
- stato automatico;
- testo personalizzato osservato;
- azione “Ripristina le traduzioni gestibili” quando applicabile;
- procedura guidata per il contenuto sorgente della lingua primaria;
- azione “Mantieni questa personalizzazione”;
- istruzioni per l’opzione del modulo;
- collegamento alle impostazioni Checkout per cambiare l’opzione dichiarata.

Il secondo blocco, “Testi del checkout”, contiene:

- le tre modalità indipendenti dei due campi;
- stato dei permessi;
- azione per richiedere gli scope opzionali quando assenti;
- modalità `Automatica`, `Guidata` o `Mista` determinata dal gate e dagli slot
  disponibili sullo store;
- istruzioni per ogni verifica manuale raccolte in pannelli espandibili, chiusi
  all’apertura;
- interruttore di gestione automatica soltanto quando almeno uno slot è
  scrivibile;
- valore predefinito della lingua selezionata e sole personalizzazioni di
  mercato;
- “Campo attuale”, “Campo dopo il salvataggio” e “Nessuna modifica” quando i
  valori coincidono;
- stato pubblicato della lingua;
- badge per eventuali override di mercato;
- data dell’ultima verifica manuale valida;
- ultima sincronizzazione;
- azione “Rileggi i campi da Shopify”, che esegue una nuova lettura server,
  mostra lo stato di caricamento e applica subito alla pagina snapshot, stati e
  conferme aggiornati; un esito visibile conferma che la rilettura è terminata;
- azione “Ripristina e interrompi la gestione” per gli slot posseduti;
- procedura numerata che distingue l’editor del contenuto checkout della lingua
  primaria da Lingue/Translate & Adapt per lingue secondarie e mercati, quindi
  richiede una nuova rilettura prima della conferma.

I due blocchi conservano stato, errori e azioni separati. Un errore sulle
traduzioni di “Interno” non deve apparire come un errore della Validation, e il
merchant non deve poter dedurre che CF Ready validi il contenuto della seconda
riga dell’indirizzo.

La Save Bar comprende regole e modalità etichette. La prima scrittura automatica
apre un modal Polaris che elenca i campi realmente modificati. La scelta della
variante di “Interno”, la richiesta degli scope e le azioni di ripristino usano
azioni separate; anche il ripristino viene confermato con un modal Polaris.

Un conflitto di configurazione deve mostrare anche le differenze sulle
etichette. “Riapplica le mie modifiche” ricalcola il piano contro il readback
più recente; non forza valori osservati in precedenza.

### 10.2 Simulatore checkout

Il simulatore deve rappresentare anche il nuovo contratto, continuando a
dichiararsi anteprima locale.

Modifiche previste:

1. selettore interno `Italiano` / `Inglese` nell’interfaccia italiana e
   `Italian` / `English` nell’interfaccia inglese, indipendente dalla lingua
   dell’Admin;
2. etichette CF e PEC derivate dalla bozza delle regole;
3. indicazione “Testo attuale Shopify” oppure “Testo dopo il salvataggio”;
4. supporto al caso `unmanaged`, nel quale il campo resta assente dal simulatore
   CF Ready;
5. esclusione del campo “Interno”, che CF Ready non gestisce né valida.

Il simulatore usa gli stessi resolver puri impiegati dal server per scegliere
copy, lingua e stato, ma non invia traduzioni e non conserva i valori digitati.
Il controllo del campo “Interno” resta nella sezione dedicata della pagina
Regole checkout.

### 10.3 Onboarding

L’onboarding resta di quattro passi.

**Passo 1 — Cosa fa CF Ready**

- aggiunge che CF Ready può allineare le etichette native dopo consenso;
- chiarisce che il tema e i campi non vengono creati;
- distingue etichette leggibili e opzione di “Interno” non leggibile.

**Passo 2 — Scegli cosa controllare**

- mantiene le tre modalità per campo;
- mostra un’anteprima compatta delle etichette IT/EN;
- offre l’attivazione facoltativa dei permessi e della sincronizzazione;
- permette di proseguire senza concedere i permessi.

**Passo 3 — Anteprima**

- riepiloga il comportamento delle regole, il loro ambito e i messaggi
  configurati;
- presenta il controllo automatico senza affermare che il checkout reale sia
  stato verificato.

**Passo 4 — Riepilogo e attivazione**

- riepiloga regole, Validation, lingue e gestione etichette;
- mostra lo stato del controllo “Interno”;
- richiede la conferma manuale sull’opzione del modulo quando necessaria;
- non blocca l’attivazione per un’avvertenza su “Interno”, coerentemente con il
  rischio attuale;
- permette di correggere o accettare una personalizzazione prima di terminare.

La riapertura dell’onboarding rilegge i valori correnti e non riattiva
automaticamente una gestione precedentemente disabilitata.

### 10.4 Home

La Home aggiunge informazioni soltanto quando servono un’azione o una decisione.

La checklist iniziale comprende “Controlla le etichette del checkout”. Il punto
è completato quando:

- la gestione automatica è attiva e sincronizzata; oppure
- il merchant ha scelto consapevolmente di mantenere le proprie etichette.

La seconda scelta resta disponibile anche senza concedere gli scope opzionali.
Se il merchant li concede in seguito, il primo snapshot Shopify invalida la
scelta priva di revisione e richiede un nuovo confronto. Anche una lingua, un
mercato o un testo diverso dalla revisione accettata riporta la scelta a
`pending`.

La Home mostra un banner con collegamento a “Regole checkout” per:

- permessi revocati;
- sincronizzazione parziale;
- modifica esterna;
- nuova lingua o nuovo mercato da controllare;
- probabile conflitto fiscale su “Interno”;
- risorsa Shopify cambiata o ambigua.

Uno stato verde permanente non aggiunge una nuova card. Il riepilogo esistente
può includere una riga breve, per esempio “Etichette IT/EN sincronizzate”.

### 10.5 Messaggi al cliente

Gli otto messaggi configurabili non cambiano contratto.

La pagina aggiunge una nota breve:

> Le etichette identificano i campi; questi messaggi spiegano al cliente cosa
> correggere. Gestisci le etichette da Regole checkout.

L’anteprima dei messaggi usa le etichette effettive IT/EN quando disponibili e
mostra un collegamento alla sezione etichette. Nessun nuovo editor duplica i
testi di Codice Fiscale e PEC.

### 10.6 Guida e FAQ

La Guida aggiorna o aggiunge almeno queste voci bilingui:

1. **Come funzionano le etichette automatiche** — consenso, lingue, mercati e
   rapporto con le regole.
2. **Perché vedo ancora “facoltativo”** — permessi, override, modifica esterna e
   azione di risincronizzazione.
3. **Uso “Interno” per il Codice Fiscale** — controllo automatico, ripristino e
   verifica dell’opzione del modulo.
4. **CF Ready può sapere se “Interno” è facoltativo o nascosto?** — limite
   esplicito dell’API.
5. **Cosa succede se uso Translate & Adapt o un’altra app** — rilevamento del
   conflitto e preservazione della modifica.
6. **Cosa succede quando disattivo la gestione** — ripristino prudente e valori
   che restano invariati in caso di modifica esterna.
7. **Cosa succede alla disinstallazione** — esito provato in Development e
   istruzioni di ripristino prima della rimozione, se necessarie.

La FAQ attuale che afferma che CF Ready non può leggere o modificare
l’etichetta di “Interno” deve essere riscritta. Deve continuare a dichiarare che
l’app non conosce l’opzione del modulo.

### 10.7 Diagnosi e supporto

“Aggiorna e verifica” nella Guida estende il readback a:

- permessi concessi;
- risorsa trovata;
- lingue pubblicate;
- mercati letti;
- stato della sincronizzazione CF/PEC;
- stato del controllo “Interno”;
- presenza di conflitti o di un esito parziale.

La diagnostica copiata include soltanto codici e stati tecnici:

```text
checkout_labels_enabled=yes|no
checkout_labels_mode=off|guided|automatic|partial
checkout_labels_status=synced|action_required|scope_required|unknown
address2_classification=expected|nonstandard|fiscal_conflict|unknown
address2_decision=pending|accepted|restored|manual_restore_required
address2_market_override=yes|no
locales=it,en
market_count=<numero>
last_label_sync=<istante>
label_error_code=<codice>
```

Non include etichette personalizzate, GID completi dei mercati o altri contenuti
del merchant. Il supporto può chiedere uno screenshot separato soltanto quando
serve.

### 10.8 Sito pubblico, listing e note di rilascio

Dopo la prova Production, sito e listing possono aggiungere una promessa
misurata:

> Mantiene coerenti in italiano e inglese le etichette native di Codice Fiscale
> e PEC e ti segnala se il campo Interno rischia di duplicare la raccolta.

I testi devono evitare di affermare che CF Ready conosca tutte le impostazioni
del modulo. Privacy Policy e pagina Supporto devono spiegare che l’app legge e,
su richiesta, modifica contenuti di traduzione del checkout senza leggere dati
dei clienti.

La listing viene aggiornata soltanto dopo il collaudo reale e il rilascio della
funzione. Un nuovo screenshot è opportuno se la sezione etichette migliora la
comprensione del valore; non è un prerequisito tecnico della release.

### 10.9 Telemetria e notifiche owner

Gli eventi tecnici ammessi contengono soltanto esiti allowlistati, per esempio:

- `checkout_labels_enabled`;
- `checkout_labels_sync_failed` con `error_code`;
- `address2_fiscal_conflict_detected`;
- `address2_labels_restored`.

Non vengono registrati i testi osservati. Questi eventi non richiedono nuove
notifiche Telegram: la funzione resta visibile al merchant e nella diagnostica.

## 11. Errori applicativi

La proposta introduce codici stabili equivalenti a:

| Codice | Significato |
| --- | --- |
| `checkout_labels_scope_required` | permessi opzionali assenti |
| `checkout_labels_resource_missing` | nessuna risorsa contiene le chiavi richieste |
| `checkout_labels_resource_ambiguous` | più risorse non distinguibili |
| `checkout_labels_locale_missing` | lingua richiesta non abilitata |
| `checkout_labels_conflict` | modifica esterna osservata |
| `checkout_labels_stale_digest` | contenuto cambiato durante la scrittura |
| `checkout_labels_partial_sync` | solo alcuni slot confermati |
| `checkout_labels_readback_failed` | Shopify non ha confermato il risultato |
| `address2_restore_conflict` | “Interno” è cambiato dopo la conferma |

I messaggi merchant sono bilingui e indicano l’azione concreta. Log e
telemetria conservano soltanto il codice.

## 12. Disattivazione, scadenza e disinstallazione

La gestione delle etichette è configurabile anche senza entitlement, come le
regole e i messaggi. Il merchant deve poter leggere e ripristinare le etichette
anche dopo la fine della prova.

Quando la Validation viene disattivata o il diritto scade:

- le etichette obbligatorie restano neutre;
- le etichette facoltative restano semanticamente corrette;
- CF Ready non effettua scritture periodiche soltanto per il billing;
- il merchant può comunque interrompere la gestione e ripristinare i valori.

Prima della release va provato se Shopify conserva o elimina queste traduzioni
dopo la disinstallazione. CF Ready non deve dipendere da una chiamata Admin
successiva alla revoca del token. Se le traduzioni restano, Guida e interfaccia
devono invitare al ripristino prima della disinstallazione; i testi neutri
limitano comunque il rischio residuo.

La prova di disinstallazione usa lo store sacrificabile del §3.1. Prima della
rimozione verifica il ripristino di tutti gli slot posseduti; dopo la rimozione
osserva separatamente traduzioni Shopify, perdita del token e cancellazione D1.
Il contenuto sorgente modificato manualmente resta responsabilità della
procedura guidata e non viene incluso nel rollback API.

`shop/redact` elimina baseline, ownership e decisioni conservate in D1 secondo
la retention già definita.

## 13. Aggiornamenti al Master Plan

L’implementazione è registrata come decisione `D-149`, che:

- consenta gli scope opzionali per traduzioni, lingue e mercati;
- sostituisca l'editor libero inizialmente ipotizzato con copie automatiche
  deterministiche, lasciando al merchant la scelta di conservarne altre;
- stabilisca la proprietà esplicita delle sole traduzioni CF/PEC scritte da CF
  Ready e una modalità guidata per il sorgente primario;
- consenta il controllo automatico di “Interno”, il ripristino confermato delle
  traduzioni scrivibili e la guida manuale per il sorgente;
- mantenga manuale la verifica dell’opzione del modulo;
- superi la sola parte di D-125 che dichiara illeggibili le etichette;
- conservi il divieto di usare “Interno” come campo fiscale gestito da CF Ready.

Devono essere aggiornati:

- obiettivi e non-obiettivi;
- invarianti e scope Shopify;
- D-125 e open item 8;
- FR-058 e FR-059;
- nuovi requisiti funzionali dedicati alle etichette;
- fonte autorevole e modello D1;
- flusso di salvataggio;
- Regole checkout, Home, onboarding, simulatore, Guida e FAQ;
- sicurezza, privacy, telemetria e supporto;
- matrice di test e piano di rollback.

La regola su “Interno” diventa:

> CF Ready legge e confronta le etichette della seconda riga, ripristina dopo
> conferma le traduzioni e gli override che può gestire, guida il ripristino del
> contenuto sorgente e continua a chiedere al merchant l’opzione del modulo. Non
> usa la seconda riga per raccogliere o validare il Codice Fiscale.

## 14. Compatibilità e migrazione

- La funzione è disattivata per tutti gli store esistenti.
- Il metafield della Function resta allo schema corrente.
- Le migrazioni D1 applicate restano immutabili; si aggiunge una nuova
  migrazione forward-only.
- La dichiarazione `address2_conflict_declared_at` già esistente viene
  conservata e trasformata in stato iniziale durante la lettura o la nuova
  migrazione, senza inventare un esito automatico.
- Sessioni prive dei nuovi scope continuano a usare tutte le funzioni correnti.
- Una revoca ricevuta da `app/scopes_update` conserva la scelta del merchant ma
  porta la modalità in `guided` o `scope_required` e impedisce nuove scritture.
- Una lingua o un mercato aggiunti in seguito producono “Da controllare” alla
  prossima apertura di Regole checkout, al prossimo salvataggio o alla rilettura
  esplicita; la Home usa lo stato D1 e non aggiunge query Shopify sulle
  traduzioni a ogni visita. Non viene introdotto un webhook o un ciclo in
  background nella prima versione.
- Un cambio della risorsa scoperta richiede una nuova acquisizione esplicita
  prima di scrivere.

La nuova capacità è una funzionalità compatibile e giustifica una minor
`1.7.0`. Il bump viene preparato nella PR verso `develop` prima del primo
snapshot Development della release.

## 15. Piano di verifica automatica

### 15.1 Dominio puro

- scoperta di zero, una e più risorse candidate;
- allowlist esatta delle quattro chiavi;
- risoluzione sorgente, globale e mercato;
- mercati annidati, lingua predefinita del mercato e fallback non
  ricostruibile;
- lingua primaria e secondaria;
- codici regionali `it-IT` ed `en-GB` senza normalizzazione distruttiva;
- lingua pubblicata e non pubblicata;
- traduzione `outdated`;
- classificazione `expected`, `nonstandard` e `fiscal_conflict` separata dai
  segnali `has_market_override` ed `external_change`;
- parole fiscali IT/EN e falsi positivi dell’acronimo `CF`;
- piano di scrittura per ogni transizione delle regole;
- ripristino di traduzione originariamente assente o presente;
- rilevamento di modifica esterna.

### 15.2 Server e repository

- permessi assenti o revocati;
- ordine dichiarazione manifest → consenso → lettura → conferma → scrittura;
- paginazione delle risorse;
- GraphQL errors e `userErrors`;
- mapping dei `TranslationErrorCode` rilevanti;
- digest superato e unico retry;
- throttling guidato da `extensions.cost.throttleStatus`, budget esaurito e
  nuovo tentativo esplicito;
- mutation parzialmente riuscita;
- rimozione per tuple senza cancellazioni incrociate fra chiavi, locali e
  mercati;
- readback incoerente;
- unica lease sull'orchestrazione, lock concorrente e revisione superata;
- cancellazione degli slot a `shop/redact`;
- nessun testo merchant in log, eventi o diagnostica.

### 15.3 Route e UI

- loader in sola lettura;
- attivazione degli scope opzionali;
- spiegazione dei permessi senza esempi prima degli scope e confronto Shopify
  soltanto dopo il consenso;
- confronto attuale/proposto;
- Save Bar e bozze concorrenti;
- conflitto recuperabile;
- azioni separate per gestione CF/PEC e ripristino “Interno”;
- copy IT/EN completa;
- Dynamic Type, tastiera e screen reader;
- layout embedded stretto e largo.

### 15.4 Simulatore e onboarding

- selettore IT/EN;
- etichette derivate da ogni modalità;
- campo “Interno” assente dal simulatore;
- nessuna pretesa di checkout reale;
- onboarding nuovo, riaperto, senza permessi e senza simulatore;
- conclusione possibile senza attivare la funzione etichette.

### 15.5 Gate repository

Il diff tocca manifest, scope e migrazione, quindi usa la corsia `full`:

- test mirati;
- `npm run check`;
- `npm run coverage:check` e aggiornamento baseline se necessario;
- mutation applicabile ai nuovi resolver e al salvataggio;
- E2E delle superfici merchant;
- validazione schema Admin GraphQL e Function API `2026-07`;
- preflight Development e Production;
- `git diff --check` e rilettura del diff effettivo.

## 16. Piano di verifica reale Development

La parte minima di questa matrice costituisce il gate §3.1 e precede
l'implementazione completa. Usa uno store sacrificabile con identità, mercato e
lingue registrati nella ricevuta della prova. Lo store Development condiviso
può essere usato soltanto per test non distruttivi dopo aver verificato lo stato
corrente.

### 16.1 Lingue e mercati

- italiano primario con inglese pubblicato;
- inglese primario con italiano pubblicato su uno store sacrificabile già
  predisposto così, senza cambiare la lingua primaria dello store condiviso;
- lingua inglese abilitata ma non pubblicata;
- traduzioni globali;
- override specifici per mercato;
- mercato figlio che eredita dal padre e contesto in cui la catena resta
  ambigua;
- codici regionali IT/EN quando disponibili;
- cambio di mercato o aggiunta di una lingua dopo l’attivazione.

### 16.2 Transizioni CF e PEC

Per entrambi i campi:

```text
unmanaged
→ optional_validated
→ required_validated
→ optional_validated
→ unmanaged
```

Per ogni passaggio verificare API, checkout IT, checkout EN, desktop e mobile.
URL, lingua, mercato e contenuto osservato devono essere registrati.

### 16.3 Campo “Interno”

- variante ordinaria rinominata “Codice fiscale”;
- variante facoltativa rinominata “Codice fiscale (facoltativo)”;
- sola traduzione inglese rinominata “Tax code”;
- personalizzazione legittima non fiscale;
- override specifico per mercato;
- modifica esterna successiva alla prima osservazione;
- ripristino API delle traduzioni e degli override IT/EN;
- rilevamento di un contenuto sorgente primario modificato e completamento del
  percorso guidato nell'Admin;
- modulo impostato manualmente su “Facoltativo”;
- modulo impostato manualmente su “Obbligatorio”;
- modulo impostato manualmente su “Non includere”.

Il test deve mostrare quale delle due chiavi Shopify rende in ogni stato. La
prova non completa ordini reali.

### 16.4 Disinstallazione e reinstallazione

Questa sezione usa esclusivamente lo store sacrificabile e una baseline
esportata delle traduzioni necessarie al ripristino.

- osservare se le traduzioni restano dopo la disinstallazione;
- verificare la perdita del token prima di tentare qualunque ripristino;
- reinstallare e verificare che CF Ready non rivendichi automaticamente valori
  della precedente installazione;
- confermare la cancellazione dei dati secondo il flusso `shop/redact`.

## 17. Rollout

1. Riconfermare lo schema Admin GraphQL `2026-07` e le quattro chiavi senza
   hardcodare GID.
2. Preparare e distribuire sul solo ambiente Development la configurazione che
   dichiara gli scope opzionali; l'owner completa personalmente il consenso
   richiesto da Shopify.
3. Eseguire sullo store sacrificabile il gate §3.1, compreso ripristino e
   checkout reale, prima di creare UI definitiva o migrazione D1.
4. Congelare una matrice per chiave, locale e mercato con capacità
   `automatic`, `guided` o `read_only`. Se il risultato non consente di
   soddisfare il contratto misto, aggiornare la proposta e ottenere una nuova
   decisione prima di procedere.
5. Aggiornare Master Plan e aggiungere ADR con copie fisse, scope, capacità
   miste, proprietà e limiti del contenuto sorgente.
6. Implementare discovery, resolver e anteprima in sola lettura.
7. Estrarre la primitiva Validation senza lock interno e implementare
   l'orchestratore con una sola lease, ownership, readback e ripristino per
   tuple.
8. Aggiungere migrazione e repository D1, compreso il trattamento della
   dichiarazione storica su “Interno”.
9. Implementare Regole checkout, controllo di “Interno” e consenso App Bridge.
10. Aggiornare simulatore, onboarding, Home, messaggi, Guida, FAQ, diagnostica
    e privacy.
11. Eseguire test mirati, coverage, mutation e gate completo.
12. Distribuire lo snapshot Development `1.7.0-dev.<tree>` e completare la
    matrice end-to-end, inclusi scope revocati, mercati ereditati e test di
    disinstallazione sullo store sacrificabile.
13. Correggere ogni differenza fra stato Admin e rendering reale, ripetendo i
    test interessati sullo stesso tree.
14. Aprire la PR verso `develop` con prove, matrice delle capacità e limiti
    residui.
15. Dopo merge, ripetere deploy e readback Development sul commit integrato.
16. Preparare la promozione Production soltanto su autorizzazione.
17. Usare Numisleo come primo controllo Production soltanto con consenso
    esplicito alle scritture delle traduzioni.

Sito e listing vengono aggiornati dopo la prova Production della stessa
versione. Submission App Store e attivazioni commerciali restano operazioni
separate.

## 18. Rollback

Il rollback tecnico deve poter:

1. disabilitare nuove attivazioni della funzione;
2. lasciare operative Validation e messaggi;
3. rileggere tutti gli slot gestiti;
4. ripristinare soltanto quelli ancora uguali all’ultimo valore scritto da CF
   Ready;
5. preservare le modifiche esterne;
6. verificare il risultato nel checkout IT/EN;
7. mantenere D1 finché il ripristino non è confermato.

Un rollback del Worker senza ripristino delle traduzioni non è sufficiente. Il
runbook deve distinguere codice distribuito, stato Shopify, stato D1 e rendering
reale.

## 19. Criteri di accettazione

La funzione è pronta quando:

- il merchant legge l'ambito dei permessi senza esempi prima degli scope e,
  dopo il consenso, confronta IT ed EN con Shopify prima della prima scrittura
  API;
- nessun GID è hardcoded;
- gli scope aggiuntivi sono opzionali;
- ogni scrittura è limitata alle quattro chiavi allowlistate;
- ciascuno slot dichiara capacità `automatic`, `guided` o `read_only` in base a
  una prova reale della stessa chiave, locale e contesto di mercato;
- Codice Fiscale e PEC seguono automaticamente le regole sugli slot provati;
  sugli altri, la UI richiede e registra la verifica guidata senza dichiarare
  una sincronizzazione automatica;
- “Interno” viene classificato usando entrambe le varianti IT/EN;
- `nonstandard` non viene presentato come prova dell'autore o della causa della
  modifica;
- una personalizzazione legittima non viene sovrascritta automaticamente;
- il merchant può ripristinare via API traduzioni e override posseduti dopo un
  confronto esplicito e riceve una procedura guidata per il sorgente primario;
- Regole checkout presenta una sezione madre con due blocchi impilati e mantiene
  separati stati, errori e azioni;
- il simulatore mostra soltanto i campi gestiti da CF Ready e mantiene “Interno”
  nella sezione dedicata;
- l’app dichiara che lo stato del modulo resta manuale;
- simulatore, onboarding, Home, Messaggi, Guida, FAQ e diagnostica descrivono lo
  stesso contratto;
- conflitti, errori parziali e digest superati sono recuperabili;
- revoca scope, throttling e rimozioni per tuple sono recuperabili senza
  cancellare traduzioni non confermate;
- nessun testo merchant entra in log o telemetria;
- Development prova API e checkout reale nelle famiglie IT/EN, includendo
  locale esatto, mercato ed eventuale ereditarietà;
- cambio lingua primaria e disinstallazione vengono provati soltanto sullo
  store sacrificabile e documentano l'effetto sulle traduzioni;
- i gate `full`, deploy, smoke e readback applicabili sono verdi sul medesimo
  commit e tree.

## 20. Perimetro escluso

Questa proposta non aggiunge campi, non legge ordini o clienti e non usa
“Interno” per la validazione fiscale. Non modifica automaticamente l’opzione del
modulo checkout, non traduce lingue diverse da IT/EN e non introduce un editor
generico delle traduzioni Shopify.

Partita IVA, Codice SDI, Theme App Extension e Checkout UI Extension restano
fuori perimetro.
