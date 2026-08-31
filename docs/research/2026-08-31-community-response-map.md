# Mappa pubblica delle opportunità di risposta per CF Ready

**Rilevazione:** 31 agosto 2026

**Perimetro:** Shopify Community, Shopify Developer Community, Reddit, forum
specialistici e blog pubblici; LinkedIn escluso.

**Account attribuiti a Matteo:** `max23468` (attuale) e `max2348` (precedente).

**Stato operativo:** dossier decisionale; nessun messaggio è stato inviato.

## Esito in breve

La ricerca ha censito 52 discussioni Shopify potenzialmente intercettate dalle
query, oltre a 15 risultati esterni pertinenti. La coda realmente utilizzabile è
molto più stretta:

- 3 elementi sono già attribuiti a Matteo: un topic proprio e due risposte;
- una delle due risposte è nascosta e va riproposta con l'account corretto;
- 19 ulteriori risultati hanno una bozza utilizzabile, quasi sempre con
  prudenza perché vecchi o riattivati da messaggi promozionali;
- tutti gli altri risultati sono fuori perimetro, troppo vecchi, già risolti,
  non rispondibili pubblicamente o esporrebbero CF Ready come risposta
  promozionale a una domanda fiscale o legale.

La scelta più prudente è non fare una raffica di risposte. Se si procede, il
primo intervento è la nuova risposta al topic 554855 con `max23468`; poi conviene
osservare la moderazione prima di passare al successivo.

### Prime opportunità da valutare

| Ordine | Ultima attività | Titolo | Sito | Stato | Priorità | Rischio spam/moderazione | Verdetto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-08-31 | [Codice Fiscale obbligatorio e PEC nel checkout Shopify con CF Ready](https://community.shopify.com/t/675015) | Shopify Community | Topic proprio | Bassa | Basso | Risposta facoltativa al commento ricevuto |
| 2 | 2026-08-25 | [Problema fatturazione italiana. Mancanza CF e Partita IVA obbligatoria](https://community.shopify.com/t/554855) | Shopify Community | **Già risposto con `max2348`; post nascosto** | Alta | Alto | **Da rimandare con `max23468`**, usando la nuova bozza senza link |
| 3 | 2026-08-25 | [Codice fiscale campo obbligatorio](https://community.shopify.com/t/116602) | Shopify Community | **Già risposto con `max23468`** | — | Medio | Non duplicare |
| 4 | 2026-08-13 | [Fatturazione Elettronica Shopify: Flussi e Campi Fiscali](https://ifgecommerce.com/blogs/articoli-shopify/fatturazione-elettronica-shopify-campi-fiscali-sdi) | IFG eCommerce | Commenti moderati aperti | Alta | Alto | Valutare un solo commento tecnico, senza link all'app |
| 5 | 2026-06-23 | [Fatturazione elettronica come fate](https://community.shopify.com/t/296817) | Shopify Community | Aperto; revival promozionale | Media | Alto | Valutare solo se si accetta il rischio di sembrare un'altra app in coda |
| 6 | 2026-04-02 | [Expose localizedFields on webhooks and downstream payloads](https://community.shopify.dev/t/expose-localizedfields-localized-fields-on-webhooks-and-downstream-integration-payloads/32780) | Shopify Developer Community | Feature request già presa in carico | Bassa | Basso | Non aggiungere rumore senza dati tecnici nuovi |
| 7 | 2025-11-24 | [Partita IVA, SDI e codice fiscale al checkout 2025](https://community.shopify.com/t/385865) | Shopify Community | Aperto; ultimo post promozionale | Media | Alto | Valutare una risposta che delimiti esplicitamente lo scope |
| 8 | 2025-09-16 | [Aggiungere al checkout Campo obbligatorio P.Iva/C.F](https://community.shopify.com/t/103834) | Shopify Community | Aperto; thread molto affollato | Media | Alto | Valutare, ma non come primo intervento |
| 9 | 2025-09-05 | [Get Italian Codice Fiscale and PEC field values through API](https://community.shopify.com/t/268392) | Shopify Community | Aperto; risposta tecnica superata | Alta | Basso | Rispondere con l'API corrente, senza promuovere l'app |
| 10 | 2025-06-10 | [Rinominare Codice Fiscale in Informazioni aggiuntive o renderlo obbligatorio](https://community.shopify.com/t/418587) | Shopify Community | Aperto e senza risposte | Alta | Medio | Miglior opportunità merchant, ma il topic ha più di un anno |
| 11 | 2025-04-24 | [Codice Fiscale per regimi forfettari](https://community.shopify.com/t/410701) | Shopify Community | Aperto e senza risposte | Alta | Medio | Buon fit; evitare conclusioni fiscali |
| 12 | 2025-03-25 | [P.IVA / Codice Fiscale al checkout](https://community.shopify.com/t/166243) | Shopify Community | Aperto | Media | Medio-alto | Valutare per la sola domanda sul CF |

La data è l'ultima attività pubblica registrata, non sempre l'ultima risposta
utile. In particolare, diversi topic del 23 giugno 2026 sono stati riattivati in
serie dallo stesso messaggio promozionale: la loro “freschezza” è quindi
artificiale.

## Regole usate per decidere

Le bozze seguono questi confini:

- prima si risolve il problema, poi si dichiara in modo trasparente che Matteo
  sviluppa CF Ready;
- su Shopify Community si nomina l'app senza inserire il link;
- fuori da Shopify Community si inserisce un link solo se consentito e davvero
  utile; nelle bozze sotto non è necessario;
- nessuna affermazione legale o fiscale: si distingue sempre il prodotto dal
  parere del commercialista;
- CF Ready gestisce soltanto Codice Fiscale e PEC nei campi nativi Shopify;
- il controllo del Codice Fiscale è formale, non anagrafico;
- nessuna promessa su Partita IVA, SDI, emissione o trasmissione di fatture,
  POS, modifica del tema o Checkout UI Extension;
- niente risposta se il contributo sarebbe solo promozionale, se il problema è
  già risolto o se manca una prova tecnica affidabile.

Riferimenti correnti usati per controllare le bozze:

- [campi fiscali aggiuntivi di Shopify](https://help.shopify.com/en/manual/international/shipping/international-considerations);
- [`Order.localizedFields` nell'Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order);
- [guida Shopify ai localized fields](https://shopify.dev/docs/apps/build/markets/add-locally-required-order-data);
- [listing pubblica di CF Ready](https://apps.shopify.com/cf-ready?locale=it);
- [runbook locale per l'outreach](../runbooks/controlled-launch-outreach.md).

## Presenza pubblica già attribuita

### 1. Topic proprio — risposta facoltativa

- **Titolo:** [Codice Fiscale obbligatorio e PEC nel checkout Shopify con CF Ready](https://community.shopify.com/t/675015)
- **Sito e lingua:** Shopify Community, italiano.
- **Autore:** `max23468`.
- **Pubblicato:** 2026-08-31.
- **Ultima risposta:** 2026-08-31, di `Mustafa_Ali`.
- **Stato:** topic proprio, visibile e aperto; 2 post.
- **Valutazione:** la risposta ricevuta è un apprezzamento generico, non una
  domanda. Rispondere è cortese ma non necessario.
- **Rischio:** basso.

**Bozza facoltativa, in inglese:**

> Thanks, Mustafa. That conflict is exactly what pushed me to use Shopify's
> native Italian fields instead of repurposing Address 2. If you come across a
> merchant with a specific edge case, I'm happy to compare notes here.

### 2. Risposta del vecchio account nascosta — da rimandare

- **Titolo:** [Problema fatturazione italiana. Mancanza CF e Partita IVA obbligatoria](https://community.shopify.com/t/554855)
- **Sito e lingua:** Shopify Community, italiano.
- **Autore della risposta:** `max2348`.
- **Topic pubblicato:** 2025-08-08.
- **Ultima attività tecnica:** 2026-08-25.
- **Ultima risposta visibile:** 2025-11-24.
- **Stato:** **già risposto il 2026-08-25; il post 12 è attualmente nascosto
  perché segnalato dalla community**.
- **Valutazione:** il bisogno sul CF dei privati è un fit molto forte, ma il
  thread contiene già numerose proposte di app. Matteo ha confermato che
  `max2348` era il suo vecchio account e ha deciso di riproporre l'intervento
  con `max23468`.
- **Priorità / rischio:** alta / alto.
- **Verdetto:** **da rimandare con l'account corretto**, senza copiare il testo
  nascosto, senza link e rispondendo direttamente al problema del merchant.

**Nuova bozza:**

> Ciao, per il problema specifico dei privati che arrivano all'ordine senza
> Codice Fiscale oggi non è necessario spostare il dato nel carrello o rendere
> obbligatoria la registrazione. Shopify espone già il campo fiscale nativo
> italiano e una Cart and Checkout Validation può renderlo obbligatorio e
> controllarne formalmente il formato. Sono Matteo, sviluppo CF Ready proprio
> per questo caso, anche sui piani non-Plus. Preciso il limite: non raccoglie
> Partita IVA o SDI e non emette fatture; gestisce soltanto Codice Fiscale e PEC
> nei campi nativi. Per il problema dei CF mancanti dei clienti privati evita di
> doverli ricontattare dopo l'ordine.

### 3. Risposta già inviata e visibile

- **Titolo:** [Codice fiscale campo obbligatorio](https://community.shopify.com/t/116602)
- **Sito e lingua:** Shopify Community, italiano.
- **Autore della risposta:** `max23468`.
- **Topic pubblicato:** 2022-04-25.
- **Risposta di Matteo:** 2026-08-25, post 28.
- **Stato:** **già risposto**, visibile; il messaggio include il link App Store.
- **Verdetto:** non aggiungere una seconda risposta.

## Shopify Community — opportunità merchant con bozza

Le voci sono ordinate per ultima attività del topic.

### 4. Fatturazione elettronica come fate

- **URL:** https://community.shopify.com/t/296817
- **Pubblicato / ultima attività:** 2024-02-17 / 2026-06-23.
- **Stato:** aperto, 9 post; ultima attività dovuta a una promozione di un'altra
  app.
- **Fit:** il primo messaggio chiede come raccogliere il Codice Fiscale, ma il
  tema principale resta la fatturazione elettronica.
- **Priorità / rischio:** media / alto.
- **Verdetto:** valutare, non come primo intervento.

**Bozza:**

> Ciao Elisa, separerei due problemi: raccogliere e controllare il Codice
> Fiscale prima dell'ordine, ed emettere poi la fattura. Sono Matteo e sviluppo
> CF Ready per il primo: usa il campo nativo italiano di Shopify, può renderlo
> obbligatorio e ne verifica solo la correttezza formale, senza emettere o
> trasmettere fatture. Per gli obblighi fiscali e il flusso di fatturazione
> conviene invece confermare il caso con il commercialista e scegliere un
> gestionale dedicato. Lo preciso perché una sola app non risolve necessariamente
> entrambi i problemi.

### 5. Partita IVA, SDI e codice fiscale al checkout 2025

- **URL:** https://community.shopify.com/t/385865
- **Pubblicato / ultima attività:** 2025-01-09 / 2025-11-24.
- **Stato:** aperto, 3 post; ultima risposta promozionale.
- **Fit:** parziale; CF e PEC sì, Partita IVA e SDI no.
- **Priorità / rischio:** media / alto.
- **Verdetto:** valutare solo con delimitazione molto netta.

**Bozza:**

> Ciao, per evitare equivoci: i campi nativi italiani che Shopify espone sono
> Codice Fiscale e PEC; Partita IVA e SDI sono un'esigenza diversa. Sono Matteo
> e sviluppo CF Ready: può rendere obbligatorio e validare formalmente il solo
> Codice Fiscale e gestire la PEC separatamente, senza rinominare campi o
> richiedere Plus. Non raccoglie P.IVA o SDI e non emette fatture. Se il vostro
> requisito è almeno il CF per i privati, può coprire quella parte; se servono
> tutti i dati B2B serve invece una soluzione diversa.

### 6. Aggiungere al checkout Campo obbligatorio P.Iva/C.F

- **URL:** https://community.shopify.com/t/103834
- **Pubblicato / ultima attività:** 2022-03-03 / 2025-09-16.
- **Stato:** aperto, 26 post; thread affollato e polemico.
- **Fit:** buono per il CF, assente per Partita IVA.
- **Priorità / rischio:** media / alto.
- **Verdetto:** valutare soltanto dopo aver osservato l'esito di interventi più
  recenti.

**Bozza:**

> Ciao, per la parte Codice Fiscale oggi non è più necessario usare “Indirizzo
> 2”. Sono Matteo e sviluppo CF Ready: lavora sul campo fiscale nativo che
> Shopify mostra nel checkout italiano, può renderlo obbligatorio e ne controlla
> formalmente il formato anche senza Plus. Non gestisce Partita IVA, SDI o
> fatturazione elettronica, quindi non copre l'intero flusso B2B discusso qui;
> può però risolvere il caso dei privati senza sporcare l'indirizzo di
> spedizione.

### 7. Rinominare Codice Fiscale in Informazioni aggiuntive o renderlo obbligatorio

- **URL:** https://community.shopify.com/t/418587
- **Pubblicato / ultima attività:** 2025-06-10 / 2025-06-10.
- **Stato:** aperto, senza risposte.
- **Fit:** esatto per la seconda alternativa chiesta dal merchant.
- **Priorità / rischio:** alta / medio, dovuto soprattutto all'età.
- **Verdetto:** migliore opportunità merchant ancora senza risposta.

**Bozza:**

> Ciao, la seconda strada è quella più pulita: evitare di rinominare “Indirizzo
> 2” e lavorare direttamente sul campo Codice Fiscale nativo. Sono Matteo e
> sviluppo CF Ready proprio per questo: può renderlo obbligatorio e verificarne
> formalmente il formato nel checkout italiano, anche senza Plus. Non rinomina
> il campo e non gestisce Partita IVA o SDI; serve quando il requisito reale è
> il CF dei clienti italiani, lasciando l'indirizzo libero per il suo uso
> normale.

### 8. Codice Fiscale per regimi forfettari

- **URL:** https://community.shopify.com/t/410701
- **Pubblicato / ultima attività:** 2025-04-24 / 2025-04-24.
- **Stato:** aperto, senza risposte.
- **Fit:** forte sul problema tecnico; la premessa fiscale non va convalidata.
- **Priorità / rischio:** alta / medio.
- **Verdetto:** valutare.

**Bozza:**

> Ciao Thomas, sul punto tecnico oggi una soluzione c'è: il campo Codice
> Fiscale nativo di Shopify può essere reso obbligatorio e validato prima della
> chiusura dell'ordine, senza modificare il tema e senza Plus. Sono Matteo e
> sviluppo CF Ready per questo caso. La verifica è formale, non anagrafica, e
> l'app non emette fatture né tratta P.IVA o SDI; evita però di dover rincorrere
> il cliente perché il CF è rimasto vuoto. Sull'obbligo fiscale nel caso
> specifico resta necessario il confronto con il commercialista.

### 9. P.IVA / Codice Fiscale al checkout

- **URL:** https://community.shopify.com/t/166243
- **Pubblicato / ultima attività:** 2022-11-08 / 2025-03-25.
- **Stato:** aperto, 7 post; l'ultima domanda chiede come rendere obbligatorio il
  CF nativo.
- **Fit:** forte per l'ultima domanda, parziale per il topic complessivo.
- **Priorità / rischio:** media / medio-alto.
- **Verdetto:** valutare.

**Bozza:**

> Ciao, per il Codice Fiscale il campo nativo che vedi in fondo al checkout può
> essere reso obbligatorio e controllato senza riutilizzare “Indirizzo 2”. Sono
> Matteo e sviluppo CF Ready per questo caso: il controllo è formale, non
> certifica l'identità del cliente, e l'app non gestisce P.IVA o SDI. Lavora
> soltanto sui checkout italiani pertinenti e non richiede Shopify Plus.

### 10. Codice fiscale e PEC opzionali non più disattivabili

- **URL:** https://community.shopify.com/t/366763
- **Pubblicato / ultima attività:** 2024-10-16 / 2024-10-16.
- **Stato:** aperto, senza risposte.
- **Fit:** il merchant vuole eliminare i campi nativi perché usa un duplicato in
  “Indirizzo 2”; CF Ready offre il percorso opposto e più pulito.
- **Priorità / rischio:** media / medio-alto per età e cambio di direzione.
- **Verdetto:** valutare.

**Bozza:**

> Ciao, più che disattivare i campi nativi, valuterei di eliminare il workaround
> su “Indirizzo 2”: Shopify sconsiglia di mantenere campi personalizzati
> duplicati, perché il cliente può ritrovarsi a inserire due volte lo stesso
> dato. Sono Matteo e sviluppo CF Ready: usa direttamente Codice Fiscale e PEC
> nativi, può renderli facoltativi o obbligatori separatamente e controlla
> formalmente il CF. Non gestisce P.IVA o SDI, ma evita il doppione e lascia
> libero l'indirizzo.

### 11. Change label and mandatory in checkout Additional information

- **URL:** https://community.shopify.com/t/202469
- **Pubblicato / ultima attività:** 2023-03-24 / 2024-05-29.
- **Stato:** aperto, 3 post.
- **Fit:** buono per l'obbligatorietà, non per la rinomina.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio; non usarla nella prima tornata.

**Draft in English:**

> For the Italian Codice Fiscale field, changing the native label and making it
> mandatory are separate problems. I'm the developer of CF Ready: it leaves
> Shopify's native label and field in place, but can make the Codice Fiscale
> required and formally validate it on applicable Italian checkouts, without
> Plus or theme changes. It doesn't rename the field to VAT/SDI and doesn't
> collect those B2B values.

### 12. Effettuare validazione del campo P.IVA / Codice fiscale

- **URL:** https://community.shopify.com/t/275411
- **Pubblicato / ultima attività:** 2023-12-07 / 2024-04-05.
- **Stato:** aperto, 2 post.
- **Fit:** parziale; il campo rinominato mescola due identificativi diversi.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Bozza:**

> Ciao, validare un campo libero rinominato “P.IVA / Codice Fiscale” resta
> ambiguo perché i due identificativi hanno formati diversi. Per il solo Codice
> Fiscale oggi si può evitare quel workaround: sono Matteo e sviluppo CF Ready,
> che valida formalmente il campo CF nativo di Shopify e può renderlo
> obbligatorio nel checkout italiano. Non valida Partita IVA e non trasforma
> “Indirizzo 2”, quindi se servono entrambi i dati occorre separarli.

### 13. Codice fiscale

- **URL:** https://community.shopify.com/t/296608
- **Pubblicato / ultima attività:** 2024-02-16 / 2024-02-21.
- **Stato:** aperto, 2 post; la risposta esistente propone “Indirizzo 2”.
- **Fit:** esatto.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Bozza:**

> Ciao Elisa, rinominare “Indirizzo 2” non rende il valore un vero campo fiscale
> e non ne controlla il formato. Sono Matteo e sviluppo CF Ready: usa il campo
> Codice Fiscale nativo di Shopify, può renderlo obbligatorio e ne verifica
> formalmente il formato anche sui piani non-Plus. Non modifica il tema e non
> gestisce P.IVA o SDI.

### 14. New checkout and fiscal data for Italian store

- **URL:** https://community.shopify.com/t/287656
- **Pubblicato / ultima attività:** 2024-01-22 / 2024-01-24.
- **Stato:** aperto, 4 post.
- **Fit:** forte per CF nativo, ma CF Ready non aggiunge la scelta condizionale
  “fattura o ricevuta”.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Draft in English:**

> One current option is to keep Shopify's native Codice Fiscale field and
> enforce it with a Cart and Checkout Validation, rather than duplicating it
> with Company or a custom field. I develop CF Ready for that specific use case:
> the field can be unmanaged, optional, or required and is formally validated
> on applicable Italian checkouts without Plus. It does not add an “invoice vs
> receipt” selector, so if mandatory status must change dynamically from that
> choice, this app does not cover that conditional flow.

### 15. Codice fiscale e Partita IVA obbligatori in fase di checkout

- **URL:** https://community.shopify.com/t/286875
- **Pubblicato / ultima attività:** 2024-01-19 / 2024-01-19.
- **Stato:** aperto, senza risposte.
- **Fit:** parziale.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Bozza:**

> Ciao, separerei i due requisiti: Codice Fiscale e Partita IVA non vanno
> trattati come lo stesso campo. Sono Matteo e sviluppo CF Ready per la sola
> parte CF/PEC: lavora sui campi nativi italiani, può rendere obbligatorio e
> validare formalmente il Codice Fiscale e non richiede Plus. Non raccoglie né
> valida la Partita IVA, quindi non è una soluzione completa se ti servono
> entrambi.

### 16. Controllo veridicità dati fatturazione

- **URL:** https://community.shopify.com/t/271965
- **Pubblicato / ultima attività:** 2023-11-26 / 2023-11-26.
- **Stato:** aperto, senza risposte.
- **Fit:** utile solo per correggere l'equivoco tra validità formale e
  appartenenza anagrafica.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Bozza:**

> Ciao, qui è importante distinguere correttezza formale e veridicità
> anagrafica. Il formato e il carattere di controllo del Codice Fiscale si
> possono verificare nel checkout; l'appartenenza a una persona reale richiede
> invece fonti ufficiali e non va promessa. Sono Matteo e sviluppo CF Ready:
> rende obbligatorio il campo CF nativo e ne verifica solo la correttezza
> formale. Non controlla P.IVA, non attesta l'identità e non sostituisce il
> parere del commercialista.

### 17. Come inserire il campo codice fiscale obbligatorio nel checkout

- **URL:** https://community.shopify.com/t/258737
- **Pubblicato / ultima attività:** 2023-10-12 / 2023-10-12.
- **Stato:** aperto, senza risposte.
- **Fit:** esatto.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Bozza:**

> Ciao Mario, il campo Codice Fiscale è già esposto da Shopify nei checkout
> italiani pertinenti, ma resta facoltativo. Sono Matteo e sviluppo CF Ready:
> può renderlo obbligatorio e controllarne formalmente il formato prima che
> l'ordine venga completato, anche senza Shopify Plus e senza modificare il
> tema. Non emette fatture e non gestisce Partita IVA o SDI.

## Shopify Community — opportunità tecniche con bozza

### 18. Get Italian Codice Fiscale and PEC field values through API

- **URL:** https://community.shopify.com/t/268392
- **Pubblicato / ultima attività:** 2023-11-14 / 2025-09-05.
- **Stato:** aperto, 8 post; la risposta accettata usa
  `localizationExtensions`, oggi deprecato.
- **Fit:** tecnico esatto; la risposta può essere utile senza citare CF Ready.
- **Priorità / rischio:** alta / basso.
- **Verdetto:** rispondere con un aggiornamento tecnico.

**Draft in English:**

> A current update for anyone landing here: in the Admin GraphQL API, query
> `Order.localizedFields`; `localizationExtensions` is deprecated. For example:
>
> ```graphql
> query OrderLocalizedFields($id: ID!) {
>   order(id: $id) {
>     localizedFields(first: 10) {
>       nodes { countryCode purpose title value }
>     }
>   }
> }
> ```
>
> This requires the appropriate orders scope. The REST Order resource still
> isn't the right surface for these country-specific fields.

### 19. Codice Fiscale e PEC mancanti nel webhook di creazione ordine

- **URL:** https://community.shopify.com/t/42949
- **Titolo originale:** “Codice Fiscale (CF) and Posta Elettronica Certificata
  (PEC) missing from Order creation webbook”.
- **Pubblicato / ultima attività:** 2021-04-12 / 2023-10-18.
- **Stato:** aperto, 3 post.
- **Fit:** tecnico esatto ma molto vecchio.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** usare solo se si decide di aggiornare anche i thread tecnici
  storici.

**Draft in English:**

> A current workaround is to treat the webhook as the trigger, not the complete
> data source. Use the order ID from the event and query
> `Order.localizedFields` through the Admin GraphQL API, with the appropriate
> orders scope; `localizationExtensions` is deprecated. That returns the
> country-specific tax fields even when they aren't present in the webhook
> payload. It adds a follow-up API read, so the webhook handler should remain
> idempotent and handle that read failing or being retried.

### 20. Fiscal Code / PEC fields on order — how to get them via API

- **URL:** https://community.shopify.com/t/106978
- **Pubblicato / ultima attività:** 2022-03-16 / 2023-10-16.
- **Stato:** aperto, 3 post.
- **Fit:** tecnico esatto ma molto vecchio.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** opportunità di archivio.

**Draft in English:**

> This is now available through Admin GraphQL: query
> `Order.localizedFields` and read the returned `countryCode`, `purpose`,
> `title`, and `value`. The older `localizationExtensions` field is deprecated,
> and the REST order resource isn't the surface to rely on. This requires the
> appropriate orders scope.

### 21. How to add tax code and PEC in email order confirmation

- **URL:** https://community.shopify.com/t/135564
- **Pubblicato / ultima attività:** 2022-07-15 / 2022-07-15.
- **Stato:** aperto, senza risposte.
- **Fit:** tecnico, ma il template Liquid non può interrogare l'Admin API.
- **Priorità / rischio:** bassa / alto per età.
- **Verdetto:** usare solo come chiarimento architetturale; non promettere una
  variabile Liquid non documentata.

**Draft in English:**

> You can't make an Admin GraphQL request from a notification Liquid template.
> The values are available to an authenticated backend through
> `Order.localizedFields`, but that doesn't make them notification variables
> automatically. A safe pattern is an app or automation that reads the fields
> server-side and copies only the needed value to a destination supported by the
> template, after checking privacy and orders-scope requirements.

## Shopify Community — censiti ma da non contattare

Questi risultati completano il perimetro delle query, ma non hanno una bozza
perché una risposta di CF Ready sarebbe fuori scope, ridondante o
verosimilmente promozionale. Sono ordinati per ultima attività.

| Ultima attività | Titolo e URL | Motivo per non rispondere |
| --- | --- | --- |
| 2026-06-23 | [Scontrini e fatturazione](https://community.shopify.com/t/304458) | Fiscalità e corrispettivi; nessun problema CF/PEC risolvibile dall'app. |
| 2026-06-23 | [Fatturazione elettronica](https://community.shopify.com/t/301166) | Domanda legale sull'obbligo del CF; ultimo post promozionale. |
| 2026-06-23 | [Form per richiesta dati fatturazione](https://community.shopify.com/t/137158) | Flusso B2B completo P.IVA/PEC/SDI; revival promozionale. |
| 2026-06-23 | [Aggiungere flag per la richiesta della fattura](https://community.shopify.com/t/253891) | Richiede un selettore condizionale fattura e campi B2B che CF Ready non offre. |
| 2026-06-23 | [richiesta fattura](https://community.shopify.com/t/371417) | Richiede checkbox e form completo di fatturazione. |
| 2026-06-23 | [Emissione fattura per acquisti su Shopify](https://community.shopify.com/t/345018) | Emissione della fattura, non raccolta/validazione CF e PEC. |
| 2026-06-23 | [Fattura](https://community.shopify.com/t/158536) | Thread del 2022 riattivato da una promozione; valore aggiunto insufficiente. |
| 2026-06-23 | [Emettere fattura su richiesta dell'acquirente](https://community.shopify.com/t/212958) | CF Ready non copre il flusso condizionale né invia la fattura. |
| 2025-11-24 | [Fatture in Cloud e invio automatico](https://community.shopify.com/t/375221) | Automazione contabile e documentale fuori scope. |
| 2025-11-24 | [Situazione campi aziendali P.IVA / SDI](https://community.shopify.com/t/336604) | Il bisogno centrale è B2B P.IVA/SDI. |
| 2025-11-24 | [Emissione documenti fiscali](https://community.shopify.com/t/10346) | Topic del 2020 riattivato da un'app concorrente; fuori scope. |
| 2025-08-27 | [Can I create a B2B ecommerce on my existing B2C Shopify?](https://community.shopify.com/t/319876) | Falso positivo: il CF compare solo in una risposta laterale. |
| 2025-04-11 | [Partita IVA e SDI al checkout](https://community.shopify.com/t/205021) | Non chiede CF o PEC nativi. |
| 2025-02-17 | [How to Extract Codice Fiscale and PEC Fields in Liquid](https://community.shopify.com/t/394967) | Manca una variabile Liquid documentata e verificata; non speculare. |
| 2024-03-22 | [Immettere nome azienda, P.IVA e SDI durante il checkout](https://community.shopify.com/t/10653) | Solo dati B2B fuori scope. |
| 2024-01-23 | [È possibile togliere i campi delle informazioni aggiuntive](https://community.shopify.com/t/45635) | Chiede di rimuovere CF/PEC, non di gestirli. |
| 2024-01-23 | [Campi Checkout](https://community.shopify.com/t/255716) | Vuole rinominare CF/PEC in P.IVA/SDI; incompatibile col prodotto. |
| 2024-01-22 | [Informazioni aggiuntive — Codice fiscale opzionale](https://community.shopify.com/t/287668) | Vuole riusare il campo CF come P.IVA. |
| 2023-07-25 | [Fatturare ai clienti del mio e-commerce](https://community.shopify.com/t/234686) | Richiesta generale P.IVA/CF/PEC/SDI e fatturazione; troppo ampia e vecchia. |
| 2023-06-22 | [Togliere tasto PayPal checkout rapido](https://community.shopify.com/t/225923) | Falso positivo: problema di pagamento rapido, non di campi fiscali. |
| 2023-03-30 | [How can I hide additional information on the checkout page?](https://community.shopify.com/t/203473) | Vuole nascondere i campi. |
| 2022-08-23 | [Codice Fiscale / Partita IVA obbligatori in Italia](https://community.shopify.com/t/143630) | Premessa legale da verificare e topic molto vecchio. |
| 2022-06-14 | [“Indirizzo 2” non obbligatorio per clienti non italiani](https://community.shopify.com/t/127710) | Il prodotto risolve il problema, ma il topic è troppo vecchio per riaprirlo senza apparire promozionali. |
| 2022-05-27 | [Dati azienda per fattura](https://community.shopify.com/t/40329) | Flusso aziendale completo e API contabile, non solo CF/PEC. |
| 2022-05-12 | [Codice Fiscale or P.IVA must be mandatory](https://community.shopify.com/t/120752) | Fit parziale ma topic senza attività da oltre quattro anni. |
| 2022-05-05 | [Partita IVA modulo checkout](https://community.shopify.com/t/118482) | Partita IVA soltanto. |
| 2021-12-02 | [Partita IVA obbligatoria per checkout](https://community.shopify.com/t/6683) | Partita IVA soltanto. |
| 2021-11-30 | [Shopify Checkout mandatory field](https://community.shopify.com/t/81841) | Fit storico, ma senza attività dal 2021. |
| 2021-11-01 | [Campi indesiderati PEC e Codice Fiscale](https://community.shopify.com/t/16520) | Il merchant vuole rimuoverli; thread molto vecchio. |

### Shopify Developer Community — censiti ma da non contattare

| Ultima attività | Titolo e URL | Motivo |
| --- | --- | --- |
| 2026-04-02 | [Expose localizedFields on webhooks and downstream integration payloads](https://community.shopify.dev/t/expose-localizedfields-localized-fields-on-webhooks-and-downstream-integration-payloads/32780) | Richiesta completa e già inoltrata internamente da Shopify; rispondere ha senso solo con dati nuovi su volumi, latenza o failure mode. |
| 2024-11-06 | [Refining the “Additional Information” Section Text](https://community.shopify.dev/t/832) | Vuole trasformare CF e PEC in P.IVA e SDI; CF Ready non lo fa. |

## Blog e siti editoriali

### 22. IFG eCommerce — articolo del 13 agosto 2026

- **Titolo:** [Fatturazione Elettronica Shopify: Flussi e Campi Fiscali](https://ifgecommerce.com/blogs/articoli-shopify/fatturazione-elettronica-shopify-campi-fiscali-sdi)
- **Pubblicato:** 2026-08-13.
- **Ultima risposta:** nessuna visibile.
- **Canale:** commento pubblico soggetto ad approvazione.
- **Contesto:** propone cart attributes e personalizzazioni del tema senza
  citare i campi nativi `TAX_CREDENTIAL_IT` / `TAX_EMAIL_IT`; presenta la
  validazione via regex nel carrello.
- **Fit:** forte come correzione tecnica circoscritta, ma il sito vende servizi
  concorrenti.
- **Priorità / rischio:** alta / alto.
- **Verdetto:** valutare un solo commento tecnico su questo articolo; se lo si
  invia, non commentare anche gli altri articoli IFG.

**Bozza:**

> Aggiungo un aggiornamento tecnico sulla sola parte Codice Fiscale/PEC:
> Shopify espone già i campi nativi italiani quando il checkout è pertinente e
> la documentazione consiglia di rimuovere personalizzazioni duplicate. Sono
> Matteo e sviluppo CF Ready: uso quei campi nativi con una Cart and Checkout
> Validation per rendere il CF facoltativo o obbligatorio e verificarne
> formalmente il formato, anche sui piani non-Plus, senza intervenire sul tema.
> Non copre Partita IVA, SDI o fatturazione elettronica. Lo segnalo come
> alternativa circoscritta ai cart attributes quando il requisito è soltanto
> CF/PEC; per il flusso B2B completo l'approccio descritto nell'articolo resta un
> problema diverso.

### Altri articoli censiti

| Data / aggiornamento | Titolo e URL | Stato | Verdetto |
| --- | --- | --- | --- |
| 2026-07-29 (modificato; pubblicato 2026-05-21) | [Shopify a norma in Italia: checklist privacy e cookie](https://ifgecommerce.com/blogs/articoli-shopify/negozio-shopify-norma-italia-privacy-cookie) | Commenti moderati aperti; propone di rinominare Address2/Company | Non commentare se si usa l'articolo IFG più recente; sarebbe duplicazione sullo stesso sito. |
| 2026-06-21 | [Codice fiscale e partita IVA su Shopify: come raccoglierli al checkout](https://blog.weareict.it/post/come-gestire-chiedere-codice-fiscale-partita-iva-shopify-senza-app) | Nessun commento pubblico trovato | Non contattabile pubblicamente. |
| 2026-03-31 | [Fatturazione Elettronica Shopify in Italia: SDI e Forfettario](https://ifgecommerce.com/blogs/articoli-shopify/fatturazione-elettronica-shopify-italia-sdi-forfettario) | Commenti moderati; tema B2B/Plus molto più ampio | Non commentare: il contributo CF Ready sarebbe laterale e duplicato. |
| 2026-02-20 | [Dati fiscali Shopify: CF, P.IVA e SDI nel carrello](https://www.myappify.com/blog/dati-fiscali-shopify-codice-fiscale-partita-iva-sdi-carrello) | Blog di un prodotto concorrente; nessun commento trovato | Non contattabile e alto rischio promozionale. |
| 2021-04-11 (modificato; pubblicato 2019-03-14) | [How to capture customers' Codice Fiscale](https://sufio.com/articles/shopify/taxes/vat-eu-shopify/eu-taxes/italian-taxes/customers-codice-fiscale/) | Articolo di un prodotto concorrente; nessun commento trovato | Non contattabile. |
| 2020-10-28 | [Come gestire P.IVA e Codice Fiscale in Shopify](https://www.myappify.com/blog/come-gestire-p-iva-e-codice-fiscale-in-shopify-myappify) | Articolo storico di un prodotto concorrente | Non contattabile e obsoleto. |

## Reddit

Nessun risultato Reddit supera il filtro anti-spam. Le discussioni trovate sono
domande fiscali o di acquirenti, non richieste di merchant Shopify su un
meccanismo che CF Ready possa risolvere direttamente.

| Ultima attività osservata | Titolo e URL | Comunità | Motivo per non rispondere |
| --- | --- | --- | --- |
| 2026-06-25 | [Codice fiscale when shopping online](https://www.reddit.com/r/Italian/comments/1imvth3/codice_fiscale_when_shopping_online/) | r/Italian | Problema di un acquirente IKEA straniero; nessuna evidenza Shopify e nessun ruolo merchant. |
| 2025-10-14 | [Italian online shop asking for tax code before shipping](https://www.reddit.com/r/Italian/comments/1o6gahm) | r/Italian | Domanda di un acquirente estero; risolta nel thread. |
| 2025, data esatta non esposta dall'indice | [Fatturazione elettronica per e-commerce](https://www.reddit.com/r/commercialisti/comments/1nvm1px/fatturazione_elettronica_per_ecommerce/) | r/commercialisti | Domanda fiscale generale; non è dimostrato che il sito usi Shopify. |
| 2024-04-10 | [Registratore di cassa per commercio online](https://www.reddit.com/r/commercialisti/comments/1c0gwii) | r/commercialisti | Cita Shopify, ma chiede un parere fiscale su corrispettivi e registratore di cassa. |
| 2024-05-12 | [Trying to buy tickets for Italy, how do I get a tax code?](https://www.reddit.com/r/ACDC/comments/1cq4w47) | r/ACDC | Problema di un acquirente, non Shopify; risolto. |

I risultati su VAT ID in `r/shopify` e `r/ShopifyeCommerce` sono stati esclusi
come falsi positivi perché non riguardano Codice Fiscale o PEC italiani.

## Forum specialistici e altre community

| Ultima attività osservata | Titolo e URL | Sito | Verdetto |
| --- | --- | --- | --- |
| 2024-07-03 | [Fatturazione elettronica clienti esteri](https://www.fiscoetasse.com/forum/threads/fatturazione-elettronica-clienti-esteri.153767/) | Fisco e Tasse Forum | Non rispondere: domanda fiscale; CF Ready intenzionalmente non impone il CF ai clienti esteri. |
| 2024 circa | [Fatturazione elettronica in assenza del codice fiscale del cliente](https://www.fiscoetasse.com/forum/threads/fatturazione-elettronica-in-assenza-del-codice-fiscale-del-cliente.132273/) | Fisco e Tasse Forum | Non rispondere: quesito legale/fiscale generale, non Shopify. |
| 2023-10-03 | [Codice Fiscale sempre obbligatorio per i clienti privati italiani?](https://forum.italia.it/t/codice-fiscale-sempre-obbligatorio-per-i-clienti-privati-italiani/35991) | Forum Italia | Non rispondere: discussione tecnica e normativa già sviluppata; un pitch sarebbe laterale. |
| Storico | [Shopify, BigCommerce, Volusion](https://connect.gt/topic/186568/shopify-bigcommerce-volusion/12) | Connect.gt | Non rispondere: confronto piattaforme obsoleto. |

Sono stati esclusi anche risultati relativi a WooCommerce, Magento, eBay,
WHMCS, viaggi, università e ottenimento del Codice Fiscale: contengono le stesse
parole chiave, ma non rappresentano opportunità per uno sviluppatore di
un'app Shopify.

## Metodo e limiti della mappatura

### Query coperte

La ricerca ha combinato motore web e API pubbliche Discourse con query in
italiano e inglese, includendo:

- `codice fiscale`, `PEC checkout`, `TAX_CREDENTIAL_IT`, `TAX_EMAIL_IT`;
- `tax credential italy`, `localized field italy`, `fiscal code`;
- `Italian checkout`, `codice fiscale obbligatorio`, `validazione` e
  `Indirizzo 2`;
- ricerche equivalenti su Shopify Developer Community, Reddit, blog e forum.

Per Shopify Community sono stati riletti i metadati pubblici dei topic: data di
creazione, ultima attività, conteggio post, visibilità e stato aperto/chiuso. Al
31 agosto 2026 tutti i 50 topic Shopify Community qui censiti risultano visibili,
non archiviati e non chiusi; questo non implica che sia opportuno riaprirli.

### Identità e risposte pregresse

La ricerca pubblica dell'account attuale espone una risposta e un topic. Il
vecchio account non espone un elenco pubblico delle attività, ma il post 12 del
topic 554855 è attribuito pubblicamente a `max2348`; Matteo ha confermato che
anche questo account è suo e ha indicato di rimandare quella risposta con
`max23468`. Le risposte cancellate, rimosse definitivamente o non più accessibili
non possono essere ricostruite in modo affidabile.

### Significato di “completa”

La mappa è completa rispetto alle fonti pubbliche e indicizzabili trovate con le
query sopra alla data della rilevazione. Non può provare l'assenza di:

- contenuti cancellati, privati, chiusi ai crawler o non indicizzati;
- commenti di blog caricati solo dopo login;
- post in community private o gruppi social;
- risposte del vecchio account non più esposte dalla ricerca pubblica.

Prima di inviare qualsiasi bozza vanno ricontrollati pagina, ultima risposta,
regole locali e stato di moderazione. Nessuna bozza costituisce
un'autorizzazione alla pubblicazione.
