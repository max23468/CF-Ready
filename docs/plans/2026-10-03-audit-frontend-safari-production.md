# Audit completo del frontend di CF Ready in Safari Production

**Stato:** ricognizione delle superfici conclusa; restano verifiche live aperte nella sezione 10. I due rilievi confermati sono stati corretti in locale, senza pubblicazione; dettagli nella sezione 13.
**Data:** 3 ottobre 2026.
**Ambiente:** Numisleo, `numisleo.myshopify.com`, app Production `cf-ready`, origine `app.cfready.it`.
**Browser:** Safari 27.0.1, build `22625.1.29.11.28`, sessione Admin esistente su macOS.
**Release osservata:** `1.15.22`, commit `4128401f17d26b9a090880ca23337346ff3ddf97`.

## 1. Metodo e identità della release

Il riferimento è l'[audit precedente](2026-10-01-audit-ui-ux-production.md), comprese le sue sezioni di implementazione e verifica. Sono stati confrontati codice, test e ultime PR pubblicate prima di percorrere l'app reale in Safari. Le esclusioni dell'owner T1, T2, T6, H2, H9, M5 e O6 restano valide.

La verifica ha distinto tre prove:

1. **Safari Production:** navigazione, screenshot, albero di accessibilità nativo, bozze locali, finestre di conferma, simulatore, diagnostica, sito pubblico e checkout shopper.
2. **Codice della release:** inventario delle route, traduzioni, stati non disponibili sullo store, contratti di navigazione e markup delle anteprime.
3. **WebKit locale:** suite merchant esistente, con componenti reali e fixture dei dati. Questa prova non equivale al comportamento completo del provider o a Safari Production.

Il [run di pubblicazione](https://github.com/max23468/CF-Ready/actions/runs/37114669953) riporta commit e provider source coincidenti, smoke e readback verdi. La diagnostica del collegamento di assistenza nell'app live riporta `1.15.22`.

| Identità | Valore verificato |
| --- | --- |
| Promozione | [PR #617](https://github.com/max23468/CF-Ready/pull/617) |
| Tree Git | `9e0c67dd2b26b4ae6bd0eb3157374573d7f5bafa` |
| Worker deployment | `0ddc7545-ebec-400e-8833-376a6e183eaf` |
| Worker version | `4464b5eb-167b-4503-b47c-180844db0578`, traffico 100% |
| Shopify app version | `gid://shopify/AppVersion/1153387593729`, tag `1.15.22` |
| Receipt | 3 ottobre 2026, 09:56:49 UTC |
| Migrazioni | Readback verde nel receipt della pubblicazione, nessuna applicata dall'audit |

Il working tree era pulito all'inizio, su `develop` allo stesso commit. Non sono stati modificati codice, configurazioni di deploy o dipendenze.

## 2. Priorità e valutazione generale

Non sono emersi nuovi blocchi nei percorsi osservati. Sono confermati due rilievi, uno di accessibilità e uno di localizzazione del recupero da errore.

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| S-A1 | L'anteprima del simulatore può cambiare lingua senza dichiararla nel markup | Media | Alta sul markup; pronuncia VoiceOver non provata |
| S-P1 | Un indirizzo inesistente sotto `/en/` apre la 404 italiana e propone recupero in italiano | Bassa | Alta |

**Severità:** Alta per un blocco o un rischio concreto sul checkout; Media per un degrado funzionale, di chiarezza o accessibilità; Bassa per un difetto circoscritto senza blocco. La confidenza riguarda le prove del singolo rilievo, non tutte le varianti possibili.

| Superficie | Salute dei percorsi osservati | Copertura |
| --- | --- | --- |
| Home e piano corrente | Buona | Live e stati alternativi nelle fixture WebKit |
| Regole, etichette e campo Interno | Buona in lettura; scritture non riconfermate | Live, bozze e codice; osservata variabilità esterna dello stato |
| Simulatore | Buona, con S-A1 | Tutti gli scenari del menu e casi aggiuntivi live |
| Messaggi al cliente | Buona | IT/EN, bozze, limite, anteprima e protezione dalla navigazione |
| Guida, FAQ e assistenza | Buona | Live, diagnosi effettiva e collegamenti di salto |
| Onboarding | Buona nella revisione di uno store configurato | Quattro passi live; primo avvio e attivazione nelle fixture |
| Sito pubblico | Buona, con S-P1 | 16 pagine IT/EN e 404 |
| Checkout nativo Numisleo | Campi ed errori coerenti nei casi osservati | Safari live IT/EN prima dell'invio finale dell'ordine |
| Errori, attese, trial e billing alternativi | Nessuna regressione nella suite eseguita | Codice e WebKit locale, non provocati in Production |

## 3. Rilievi confermati

### S-A1. Lingua programmatica del simulatore

**Riproduzione:** con interfaccia merchant italiana, aprire Regole checkout, Opzioni avanzate e selezionare Inglese come lingua dell'anteprima. Il simulatore mostra titoli, istruzioni, campi ed esiti inglesi, mentre il resto della pagina resta italiano.

**Prova live:** simulatore inglese dentro la pagina italiana (schermata rimossa su richiesta dell’owner).

**Prova nel codice:** `app/root.tsx` dichiara `html lang={locale}`. In `app/features/rules/CheckoutSimulator.tsx`, `previewLocale` determina testi e messaggi; il contenitore con `rootRef` e il componente `SimulatorCustomerFields` non dichiarano `lang`. Il controllo della cartella non trova un attributo di lingua che delimiti il simulatore. Il componente Messaggi, invece, dichiara già la lingua dei testi di anteprima.

**Impatto:** una tecnologia assistiva può ereditare la lingua italiana per contenuto inglese, con pronuncia e comprensione peggiori. Il requisito di identificare i cambi di lingua è descritto nella [spiegazione W3C di WCAG 3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html). Non è stata eseguita una prova audio VoiceOver: il finding dimostra il markup mancante, non una specifica pronuncia osservata.

**Correzione proposta:** dichiarare `lang={previewLocale}` sul contenitore del simulatore; verificare IT → EN ed EN → IT, mantenendo la lingua merchant sulle parti esterne. È una proposta, non una modifica eseguita.

### S-P1. Recupero da 404 nel sito inglese

**Riproduzione:** aprire `https://cfready.it/en/audit-pagina-inesistente-20261003`. La pagina mostra «Questa pagina non c'è», descrizione e azioni italiane; Home e guide puntano ai percorsi italiani.

**Prova live:** 404 dal percorso inglese (schermata rimossa su richiesta dell’owner). **Prova nel codice:** `site/404.html` è un documento con `lang="it"`, testi italiani e collegamenti `/` e `/guide/...`, senza recupero inglese.

**Impatto:** chi consulta il sito in inglese perde il contesto linguistico proprio durante il recupero da un indirizzo errato. Le pagine inglesi valide funzionano: il problema è circoscritto alla 404.

**Correzione proposta:** offrire una 404 bilingue oppure selezionare la lingua dal percorso, con collegamenti di recupero coerenti. Non è necessario cambiare l'architettura del sito per correggere questo caso.

## 4. Home e stati commerciali

La Home mostra validazione attiva, Codice Fiscale obbligatorio, PEC facoltativa e validata, messaggi predefiniti e piano omaggio permanente. Badge, icona informativa e azione critica sono leggibili. «Apri gli ordini» e «Guida e FAQ» hanno destinazioni pertinenti.

È stata aperta e annullata la conferma di disattivazione. La finestra espone l'effetto sul checkout e usa un'azione critica. La disattivazione effettiva non è stata eseguita.

Prove: Home iniziale (schermata rimossa su richiesta dell’owner), conferma critica (schermata rimossa su richiesta dell’owner), Home stretta (schermata rimossa su richiesta dell’owner), readback finale (schermata rimossa su richiesta dell’owner).

Trial, primo avvio, scadenza, piano mensile/annuale, pagamento unico, confronto piani, errori billing, stato in verifica e check-in non sono stati prodotti artificialmente sullo store omaggio. Sono stati letti nei componenti e percorsi nella suite `home-route`, `route-surfaces` e `visual-surfaces`. La suite verifica anche conferma Shopify rapida, lenta e fallita. Non dimostra una nuova transazione billing live né il ritorno da una pagina di approvazione Shopify reale.

## 5. Regole checkout, etichette e simulatore

### 5.1 Regole ed etichette

Sono state lette tutte le modalità dei due campi, le spiegazioni, i contesti linguistici italiano/inglese, Campo Interno, Testi del checkout e dettagli tecnici. La gestione automatica e la verifica manuale restano distinguibili. La procedura manuale era consultabile; non è stata inviata una conferma manuale.

Una bozza locale con PEC obbligatoria per aziende è stata provata nel simulatore e rimossa con «Rimuovi». Non è stato premuto «Salva». Dopo ricarica, il readback mostra Codice Fiscale obbligatorio e PEC facoltativa, testi aggiornati e nessuna etichetta fiscale nel campo Interno.

La cronologia e il ripristino della configurazione rimossi dalle release precedenti non ricompaiono. Sono superati dalla decisione D-174, quindi non sono nuove superfici da riattivare per il test.

Prove: regole e stati osservati all'inizio (schermata rimossa su richiesta dell’owner), etichette (schermata rimossa su richiesta dell’owner), readback finale (schermata rimossa su richiesta dell’owner).

### 5.2 Matrice del simulatore eseguita in Safari

| Caso | Risultato osservato |
| --- | --- |
| Dati validi | Checkout pronto |
| Codice Fiscale non valido | Errore in linea e checkout bloccato |
| Codice numerico valido | Checkout pronto |
| Omocodia valida | Checkout pronto |
| PEC non valida | Errore PEC e checkout bloccato |
| Campo obbligatorio vuoto | Errore richiesto; «Continua» porta in vista e a fuoco il campo |
| Consegna Francia, fatturazione Italia | Regole non applicate |
| Paese di consegna assente e campo non esposto | Nessun blocco per il campo obbligatorio assente |
| PEC per aziende, Azienda compilata e PEC vuota | Blocco sul campo PEC |
| Stessa bozza, Azienda svuotata e Codice Fiscale valido | Checkout pronto |
| Anteprima inglese | Testi e messaggi inglesi; rilievo S-A1 sul markup |

Sono stati aperti «Quando si applicano» e «Opzioni avanzate». Scenari, paesi e valori di prova non hanno sporcato la configurazione salvata. «Svuota» e la ricarica finale hanno eliminato i valori locali.

Prove: campo richiesto e focus (schermata rimossa su richiesta dell’owner), inglese e opzioni (schermata rimossa su richiesta dell’owner), PEC aziendale (schermata rimossa su richiesta dell’owner).

### 5.3 Variabilità dello stato prima dei salvataggi

Prima di qualsiasi nostro salvataggio, letture successive hanno mostrato PEC prima facoltativa, poi obbligatoria per aziende e poi di nuovo facoltativa; anche lo stato delle etichette è passato da verifiche in sospeso/conflitto ad aggiornato. La Home ha riflesso una delle configurazioni intermedie.

Durante il checkout inglese è comparso anche un testo di aiuto con «optional», mentre il campo era richiesto; alla rilettura successiva era tornato il messaggio di obbligatorietà atteso. Non è stata stabilita la causa.

È stata chiesta la presenza di un'altra sessione che modificasse Numisleo; non è arrivata una risposta che consentisse di attribuire i cambi. Queste osservazioni restano **non attribuite**, non bug riprodotti né prove di un nostro salvataggio. Per evitare di sovrascrivere attività concorrenti, non sono stati eseguiti salvataggi di regole, messaggi o etichette, né cambi di attivazione. Non si può quindi dichiarare riconfermato live il precedente flusso di due salvataggi consecutivi o la risoluzione di un conflitto.

## 6. Messaggi al cliente

Percorsi i quattro testi italiani e i quattro inglesi, con etichette, contatori, anteprima e riepilogo dei messaggi previsti dalle regole. La PEC obbligatoria è distinguibile come non prevista con le regole correnti.

Una bozza sintetica aggiorna l'anteprima e apre la barra di salvataggio. Il tentativo di navigare verso Regole resta bloccato sulla pagina con modifiche non salvate; «Rimuovi» ripristina i testi. Un valore di 208 caratteri produce «Massimo 200 caratteri» senza tagli nella vista stretta. La conferma di ripristino dei testi inglesi usa «in inglese» e spiega che il cambiamento vale dopo il salvataggio; è stata annullata con Escape.

Nessun messaggio è stato salvato su Shopify. Le bozze sono state rimosse, con Home finale su «Predefiniti».

Prove: stato iniziale (schermata rimossa su richiesta dell’owner), bozza e barra (schermata rimossa su richiesta dell’owner), conferma inglese (schermata rimossa su richiesta dell’owner), limite di lunghezza (schermata rimossa su richiesta dell’owner).

## 7. Guida, FAQ, diagnosi e assistenza

Lette le 14 FAQ con espansione e compressione di tutte le risposte. I testi distinguono validazione formale, presenza del campo, consegna italiana, limiti della PEC e campo Interno. La FAQ sul piano si adatta al piano omaggio permanente dello store.

I collegamenti verso assistenza e diagnosi portano il titolo di arrivo in vista. «Riproduci il caso nel simulatore» apre Regole alla sezione corretta, anche nella finestra stretta, con arrivo e focus visibili.

«Aggiorna e verifica» è stato eseguito una volta: esito attivo, diritto di utilizzo presente, configurazione coerente, etichette aggiornate e campo Interno atteso. Gli stati sono tradotti; l'orario osservato è nel fuso dello store, CEST. Questa azione può aggiornare timestamp e stato operativo della diagnostica; non è un salvataggio delle regole.

Il collegamento di assistenza include versione `1.15.22` e diagnostica operativa, secondo il costruttore esistente. Non è stata aperta né inviata una bozza email; «Copia diagnostica» non è stato premuto. Il feedback visivo di copia e gli esiti di richiesta recensione restano coperti dalle fixture, non da un nuovo invio esterno.

Prove: FAQ aperte (schermata rimossa su richiesta dell’owner), diagnosi effettiva (schermata rimossa su richiesta dell’owner), dettaglio (schermata rimossa su richiesta dell’owner), arrivo al simulatore (schermata rimossa su richiesta dell’owner), arrivo stretto (schermata rimossa su richiesta dell’owner).

## 8. Onboarding

Sono stati visitati i quattro passi: introduzione, regole/etichette, messaggi e riepilogo finale. Il passaggio dal primo al secondo e dal terzo al quarto funziona. Il passo 3 è stato raggiunto direttamente, senza simulare un nuovo salvataggio dal passo 2. Il riepilogo riconosce configurazione e piano già attivi e propone «Torna alla Home».

Una ricarica al passo 4 mantiene il passo corretto. Il riepilogo nella finestra stretta conserva regole, piano e messaggi leggibili. Non sono stati completati una nuova installazione, una nuova attivazione o un nuovo pagamento. Le varianti di primo avvio, errori di permessi, salvataggio e completamento restano verificate da codice e suite locale.

Prove: passo 1 (schermata rimossa su richiesta dell’owner), passo 2 (schermata rimossa su richiesta dell’owner), passo 3 (schermata rimossa su richiesta dell’owner), passo 4 (schermata rimossa su richiesta dell’owner), riepilogo stretto (schermata rimossa su richiesta dell’owner).

## 9. Sito pubblico e checkout nativo

### 9.1 Sito `cfready.it`

Visitate in italiano e inglese Home, Assistenza, Privacy, Termini e le quattro guide: obbligatorietà del Codice Fiscale, campi fiscali, campo Interno e validazione. Sono 16 pagine valide, più la 404 inglese. Sono stati letti contenuti e struttura accessibile, con controllo visivo delle viste catturate. Menu stretto, chiusura del menu e salto alle FAQ funzionano.

I testi osservati mantengono il perimetro CF/PEC e la distinzione tra validità formale e identità. Non è una revisione legale dei documenti Privacy e Termini. Non è stato ispezionato visivamente ogni pixel di ogni sezione lunga.

Prove pubbliche: screenshot `29` e `30` per Home e salto FAQ stretti, `31` per Home EN, `32–33` per assistenza, `34–35` per privacy, `36–37` per termini, `38–45` per le quattro guide IT/EN e `46` per la 404, nella [cartella delle prove](../../audit-data/2026-10-03-safari-production/).

### 9.2 Checkout shopper Numisleo in Safari

Il carrello iniziale era vuoto. È stato aggiunto un solo articolo temporaneo, quantità uno, per raggiungere il checkout reale. Sono stati usati soltanto dati sintetici di spedizione e fixture fiscali. Email, telefono effettivo e dati di pagamento sono rimasti vuoti.

| Caso live | Osservazione |
| --- | --- |
| Consegna italiana disponibile | Shopify espone Codice Fiscale e PEC nei campi nativi |
| Codice Fiscale richiesto vuoto | Messaggio di obbligatorietà sotto il campo |
| Codice Fiscale `AUDIT` e PEC `audit@` | Due errori in linea, in italiano |
| Stesso checkout con lingua inglese | Campi e messaggi di errore inglesi |
| Codice numerico sintetico formalmente valido, PEC vuota | Gli errori di formato precedenti scompaiono |
| Indirizzo di fatturazione separato | Controllo aperto e riportato all'impostazione iniziale |

Non è stato premuto «Paga ora» né un pulsante express. La scomparsa degli errori non prova il completamento dell'ordine o tutti gli stadi di esecuzione della Function. Non sono state provate transazioni, wallet, clienti autenticati o tutti i mercati Shopify.

Gli screenshot del checkout sono stati esaminati durante il test ma non conservati nel deliverable perché la barra di Safari conteneva l'identificatore riservato del checkout. Il [readback finale sanificato](../../audit-data/2026-10-03-safari-production/checkout-ripristino.txt) documenta campi personali e pagamento vuoti, lingua italiana e provincia iniziale Milano. I campi fiscali sono stati riletti vuoti prima di svuotare l'indirizzo, che li nasconde. La prova del carrello vuoto (schermata rimossa su richiesta dell’owner) chiude il ripristino dell'articolo temporaneo.

## 10. Inventario completo, responsive e limiti

L'inventario di `app/routes.ts` contiene cinque pagine merchant: Home, Regole, Messaggi, Guida e Onboarding. Sono tutte state percorse live. La radice pubblica dell'app è un redirect; `auth/*`, `performance` e `app/engagement` sono route di servizio, non ulteriori pagine merchant. Shell, recupero embedded ed ErrorBoundary sono stati letti nel codice e verificati nelle fixture pertinenti; non sono stati provocati errori runtime reali del provider.

Safari desktop è stato osservato fino a 1440 px CSS. La finestra stretta ha raggiunto il minimo di circa **574 px CSS**, con una prova dell'onboarding intorno a 600 px. Non va confusa con 500 px o con un iPhone. Nelle viste osservate le superfici passano a una colonna senza tagli che impediscano l'uso.

La suite locale include viewport da 1280, 390 e 320 px, con Polaris reale. Non estende la prova Safari Production a Safari iOS, all'app Shopify mobile o a tutti i testi inglesi merchant live. L'anteprima, i messaggi e il checkout inglesi sono stati provati live; non è stata cambiata la preferenza linguistica dell'account per ripetere tutte le pagine merchant in inglese.

Restano non confermati live:

- due salvataggi consecutivi, nuovi conflitti e relativo riapplico, riscrittura automatica delle etichette e conferma manuale;
- disattivazione e riattivazione effettive, intero onboarding con nuove scritture;
- trial, rinnovi, acquisti di piani e ritorni da approvazione billing;
- invio assistenza, recensione, audio VoiceOver, misurazione completa dei contrasti e audit WCAG formale;
- completamento di un ordine, checkout express, tutti i mercati e dispositivi mobili reali.

Questi limiti sono stati cercati nell'UI disponibile, nel codice e nei test indicati. Il piano omaggio e lo stato già configurato non espongono tutti gli stati commerciali. La variabilità dello stato ha impedito di attribuire con sicurezza le scritture concorrenti, quindi i test con salvataggi remoti non sono stati ripetuti.

## 11. Confronto con le ultime PR e controlli eseguiti

| PR | Oggetto | Riconferma di questo audit |
| --- | --- | --- |
| [#612](https://github.com/max23468/CF-Ready/pull/612), `cf66a2a` | Simulatore, Messaggi, Guida e onboarding | Scenari, esiti, focus, anteprime, salti e quattro passi percorsi live |
| [#613](https://github.com/max23468/CF-Ready/pull/613), `2e6e10f` | Versione del commit promosso | Receipt, package e diagnostica live coincidono su `1.15.22` |
| [#614](https://github.com/max23468/CF-Ready/pull/614), `f82c64e` | Check-in dopo conferma Shopify | Home stabile live; casi rapidi/lenti/falliti riconfermati localmente |
| [#615](https://github.com/max23468/CF-Ready/pull/615), `614027c` | Sette rilievi frontend | Revisione del diff e nuove prove live; i flussi di scrittura restano fuori dalla riconferma |
| [#616](https://github.com/max23468/CF-Ready/pull/616), `ca11b2d` | Stati nascosti e rilievi Chrome | Suite WebKit su sette file verde; diagnosi e arrivo simulatore confermati in Safari |
| [#617](https://github.com/max23468/CF-Ready/pull/617), `4128401` | Promozione `1.15.22` | Identità Production verificata |

`npm run test:ui -- --project=merchant-webkit-critical`: **7 file, 73 test passati**. Include `route-surfaces`, `home-route`, `guide-route`, `messages-route`, `onboarding-route`, `rules-route` e `visual-surfaces`. Il runner ha emesso avvisi React su script e `act`, senza fallimenti. Non sono stati alterati test o fixture.

`npm run check:docs`: **passato**, 54 test e 94 documenti verificati. Controllati anche tutti i collegamenti locali del nuovo rapporto: nessun riferimento mancante. Le 49 schermate locali sono state eliminate il 3 ottobre 2026 su richiesta dell’owner prima della pubblicazione; restano i due readback testuali sanificati. I riferimenti alle schermate descrivono osservazioni storiche e non costituiscono allegati disponibili. Gate standard/full, coverage e mutation non richiesti per questo diff e non eseguiti come parte dell'audit. Nessuna scansione di produzione o misura di prestazioni è stata dedotta dal semplice esito verde dei test.

## 12. Ripristino e lavoro successivo

Bozze Regole e Messaggi rimosse; simulatore svuotato; finestre annullate. Readback finale: validazione attiva, Codice Fiscale obbligatorio, PEC facoltativa e validata, messaggi predefiniti, piano omaggio permanente, etichette aggiornate. Non sono stati salvati regole, messaggi, Campo Interno o gestione etichette.

Checkout riportato in italiano: nome, cognome, indirizzo, CAP, città e nome sulla carta vuoti; Codice Fiscale e PEC riletti vuoti; provincia ripristinata a Milano; fatturazione uguale alla spedizione. Nessun contatto o pagamento inserito. Articolo temporaneo rimosso e carrello vuoto verificato. La rimozione del carrello non dimostra la cancellazione di ogni eventuale record anonimo di checkout conservato da Shopify.

La sessione è stata interrotta dal blocco del Mac e ripresa dopo lo sblocco dell'owner. Durante la ripresa Safari è stato anche modificato esternamente: schede e dimensioni erano già cambiate. È stata chiusa la scheda shopper creata per il test; è stata lasciata la Home Production nelle dimensioni correnti, senza ricreare o chiudere schede che nel frattempo erano state gestite dall'utente.

«Aggiorna e verifica», letture e navigazioni possono lasciare timestamp diagnostici e telemetria operativa. Non è stato tentato un rollback del database o delle modifiche non attribuite: avrebbe potuto cancellare lavoro concorrente.

Le correzioni di S-A1 e S-P1 sono implementate in locale come descritto nella sezione 13. Per chiudere anche la riconferma live dei flussi di scrittura serve una sessione di prova senza modifiche concorrenti; i precedenti bug non sono dichiarati riaperti o risolti da questa osservazione.

## 13. Correzioni locali dei due rilievi

Su richiesta dell'owner, S-A1 e S-P1 sono stati corretti senza commit, push, PR o deploy. I risultati delle sezioni precedenti descrivono la release Production osservata; le correzioni non sono ancora live.

- **S-A1:** il contenitore condiviso del simulatore dichiara `lang={previewLocale}`. Il test WebKit esistente verifica italiano → inglese → italiano, insieme al cambio dei testi visibili.
- **S-P1:** la 404 mostra una sola lingua: inglese sotto `/en` e `/en/`, italiano sugli altri percorsi. Cambiano insieme lingua del documento, titolo, descrizione, navigazione, testo, footer e collegamenti di recupero. Senza JavaScript resta il documento inglese di fallback. Il selettore è nel modulo pubblico esistente e si applica soltanto alla 404.

Le spaziature riusano lo stile del sito: 32 px tra descrizione e azioni, senza duplicare blocchi italiani e inglesi. La 404 occupa almeno l'altezza della finestra, con contenuto centrato e footer in fondo: nessuno spazio bianco dopo la fascia verde. Il CSS si applica soltanto alla pagina marcata `data-not-found`. Screenshot locali esaminati a 390 × 844 e 1440 × 900 px, in entrambe le lingue: nessun overflow orizzontale o errore runtime rilevante. Il bordo inferiore del footer coincide con il fondo della pagina in tutte e quattro le varianti.

Il test del simulatore e quello della 404 hanno fallito prima dei fix; anche la regressione sul footer ha riprodotto il difetto prima del CSS. Dopo i fix, il test mirato del simulatore passa e i quattro E2E WebKit della 404 passano: IT/EN e fallback senza JavaScript, su finestra stretta e larga. I test della 404 servono il documento reale all'URL mancante tramite intercettazione locale, perché Vite non riproduce il fallback Pages; non dimostrano un nuovo readback Production.

Il gate completo `npm run check` è passato. La coverage di app, UI e Function è stata raccolta, poi sono stati rieseguiti i test operations e l'aggregazione dopo aver aggiornato le fixture dei metadati: tutti i gate sono verdi, con coverage righe del 98,59%. Il diff non seleziona domini di mutation.
