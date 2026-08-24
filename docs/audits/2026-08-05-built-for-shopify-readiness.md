# Readiness Built for Shopify — `0.9.11`

**Data:** 5 agosto 2026

**Versione Production:** `0.9.11`, commit `117ecb6`

**Ambiente UI:** app Production installata su `cf-ready-dev.myshopify.com`, Chrome

Questo audit raccoglie soltanto il lavoro eseguibile senza attendere nuovi dati
da Shopify. Installazione, prima apertura, disinstallazione e reinstallazione
non sono ripetute qui perché erano già state provate prima di questa sessione.

## Esito

Non sono emersi difetti applicativi da correggere. CF Ready usa la superficie
embedded dell'Admin, i componenti Shopify e una Cart and Checkout Validation
Function; non modifica tema o risorse del negozio e non porta i flussi primari
fuori dall'Admin. Restano separati i requisiti che richiedono nuovi campioni
Shopify o una prova manuale non attestabile da questa automazione.

| Tema | Prova del 5 agosto | Esito |
| --- | --- | --- |
| Home utile | mostra stato della Validation, regole CF/PEC, messaggi, piano e prossimo passo | ✅ |
| Embedded | Home, Regole, Messaggi, Guida e onboarding restano dentro Shopify Admin | ✅ |
| App Bridge e sessione | ogni route autenticata usa `authenticate.admin`; lo script App Bridge è caricato nelle cinque route live | ✅ |
| Mobile | a 320 px le cinque route hanno `scrollWidth === clientWidth`; nessun overflow orizzontale | ✅ |
| Zoom 200% | zoom nativo di Chrome portato al 200% su Home, Regole, Messaggi, Guida e onboarding; contenuti, gerarchia e controlli restano disponibili | ✅ |
| VoiceOver | VoiceOver reale attivato su macOS con pannello didascalie abilitato; Chrome espone titoli, controlli, nomi, valori e stati dell'app senza elementi azionabili anonimi | ✅ compatibilità strutturale |
| Semantica | un `h1` dell'Admin per route, sezioni di livello 2, choice list nominate, textbox etichettate, immagini con testo alternativo | ✅ |
| Tastiera | ordine dei campi già verificato; la Guida risponde a `Space`; il dialogo si chiude con `Esc` e restituisce il focus al pulsante | ✅ |
| Errori e Save Bar | un messaggio oltre 200 caratteri espone l'errore e la Save Bar; ripristinando il valore originale la Save Bar scompare, senza salvataggio | ✅ |
| Dialoghi | il dialogo di disattivazione ha titolo, pulsanti nominati e focus interno; chiuso senza confermare | ✅ |
| Onboarding | percorsi tutti e quattro i passi fino al riepilogo e ritorno al primo, senza cambiare regole, diritto o Validation | ✅ |
| Contrasto | l'UI testuale usa i componenti e i token Shopify; nel codice applicativo non ci sono colori testuali custom | ✅ per la superficie verificabile |
| Copy e stati | copy IT/EN completo; limiti formali, fail-open, prova esplicita e assenza di modifiche al tema sono dichiarati nei punti decisionali | ✅ |
| Theme e Asset API | nessuno scope tema, nessuna chiamata Asset API, nessuna Theme App Extension o Checkout UI Extension | ✅ |
| Flussi nell'Admin | configurazione, messaggi, onboarding, stato e billing partono dall'app embedded; l'unica uscita prevista è la schermata Shopify di approvazione dell'addebito | ✅ |
| Materiali review | listing IT/EN, screenshot, screencast e istruzioni reviewer descrivono ancora il comportamento della `0.9.11` | ✅ |

Il controllo a 320 px copre il requisito di reflow più severo della normale
vista mobile. VoiceOver è stato attivato davvero, poi ripristinato su `off`; lo
zoom di Chrome è stato verificato al 200% e riportato al 100%. L'automazione non
registra l'audio pronunciato da VoiceOver, quindi la prova attesta la struttura
esposta al lettore di schermo, non una trascrizione frase per frase.

## Checklist «well integrated» e design Shopify

- [x] app embedded e navigazione nativa nell'Admin;
- [x] autenticazione Shopify su ogni loader e action embedded;
- [x] App Bridge caricato prima dell'idratazione e usato per loading, Save Bar e modali;
- [x] componenti Polaris Web Components per pagine, sezioni, controlli, feedback e azioni;
- [x] una sola Validation per store, gestita senza toccare risorse di altre app;
- [x] unico scope `write_validations`, senza letture di ordini, clienti, prodotti o inventario;
- [x] nessun login esterno e nessun flusso primario ospitato fuori da Shopify;
- [x] stati di caricamento, errore, salvataggio e conferma presenti nei flussi che li richiedono;
- [x] copy bilingue e coerente tra app, checkout, listing e istruzioni reviewer;
- [x] nessuna modifica al tema, nessun campo alternativo e nessun uso della Asset API;
- [x] comportamento fail-open sugli errori dell'app e sui dati Shopify non osservabili;
- [x] privacy minimizzata: CF, PEC, ordini e dati cliente non sono conservati o inviati all'app.

Non si aggiungono Admin actions, resource picker o theme extension: non
servono al lavoro che CF Ready svolge e sarebbero integrazioni speculative.

## Matrice checkout pronta per il collaudo

Le fixture sintetiche canoniche restano quelle delle
[reviewer instructions](../listing/reviewer-instructions.md#4-test-values):
`RSSMRA85T10A562S`, `RSSMRA85T10A562X`, `mario.rossi@example.com` e
`mario.rossi@pec`.

| Contesto | Regola/dato | Risultato atteso | Stato prova |
| --- | --- | --- | --- |
| Consegna e fatturazione italiane | CF obbligatorio, vuoto | blocco con messaggio configurato | fixture server-side M10 completata |
| Consegna e fatturazione italiane | CF obbligatorio, fixture non valida | blocco formale | fixture server-side M10 completata |
| Consegna e fatturazione italiane | CF obbligatorio, fixture valida | la Function non blocca | fixture server-side M10 completata |
| Consegna e fatturazione italiane | PEC facoltativa, vuota | la Function non blocca | fixture server-side M10 completata |
| Consegna e fatturazione italiane | PEC compilata, fixture non valida | blocco formale | fixture server-side M10 completata |
| Consegna e fatturazione italiane | PEC compilata, fixture valida | la Function non blocca | fixture server-side M10 completata |
| Fatturazione o sole consegne estere | qualsiasi valore | regole italiane non applicate | fixture server-side M10 completata |
| Consegna italiana osservabile, campo obbligatorio non esposto | campo assente | blocco globale | fixture server-side M10 completata |
| Nessuna consegna osservabile | campo assente | fail-open | fixture server-side M10 completata |
| Errore config, entitlement o runtime | qualsiasi valore | fail-open | coperto da test automatici |
| Checkout standard e wallet disponibili | casi precedenti | stesso esito della Function | superfici non transazionali ricognite in M10; un checkout reale organico idoneo a una regola italiana attiva, con esecuzione ed esito della Function confermati, resta gate M11 per `1.0.0` |

Nel tentativo live del 5 agosto i localized fields sono comparsi dopo un
indirizzo italiano, ma la validazione nativa dei dati di pagamento è intervenuta
prima della Function. Non è stato creato alcun ordine e il carrello è stato
svuotato. M10 è stata poi chiusa il 25 agosto con fixture server-side e
ricognizione delle superfici non transazionali, senza generare transazioni.

## Residui differiti

- Core Web Vitals: differiti dall'owner finché Shopify non avrà raccolto nuovi
  campioni successivi al deploy `0.9.11`.
- Merchant utility: installazioni paganti, recensioni e rating dipendono dai
  dati raccolti da Shopify.
- Categoria Built for Shopify: il Partner Dashboard non ne ha ancora assegnata
  una.
- Checkout end-to-end e wallet: l'osservazione passiva prosegue sui prossimi
  ordini che li renderanno disponibili; non blocca M10 e non richiede ordini
  artificiali, ma almeno un checkout reale organico idoneo a una regola italiana
  attiva, con esecuzione ed esito della Function confermati, resta obbligatorio
  prima della `1.0.0` in M11.
