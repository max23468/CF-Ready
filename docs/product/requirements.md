# Requisiti

Requisiti vigenti su disponibilità, regole, validazione e protezioni. I requisiti
commerciali stanno in [billing.md](billing.md), quelli su messaggi, supporto e
recensioni in [ui-content.md](ui-content.md). Gli ID non cambiano e non si
riusano; un ID assente in questi documenti è ritirato e resta leggibile
nell'[archivio](../archive/2026-07-28-cf-ready-master-plan.md).

## Disponibilità e installazione

**FR-001** — Al primo accesso l’app legge il Paese dello store tramite GraphQL Admin API soltanto per diagnostica, supporto e telemetria minimizzata.

**FR-002** — Uno store di qualunque Paese può:

- iniziare la prova;
- accedere all’onboarding operativo;
- configurare regole;
- creare o attivare la Validation;
- scegliere un piano.

**FR-003** — L’app chiarisce che non crea né forza la comparsa dei localized fields. Con fatturazione italiana o non ancora disponibile e almeno una consegna italiana applica le regole anche a un campo obbligatorio assente; senza un Paese di consegna controlla soltanto `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT` presenti, salvo la spunta D-192 che con fatturazione italiana tratta come mancante anche un campo obbligatorio assente; con fatturazione estera o sole consegne estere non applica regole.

**FR-004** — Nessuno store viene bloccato o disinstallato automaticamente in base al Paese della sede, ai mercati o alle zone di spedizione.

**FR-005** — La prova non parte da sola: la avvia il merchant dalla procedura guidata o dalla Home. Finché non la chiede non si consuma alcun giorno, e chi preferisce può scegliere subito una modalità a pagamento saltandola.

**FR-006** — Un cambio del Paese dello store aggiorna il dato diagnostico ma non disabilita la Validation né modifica prova, billing o configurazione.


## Regole checkout

**FR-010** — Il Codice Fiscale ha tre stati e la PEC ne ha quattro, tutti
indipendenti:

```text
unmanaged
optional_validated
required_validated
required_when_company (solo PEC)
```

**FR-011** — `unmanaged` non genera alcun errore per quel campo.

**FR-012** — `optional_validated` permette vuoto, ma blocca un valore compilato e non valido.

**FR-013** — `required_validated` blocca vuoto e valore non valido con messaggi distinti.

**FR-014** — La Validation usa un solo algoritmo a `CHECKOUT_INTERACTION` e `CHECKOUT_COMPLETION`, indipendente dal metodo di pagamento.

**FR-015** — Se entrambi i campi falliscono, vengono restituiti entrambi gli errori.

**FR-016** — Gli errori puntano al localized field corrispondente quando è presente. A Completion un campo obbligatorio assente con consegna italiana usa il target globale `$.cart`, e ogni errore di campo si ripete anche in `$.cart` (D-193).

**FR-017** — A Interaction un valore presente ma invalido produce subito un errore inline. Un required vuoto produce un errore inline solo quando il campo è presente, ogni delivery group ha una destinazione nota e tutte le delivery group italiane hanno un’opzione selezionata. Completion resta sempre la barriera finale.

**FR-018** — Con `required_when_company`, la PEC vuota è obbligatoria soltanto
quando il campo Azienda dell’indirizzo di fatturazione contiene un valore dopo
`trim()`. Una PEC presente viene sempre validata formalmente. Gli altri gate di
applicabilità restano invariati e CF Ready non deduce il trattamento fiscale
dell’ordine.


## Applicabilità geografica

**FR-020** — Destinazione estera: nessuna validazione.

**FR-021** — Fatturazione estera: nessuna validazione, anche con consegna o ritiro in Italia.

**FR-022** — Destinazione italiana e fatturazione italiana: regole normali.

**FR-023** — Destinazione italiana e fatturazione non ancora disponibile:
regole normali; un campo obbligatorio assente genera un errore globale.

**FR-024** — Checkout senza spedizione: regole solo se i localized fields sono presenti e non esiste una fatturazione estera. Con la spunta D-192 e fatturazione italiana, a Completion anche un campo obbligatorio assente blocca con errore globale.

**FR-025** — Ritiro online senza indirizzo di consegna: regole se i localized fields sono presenti e la fatturazione non è estera.

**FR-026** — Ordine misto: applicare le regole se almeno un gruppo di consegna è in Italia, salvo fatturazione estera.

**FR-027** — Localized field obbligatorio assente: generare un errore globale
solo se almeno un gruppo di consegna ha destinazione italiana; senza consegna
osservabile non generare errori per il campo assente.


## Codice Fiscale

**FR-030** — Prima della validazione:

- `trim()` esterno;
- conversione temporanea in maiuscolo;
- nessuna mutazione del valore Shopify durante il checkout; la sola eccezione è
  l'uniformazione degli ordini di FR-034, dopo la creazione dell'ordine.

**FR-031** — Spazi interni, trattini e separatori rendono il valore non valido.

**FR-032** — Formato ordinario:

- esattamente 16 caratteri;
- struttura alfanumerica prevista;
- posizioni nominali, anno, mese, giorno/sesso e codice catastale coerenti;
- omocodia nelle posizioni ammesse;
- carattere di controllo corretto;
- mese valido;
- giorno valido dopo decodifica sesso;
- rifiuto di `00`, 31 aprile, 31 giugno, 31 settembre, 31 novembre e 30 febbraio;
- 29 febbraio ammesso, perché il secolo non è ricavabile in modo univoco dalle due cifre dell’anno.

**FR-033** — Formato numerico, usato da società, enti e codici provvisori:

- esattamente 11 cifre;
- nessuna lettera o separatore;
- carattere di controllo calcolato sulle prime dieci cifre con l’algoritmo Luhn
  previsto anche per la Partita IVA;
- rifiuto esplicito di `00000000000`;
- nessuna affermazione di esistenza o attribuzione.


**FR-034** — Codice Fiscale e PEC uniformati negli ordini (D-206), con
un'unica spunta per entrambi nella pagina Regole, sopra “Ordini senza
spedizione”:

- disattivata di default e mostrata solo con almeno un campo gestito;
- vale per i soli campi `optional` o `required` e per i soli valori formalmente
  validi: Codice Fiscale con trim e maiuscolo, PEC con trim e minuscolo;
- un valore non valido o già canonico non si modifica, le altre chiavi restano;
- richiede gli scope opzionali `read_orders` e `write_orders`, chiesti solo
  all'attivazione; senza permesso la spunta resta spenta;
- dopo il salvataggio corregge anche gli ordini degli ultimi 60 giorni, limite
  di `read_orders`; lo stesso vale quando un secondo campo diventa gestito, alla
  riattivazione della Validation e dopo un nuovo permesso;
- funziona solo con la Validation CF Ready attiva;
- si offre solo dove `ORDER_NORMALIZATION_ENABLED` vale `true`: in Production
  dopo l'approvazione Shopify dei protected customer data del 6 novembre 2026
  (D-213), è abilitato per tutti gli store; altrove la
  sezione resta nascosta, salvo a chi l'ha già attiva, che può spegnerla;
- con scope revocati la pagina Regole mostra un avviso e il pulsante per
  concederli di nuovo; il salvataggio delle altre regole resta possibile;
- nessun tag o nota sull'ordine, nessuna copia dei valori in D1;
- le modifiche successive del merchant all'ordine non vengono riscritte.

## PEC

**FR-040** — Prima della validazione applicare trim esterno senza riscrivere il valore.

**FR-041** — Validazione pragmatica:

- esattamente una `@`;
- local part e dominio non vuoti;
- nessuno spazio interno;
- dominio strutturalmente valido e con label non vuote;
- supporto a sottodomini;
- supporto ai caratteri comuni `.`, `_`, `-`, `+` nella parte locale;
- maiuscole e minuscole accettate;
- niente DNS;
- niente elenco provider PEC;
- niente certificazione di esistenza.

Per un valore PEC rifiutato, Function e simulatore aggiungono al testo
personalizzato la causa formale IT/EN prevista da D-177. Non duplicare il
suggerimento nei dettagli del simulatore e non riportare il valore inserito.


## Configurazione e attivazione

**FR-050** — Prima installazione:

- CF `unmanaged`;
- PEC `unmanaged`;
- Validation disattivata.

**FR-051** — “Salva” aggiorna la configurazione ma non attiva una Validation disattivata.

**FR-052** — “Attiva nel checkout”:

1. verifica trial o entitlement;
2. valida configurazione e messaggi;
3. crea la Validation se non esiste;
4. altrimenti la abilita;
5. scrive il metafield JSON;
6. salva ID e hash in D1;
7. verifica la risposta Shopify;
8. mostra conferma.

**FR-053** — “Disattiva nel checkout”:

- chiede conferma;
- disabilita la Validation;
- non cancella Validation o configurazione;
- aggiorna D1.

**FR-054** — Se Shopify non conferma la scrittura del metafield, il salvataggio non è considerato riuscito.

**FR-055** — La Home riconcilia in modo leggero Validation, metafield, billing e D1.

**FR-056** — Divergenze innocue vengono riparate automaticamente; situazioni ambigue producono banner e azione “Ripara configurazione”.

**FR-057** — Due Validation duplicate non vengono cancellate automaticamente.

**FR-058** — CF Ready legge e confronta le varianti IT/EN dell’etichetta
“Interno” / “Indirizzo 2”, segnala un probabile conflitto fiscale e chiede
comunque al merchant di confermare l’opzione del modulo. Può ripristinare dopo
conferma le traduzioni e gli override che gestisce; per il contenuto sorgente
della lingua primaria mostra una procedura guidata.

**FR-059** — La classificazione dell’etichetta non prova l’autore della modifica
e non rivela se il campo è obbligatorio, facoltativo o nascosto. L’avviso non
blocca l’attivazione e CF Ready non usa la seconda riga per raccogliere o
validare il Codice Fiscale (D-147).


## Limiti piattaforma e protezioni operative

**FR-096** — L’app deve mantenere una sola Cart and Checkout Validation per store.

**FR-097** — Ogni creazione o aggiornamento della Validation deve impostare `blockOnFailure: false`.

**FR-098** — Se Shopify rifiuta la creazione perché lo store ha già raggiunto il limite di Validation Function attive:

- non eliminare né disabilitare Validation di altre app;
- non lasciare uno stato locale falsamente attivo;
- mostrare un errore traducibile e un percorso di supporto;
- conservare la configurazione per un nuovo tentativo.

**FR-099** — Listing, FAQ e Termini devono dichiarare che le generazioni successive degli ordini ricorrenti in abbonamento non sono coperte dalla Validation Function corrente.

**FR-100** — Il checkout iniziale contenente un prodotto in abbonamento deve essere testato separatamente; l’esito osservato va documentato senza estenderlo alle ricorrenze successive.

**FR-101** — Le etichette CF/PEC seguono le regole soltanto sugli slot provati
come scrivibili per la stessa chiave, lingua e mercato. La prima scrittura
automatica richiede confronto e seconda conferma; conflitti e modifiche esterne
restano fail-closed per le traduzioni senza fermare la Validation.

**FR-102** — Disattivazione e ripristino modificano soltanto traduzioni ancora
uguali all’ultima scrittura confermata di CF Ready. Lingue, mercati e risorse
nuovi richiedono un nuovo readback; nessun testo libero merchant entra in log,
telemetria o diagnostica.

**FR-103** — Dal 6 novembre 2026 il campo nativo `TAX_CREDENTIAL_IT` accetta
solo la struttura ordinaria a 16 caratteri e rifiuta, prima della Function, i
codici numerici di FR-033 e le omocodie di FR-032 (D-215). La Function continua
a considerarli validi. Il simulatore lo segnala sul campo quando il valore è
valido per CF Ready ma non per Shopify; FAQ, sito e guide dichiarano il limite
finché Shopify non lo corregge.

---


## Requisiti non funzionali

### Affidabilità

**NFR-001** — Il checkout non effettua chiamate a Cloudflare.

**NFR-002** — Configurazione invalida o entitlement non leggibile produce zero errori checkout.

**NFR-003** — Ogni operazione mutante verso Shopify deve essere idempotente o riconciliabile.

**NFR-004** — Webhook duplicati non devono produrre doppie transizioni.

**NFR-005** — Nessun deploy se fallisce un gate obbligatorio.

### Prestazioni

**NFR-010** — Worker progettato per stare nel limite Free di 10 ms CPU per richiesta ordinaria.

**NFR-011** — Nessun lavoro costoso in global scope.

**NFR-012** — Niente SSR pesante; preferire asset statici e loader/action essenziali.

**NFR-013** — Query D1 indicizzate e limitate ai record necessari.

**NFR-014** — Function richiede solo i campi GraphQL necessari e deve rimanere ampiamente sotto i limiti di istruzioni, memoria e binary size.

**NFR-015** — Gli asset fingerprinted usano cache immutabile; ogni loader merchant espone
`Server-Timing` allowlistato per distinguere autenticazione, chiamate Shopify, letture D1 e totale.

### Sicurezza

**NFR-020** — Token e refresh token cifrati a livello applicativo prima della scrittura D1.

**NFR-021** — Secret solo in Cloudflare/GitHub/Shopify secret storage, mai nel repository o nei log.

**NFR-022** — HMAC webhook obbligatoria; HMAC non valida produce `401`.

**NFR-023** — Input form e JSON metafield validati al trust boundary.

**NFR-024** — Utility distruttive non compilabili o non eseguibili in `prod`.

**NFR-025** — Nessun accesso a dati protetti di clienti o ordini, salvo i
localized fields degli ordini per FR-034, con scope opzionali e accesso ai
protected customer data di livello 1 senza campi protetti.

### Privacy

**NFR-030** — L’app non conserva CF, PEC, ordini, indirizzi buyer o fatture.
Legge e riscrive CF e PEC di un ordine solo per FR-034, in memoria.

**NFR-031** — Logging con codici errore e identificativi tecnici, senza payload sensibili.

**NFR-032** — Telemetria limitata agli eventi approvati e descritta nella Privacy Policy.

**NFR-033** — Retention applicata automaticamente.

### Accessibilità e UI

**NFR-040** — Polaris Web Components come default.

**NFR-041** — Label accessibili, ordine heading corretto, focus gestito e navigazione da tastiera.

**NFR-042** — Contrasto verificato.

**NFR-043** — Layout responsive dentro Shopify Admin.

**NFR-044** — Nessun design system esterno.

### Manutenibilità

**NFR-050** — TypeScript strict.

**NFR-051** — Dipendenze dirette minime e versioni esatte.

**NFR-052** — Nessun ORM, state manager o framework CSS.

**NFR-053** — Migrazioni D1 versionate e immutabili dopo il rilascio.

**NFR-054** — SemVer, changelog, tag e note IT/EN.

**NFR-055** — Ogni logica non banale lascia almeno un test eseguibile.

## Criteri end-to-end

Ogni rilascio che tocca il perimetro deve lasciare veri questi esiti.

1. uno store Basic installa l’app;
2. la prova parte quando il merchant la chiede, senza pagamento;
3. onboarding e limiti sono chiari;
4. regole e messaggi si salvano con Save Bar;
5. nessun salvataggio attiva implicitamente;
6. l’attivazione crea/abilita una sola Validation;
7. un checkout Italia/Italia senza CF è bloccato se richiesto;
8. un CF ordinario valido passa;
9. un CF numerico a 11 cifre con carattere di controllo valido passa la
   Function; finché vale FR-103 il campo nativo di Shopify lo rifiuta prima;
10. un CF invalido è respinto se gestito;
11. PEC rispetta i quattro stati e il Codice Fiscale conserva i tre stati;
12. gli errori sono associati ai campi;
13. fatturazione estera è esclusa;
14. destinazione estera è esclusa;
15. ritiro Italia è coperto quando i campi esistono;
16. campi obbligatori assenti con consegna italiana sono bloccati; senza
    consegna osservabile, config corrotta o entitlement incerto il motore è
    fail-open, salvo la spunta D-192 senza consegna e con fatturazione italiana;
17. disattivazione conserva config;
18. trial scaduto non blocca ordini;
19. mensile, annuale e una tantum funzionano;
20. conversione one-time applica la sequenza sicura;
21. reinstallazione non genera nuova prova e riconosce one-time;
22. store non italiano può usare prova, billing e Validation; i checkout non pertinenti restano esclusi;
23. app e sito sono IT/EN;
24. nessun dato fiscale raggiunge Cloudflare o log;
25. webhook sono firmati e idempotenti;
26. token scaduti vengono aggiornati;
27. backup ripristinabile;
28. CI riproduce build e test;
29. non restano P0/P1 aperti;
30. ogni deploy ha target verificato, ricevuta, readback e rollback;
31. `SECURITY.md` e il canale privato per vulnerabilità sono operativi;
32. link, anchor e comandi documentati superano il controllo automatico.
