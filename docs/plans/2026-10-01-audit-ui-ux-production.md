# Audit UI/UX di CF Ready Production su Numisleo

**Stato:** audit concluso, nessuna correzione avviata
**Data:** 30 settembre e 1 ottobre 2026
**Ambiente:** Production, `numisleo.myshopify.com`, app `cf-ready` servita da
`app.cfready.it`
**Strumento:** Chrome con la sessione Admin esistente, a 1054, 1200 e 1440 px
di larghezza, più 390 px emulati e 500 px reali

## 1. Metodo

L'audit si è svolto in tre giri, seguiti dal completamento in inglese del
1 ottobre (sezione 12).

1. Sola osservazione con la scheda nascosta: screenshot ottenuti allungando
   l'iframe dal documento Admin, a desktop e a 390 px emulati.
2. Interazioni senza scritture: FAQ, pannelli, simulatore, focus da tastiera,
   hover, finestra a 500 px.
3. Salvataggi autorizzati dall'owner, con ripristino finale: messaggi, regole,
   campo Interno, gestione etichette, cronologia, disattivazione,
   onboarding completo, diagnostica.

Durante l'audit sono state promosse in Production quattro release. Ogni
finding vale per la versione del giro in cui è stato osservato:

| Giro | Orario | Versione Production |
| --- | --- | --- |
| Verifica di accesso | 30 set 2026, 07:21 UTC | `1.15.13` |
| Giro 1 | 30 set 2026, dalle 11:14 UTC | `1.15.15` (promossa alle 08:19 UTC) |
| Giri 2 e 3 | 1 ott 2026, 06:12-06:50 UTC | `1.15.15` |
| Completamento in inglese | 1 ott 2026, dalle 09:00 UTC circa | `1.15.17` (promossa alle 08:53 UTC) |

Il confronto tra findings e PR unite fino alla `1.15.17` è nella sezione 13.

Severità: **Alta** blocca o confonde un flusso con effetti sul checkout;
**Media** degrada chiarezza o coerenza in modo evidente; **Bassa** è rifinitura.
La confidenza indica quanto il problema è dimostrato dalle prove raccolte.

## 2. Priorità

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| R-H1 | "Ripristina questa configurazione" scrive subito su Shopify, senza conferma | Alta | Alta |
| R-H2 | Dopo il ripristino il modulo mostra la bozza vecchia e "Modifiche non salvate" | Alta | Alta |
| R-H3 | Falso conflitto etichette al secondo salvataggio nella stessa sessione | Alta | Alta |
| R-H4 | Ogni cambio di regola azzera la conferma manuale e il contatore include lingue non visibili | Alta | Alta |
| R-H5 | Dopo un cambio di regola l'etichetta live resta incoerente e la correzione richiede nove passaggi | Media | Alta |
| G-B1 | La diagnostica mostra valori interni non tradotti | Media | Alta |
| R-B2 | "Dettagli tecnici" senza margine interno (risolto da #603, sezione 13) | Media | Alta |
| G-B2 | I chip di salto nascondono il titolo della sezione di arrivo (in parte risolto da #603, sezione 13) | Media | Alta |

## 3. Problemi trasversali

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| T1 | Struttura di pagina incoerente: Home e Messaggi 2/3 + 1/3, Regole 1/2 + 1/2, onboarding a tutta larghezza | Media | Alta |
| T2 | Azione primaria in due colori: nero Polaris ("Modifica regole", "Richiedi assistenza", "Continua" dell'onboarding) e verde di brand ("Continua" del simulatore) | Media | Alta |
| T3 | Due stili di elemento richiudibile: triangolo nativo (FAQ, "Quando si applicano", "Opzioni avanzate") e bottone con chevron ("Campo Interno", "Testi del checkout") | Media | Alta |
| T4 | Distanza titolo-testo incoerente: circa 36 px sotto "Validazione attiva nel checkout", "Benvenuto in CF Ready", "Da verificare nel checkout"; circa 28 px nelle card laterali | Media | Media |
| T5 | Badge di stato tutti grigi ("Obbligatorio e validato", "Predefiniti", "Previsto", "Non previsto"): lo stato non si distingue a colpo d'occhio | Media | Alta |
| T6 | Logo usato in tre modi: sciolto sotto le card in Home, dentro una card in Guida, in testa all'onboarding | Bassa | Alta |
| T7 | Maiuscole incoerenti: "Codice Fiscale" nell'app, "Codice fiscale" nel simulatore e come etichetta Shopify, senza spiegare la differenza | Bassa | Media |
| T8 | Etichette di campo incoerenti: "Scegli l'argomento:" con i due punti, "Lingua" e "Lingua dei messaggi" senza | Bassa | Alta |
| T9 | La stessa lingua ha due nomi: "English" in Messaggi, "Inglese" in Regole | Bassa | Alta |
| T10 | A capo anticipati con molto spazio libero ("le 11 cifre e / la cifra", "il controllo / sia disattivato", "Piano omaggio permanente attivo, / senza rinnovi."), parole sole a fine paragrafo ("valido.") e "UTC" da solo a capo. Probabile causa: spazi non separabili o `text-wrap: balance` | Bassa | Media |
| T11 | Orari mostrati in UTC invece che nel fuso dello store (sincronizzazione, rilettura, conferma manuale, cronologia) | Media | Alta |
| T12 | Concetti simili con nomi diversi: "Ultima sincronizzazione memorizzata" in Guida, "Ultima rilettura riuscita da Shopify" in Regole | Bassa | Media |
| T13 | I banner di esito ("Messaggi salvati.", "Regole salvate…") compaiono in cima alla pagina, fuori vista per chi salva dal fondo, e toccano la card sottostante | Media | Alta |
| T14 | Il focus da tastiera è visibile e l'ordine è logico, ma il link "Guida e FAQ" in Home evidenzia tutta la larghezza della card | Bassa | Alta |

## 4. Home

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| H1 | Nel riquadro informativo l'icona del segnaposto sta da sola su una riga sopra il testo; presente a tutte le larghezze | Media | Alta |
| H2 | Informazione sul piano duplicata: "Cosa include il piano" e "Piano"; su mobile le due card sono adiacenti | Media | Alta |
| H3 | "Disattiva nel checkout" è un bottone neutro e nella finestra di conferma l'azione è nera primaria invece che critica | Media | Alta |
| H4 | Da disattivata, "Attiva nel checkout" resta secondario mentre "Modifica regole" resta primario, anche se "Prossimo passo" invita ad attivare | Media | Alta |
| H5 | Da disattivata il testo dice "queste regole non valgono ancora", che non si adatta a uno store già attivo in passato | Bassa | Alta |
| H6 | Attivazione e disattivazione cambiano lo stato senza un messaggio di esito | Bassa | Media |
| H7 | "Prossimo passo" invita a controllare gli ordini senza offrire un collegamento | Bassa | Alta |
| H8 | Badge "Attiva" e titolo "Validazione attiva nel checkout" ripetono lo stesso concetto; il titolo ha il corpo del testo normale | Bassa | Media |
| H9 | Tra la verifica di accesso e il giro 1 la seconda card è passata da "Un solo pagamento" a "Cosa include il piano": è l'effetto della `1.15.14` (#599, "refine native app spacing and plan cards"), non un difetto | Informativo | Alta |

## 5. Regole checkout

### 5.1 Salvataggio, cronologia ed etichette

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| R-H1 | "Ripristina questa configurazione" non chiede conferma: al clic invia `restore_configuration`, che riscrive regole e messaggi su Shopify e, con `confirmAutomaticWrite: true`, anche le etichette (`app/features/rules/rules-action.server.ts`). Un clic accidentale cambia il checkout live | Alta | Alta |
| R-H2 | Dopo il ripristino la pagina mantiene la bozza precedente: i radio mostravano "Facoltativa e validata" con la barra "Modifiche non salvate", mentre la regola salvata era già "Obbligatoria quando il campo Azienda è compilato". Il banner "Regole salvate…" è comparso solo dopo "Rimuovi"; "Salva" avrebbe annullato il ripristino senza che il merchant lo capisse | Alta | Alta |
| R-H3 | Dopo un salvataggio riuscito, un secondo salvataggio nella stessa sessione fallisce con "Un'etichetta è cambiata dopo l'ultima lettura. Rileggi Shopify prima di decidere quale testo mantenere.", anche senza modifiche alle etichette. Si risolve con "Rileggi i campi da Shopify" o ricaricando: la revisione etichette lato client resta quella precedente al primo salvataggio | Alta | Alta |
| R-H4 | Un cambio di regola, anche annullato subito, azzera la conferma manuale del contesto inglese. Il badge diventa "Verifica manuale richiesta" con il testo "Un checkout richiede una verifica", ma il contesto mostrato (italiano) non ha nulla in sospeso: il conteggio include le lingue non visibili (`pendingContexts` su tutti i contesti in `NativeCheckoutLabels.tsx`) e per trovare il caso bisogna cambiare "Lingua" | Alta | Alta |
| R-H5 | Con gestione "Mista", dopo il passaggio a "Obbligatoria quando il campo Azienda è compilato" l'etichetta live resta "PEC (facoltativa)" e la pagina propone "PEC (obbligatoria per aziende)". Il banner "Le etichette richiedono attenzione" non dice dove guardare e la procedura manuale ha nove passaggi | Media | Alta |
| R-H6 | La card "Cronologia configurazioni" non c'era al primo caricamento e compare solo dopo un salvataggio; le voci mostrano un orario UTC e "Differenze: PEC" senza dire se l'orario è quello di creazione o di sostituzione | Media | Media |
| R-H7 | "Configurazione del campo Interno" salva appena cambia valore, senza barra di salvataggio né messaggio, e il salvataggio richiude il pannello: è un modello diverso dal resto della pagina | Media | Alta |
| R-H8 | Togliendo "Gestisci automaticamente le etichette supportate da Shopify" compare la barra di salvataggio ma nessuna spiegazione delle conseguenze | Media | Media |
| R-H9 | Durante la modifica la barra di salvataggio blocca correttamente la navigazione e "Rimuovi" ripristina la bozza | Positivo | Alta |

### 5.2 Layout e testi

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| R-B1 | "Prova uno scenario" sporge di circa 4-5 px a sinistra e a destra rispetto ai campi sopra; "Svuota" è circa 3 px più alto della select e grigio come un bottone disabilitato | Media | Alta |
| R-B2 | "Dettagli tecnici", aperto, non ha margine interno: "Modalità: Mista" e le righe sotto toccano il bordo sinistro e inferiore. Osservato in `1.15.15`, risolto da #603 | Media | Alta |
| R-B3 | Intestazione del simulatore ridondante ("simulazione checkout", "Checkout di prova", "Anteprima interattiva"); sotto i 1200 px il badge di stato si allinea al logo invece che al testo | Media | Alta |
| R-B4 | Testo con aspetto di dato grezzo: "primaria · Tutti i mercati usano questo testo · Controlla anche…", iniziale minuscola e frammenti uniti da puntini | Media | Alta |
| R-B5 | Stato contraddittorio: badge "Gestito da Shopify" e gestione automatica attiva, ma "Modalità: Mista" e "0 etichette gestite da Shopify"; l'onboarding dice "Alcune etichette sono gestite automaticamente" | Media | Media |
| R-B6 | Annidamento profondo in "Testi del checkout": card, pannello, "Dettagli tecnici" come pannello nel pannello, riquadro grigio, "Come completare la verifica manuale" | Media | Alta |
| R-B7 | Badge verde di successo per un esito neutro: "Nessuna etichetta fiscale rilevata" | Media | Media |
| R-B8 | Badge in posizioni diverse nelle due card annidate: sotto il titolo in "Campo Interno", in linea in "Testi del checkout" | Bassa | Alta |
| R-B9 | "Etichette del checkout" ha circa 28 px tra titolo e primo campo, le card "Codice Fiscale" e "PEC" circa 40 px | Bassa | Alta |
| R-B10 | "Etichette mostrate dopo il salvataggio delle regole" non chiarisce se il simulatore mostra lo stato salvato o la bozza | Bassa | Media |
| R-B11 | Tre selettori di lingua con ruoli simili: "Lingua" (Etichette), "Lingua dei messaggi", "Lingua dell'anteprima" | Bassa | Media |
| R-B12 | Su mobile il simulatore finisce in fondo, dopo tutte le opzioni | Bassa | Media |

### 5.3 Simulatore

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| R-S1 | L'esito ("Checkout bloccato") compare solo nel badge in cima al simulatore, fuori vista mentre si compilano i campi in basso | Media | Alta |
| R-S2 | Gli errori in linea allungano il blocco e spostano "Continua" sotto il puntatore: un clic è finito sulla select | Media | Alta |
| R-S3 | La validazione in linea per campo funziona e il simulatore non sporca il modulo delle regole | Positivo | Alta |

## 6. Messaggi al cliente

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| M1 | La card principale non ha titolo: si apre con un paragrafo grigio | Media | Alta |
| M2 | Il messaggio dell'anteprima si sceglie mettendo il focus su un campo, ma nessun testo lo spiega; l'anteprima non resta visibile mentre si modificano i campi in basso | Media | Alta |
| M3 | L'anteprima mostra anche "PEC obbligatoria" senza avvisare che con le regole attuali il messaggio è "Non previsto" | Media | Alta |
| M4 | Il contatore "50/200 caratteri" compare solo con il focus e sposta di circa 20 px i campi sottostanti | Bassa | Alta |
| M5 | Collegamenti duplicati: "Regole checkout" nel testo, "Apri Regole checkout" subito sotto, "Regole checkout" nella card laterale | Bassa | Alta |
| M6 | Il badge di lingua nell'anteprima ripete la select appena sopra | Bassa | Alta |
| M7 | Card laterale: righe irregolari ("Codice Fiscale obbligatorio" su due righe) e "Previsto" / "Non previsto" poco chiari senza leggere il paragrafo | Bassa | Alta |
| M8 | La finestra "Ripristina testi predefiniti" scrive "I quattro messaggi in English…" dentro una frase italiana | Bassa | Alta |
| M9 | Dopo un salvataggio la Home passa a "Personalizzati" e torna a "Predefiniti" dopo il ripristino: comportamento corretto | Positivo | Alta |

## 7. Guida e FAQ

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| G-B1 | La diagnostica di "Aggiorna e verifica" mostra valori interni: "Etichette del checkout: synced", "Campo "Interno": expected · pending"; usa il termine inglese "Validation"; i link sono neri e sottolineati invece che blu; gli esiti non hanno icone di stato | Media | Alta |
| G-B2 | I chip di salto scorrono troppo e nascondono il titolo della sezione di arrivo ("Assistenza" su desktop, "Il controllo non compare?" su mobile); il focus resta sul chip. Osservato in `1.15.15`; #603 rimuove i chip, ma il nuovo salto alla diagnosi non sposta il focus (sezione 13) | Media | Alta |
| G-B3 | I chip toccano il bordo superiore della card FAQ (circa 2 px). Osservato in `1.15.15`, risolto da #603 con la rimozione dei chip | Media | Alta |
| G-B4 | "Riproduci il caso nel simulatore" porta in cima a Regole checkout, senza scorrere al simulatore né precompilare il caso | Media | Alta |
| G-B5 | Troppo grassetto: titolo, titoli di sezione e tutte le domande; "Domande frequenti" è l'unico titolo grande dell'app | Media | Alta |
| G-B6 | Sulle domande su due righe la seconda riga parte sotto il triangolo, senza rientro | Bassa | Alta |
| G-B7 | Lo sfondo di hover e apertura delle FAQ sporge di qualche pixel oltre le linee divisorie | Bassa | Media |
| G-B8 | La FAQ su prova e pagamenti parla di 14 giorni e piani mensili anche a uno store con piano omaggio permanente | Bassa | Media |
| G-B9 | Nella card "Assistenza" la spiegazione arriva dopo i bottoni, impilati con larghezze diverse. Ancora presente in `1.15.17`, con un terzo bottone (sezione 13) | Bassa | Alta |
| G-B10 | "Copia diagnostica" mostra una conferma in linea chiara; "Espandi tutte" diventa "Comprimi tutte" | Positivo | Alta |

## 8. Onboarding

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| O1 | Card a tutta larghezza: righe oltre i 120 caratteri, select a tutta larghezza al passo 2 | Media | Alta |
| O2 | Al passo 3 il testo di ogni messaggio sta più vicino all'etichetta successiva che alla propria (circa 32 px sotto, 28 px sopra): i gruppi si leggono male | Media | Alta |
| O3 | Il passo 3 è solo testo: nessuna anteprima visiva né simulatore, a differenza di Regole | Bassa | Media |
| O4 | "Benvenuto in CF Ready" ha il corpo del testo normale, sotto un logo molto più grande | Bassa | Alta |
| O5 | L'avanzamento è solo testuale ("Passo 1 di 4") | Bassa | Media |
| O6 | Testi da primo avvio ("Configura CF Ready", "Benvenuto") anche per uno store configurato che arriva da "Rivedi la configurazione iniziale" | Bassa | Media |
| O7 | Il passo 2 mostra "I permessi per confrontare le etichette sono disponibili.", frase tecnica senza azione | Bassa | Media |
| O8 | Con regole invariate il percorso fino a "Torna alla Home" non scrive nulla e la Home resta coerente | Positivo | Alta |

## 9. Responsive

- A 390 px emulati e a 500 px reali tutte le pagine passano a una colonna,
  senza scorrimento orizzontale né testi tagliati.
- A 1440 px il contenuto ha una larghezza massima e resta centrato.
- I problemi specifici di larghezza sono già indicati nelle sezioni:
  H1, H2, R-B3, R-B12, G-B2, G-B6.

## 10. Stato dello store dopo i test

Regole, messaggi, campo Interno, gestione etichette, attivazione e
onboarding sono tornati ai valori iniziali, verificati con readback in Home e
nelle pagine. Restano queste tracce, non annullabili dall'interfaccia:

- **Cronologia configurazioni:** contiene nuove voci del 1 ottobre 2026 (06:27
  e 06:30 UTC circa) e la card ora è visibile.
- **Conferma manuale delle etichette inglesi:** porta la data del 1 ottobre
  2026 invece di quella precedente. L'ho ripristinata con "Conferma verifica
  manuale" dopo un readback che mostrava "Nessuna modifica", senza ripetere la
  verifica nel checkout reale.
- **Esposizione temporanea nel checkout live**, tra le 06:27 e le 06:50 UTC
  circa:
  - PEC "Obbligatoria quando il campo Azienda è compilato" per due finestre di
    uno o due minuti (salvataggio di prova e ripristino dalla cronologia);
  - validazione disattivata per circa 20 secondi;
  - messaggio inglese "PEC obbligatoria" con il suffisso " AUDIT" per circa due
    minuti, mai mostrato perché con le regole attive è "Non previsto".
- **Telemetria:** eventi di disattivazione e attivazione della validazione.
- **Appunti del Mac:** contengono la diagnostica copiata.

### Completamento del 1 ottobre in inglese

- **Profilo Shopify:** Italiano (`it`) ripristinato e verificato ricaricando
  la pagina del profilo; CF Ready riaperta con Home e navigazione in italiano.
  All'inizio la pagina mostrava English nella bozza, ma una ricarica ha
  restituito Italiano: il precedente cambio non era persistito. English è
  stato salvato e riletto prima del test. Durante il ripristino, la sola
  iniziale `i` ha selezionato Indonesia (Beta); dopo il clic su Save la
  selezione è stata corretta digitando `Italiano` per intero e salvando.
  La rilettura finale conferma `it`, con fuso Europe/Rome invariato.
- **Regole e attivazione:** nessun salvataggio di regole, messaggi o
  impostazioni dell'app e nessuna disattivazione. Home finale: Codice Fiscale
  obbligatorio e validato, PEC facoltativa e validata, messaggi predefiniti,
  validazione attiva e piano omaggio permanente. Onboarding percorso senza
  cambiare valori fino a `Return Home`.
- **Bozza di assistenza:** aperta una volta in Apple Mail, mai inviata.
  Dopo la richiesta di chiusura all'owner, l'owner ha incaricato l'agente di
  chiuderla. Chiusura con `Non salvare`, verificata dal ritorno alla finestra
  della posta in entrata. Nessuna bozza lasciata aperta.
- **Riletture operative:** la UI ha mostrato nuovi orari di lettura e
  sincronizzazione, fino alle 09:04 UTC circa. Non sono stati premuti
  `Refresh and check`, `Read fields again from Shopify` o conferme manuali.
  Le sole voci di cronologia mostrate restano quelle delle 06:27 e 06:30 UTC.
  Non è stato effettuato un confronto diretto del database remoto o della
  telemetria per attribuire eventuali aggiornamenti automatici dei loader.
- **Residui:** nessun ripristino manuale ancora da eseguire per questo giro.
  Il confronto inglese copre le viste osservate a 814 e 1200 px; non estende
  la prova responsive inglese a tutte le larghezze della sezione 9.

## 11. Non verificato

- **Tutti gli scenari del menu:** nel completamento inglese la select nativa
  è stata pilotata con focus, iniziali e Tab. Verificati `Invalid tax code`
  e `Valid details`; non ripetuta la matrice di tutte le opzioni del menu.
- **Tema scuro:** l'app non definisce regole `prefers-color-scheme` e l'Admin
  Shopify non offre un tema scuro per le app embedded.
- **Larghezza di 390 px reale:** Chrome non scende sotto 500 px di finestra.
- **Confronto con il codice locale:** il working tree ha modifiche non
  committate sugli stessi file nel giro originario; alcuni punti potrebbero
  essere già in lavorazione. Nel completamento era presente soltanto questo
  documento non tracciato e non è stata eseguita una nuova analisi del codice.

## 12. Interfaccia merchant in inglese e assistenza

Controllo su Chrome con la sessione esistente, app Production su Numisleo,
versione `1.15.17` riportata dalla diagnostica della richiesta di assistenza.
La lingua preferita del profilo è stata salvata in English e verificata con
una ricarica. `document.visibilityState` risultava `visible` ai controlli di
visibilità. Dopo la prova in Mail, Chrome è stato riportato in primo piano.
Screenshot e testi accessibili sono stati esaminati a 814 px, poi a 1200 px.

Percorso: Home, Checkout rules con Second address line, Checkout text,
Technical details, When rules apply e Advanced options aperti; simulatore;
Customer messages con focus sui campi; Help and FAQ con espansione delle
risposte; quattro passi dell'onboarding e `Return Home`. Non sono stati
salvati valori dell'app. I findings originari restano prove del loro giro:
le differenze qui sotto non dimostrano che dipendano dalla lingua anziché da
una versione diversa dell'interfaccia.

### 12.1 Findings e confronto con l'italiano

| ID | Risultato | Severità | Confidenza |
| --- | --- | --- | --- |
| EN1 | Le FAQ citano `Re-read fields from Shopify`, `Last successful re-read from Shopify` e `Checkout texts`, mentre Regole mostra `Read fields again from Shopify`, `Last successful read from Shopify` e `Checkout text`. L'istruzione richiede di riconoscere comandi con nomi diversi | Media | Alta |
| EN2 | Al passo 4, a 1200 px, `Italian tax code (Codice Fiscale)`, `Certified email address (PEC)` e `Second address line check` occupano due righe in una colonna stretta, con molto spazio libero a destra. Nessun taglio, ma il riepilogo inglese diventa più alto | Bassa | Alta |
| EN3 | Date leggibili in inglese, per esempio `1 Oct 2026, 06:30 UTC`, ma fuso ancora UTC per cronologia, rilettura e conferma manuale; conferma T11 anche con profilo Europe/Rome | Media | Alta |
| EN4 | La Home conserva l'icona del segnaposto su una riga propria (H1). Restano i colori diversi delle azioni primarie (T2), l'anteprima fuori vista con focus sui messaggi inferiori e il contatore che compare al focus (M2, M4), oltre al badge del simulatore fuori vista dal fondo (R-S1) | Media | Alta |
| EN5 | Nei testi merchant percorsi non sono emerse frasi italiane residue. `Codice Fiscale` è spiegato tra parentesi, le proposte IT/EN dell'onboarding sono esplicite e i nomi dei mercati `Internazionale, Italia, Unione Europea` sono dati dello store. La cornice Shopify e Sidekick conservano temporaneamente testi nella lingua precedente dopo il cambio; è distinta dai contenuti CF Ready | Positivo | Alta |
| EN6 | Bottoni e badge si adattano ai testi inglesi senza troncamenti nelle viste osservate. Gli errori lunghi del simulatore vanno a capo restando nel riquadro. `Invalid tax code` produce `Checkout blocked`; `Valid details` produce `Checkout ready`. La select scenari è utilizzabile digitando le iniziali | Positivo | Alta |
| EN7 | `Technical details` ha ora margine interno, a differenza di R-B2; `Mixed` è un badge azzurro e `Managed by Shopify` verde. Il titolo di Support resta visibile e il salto `Is the check missing?` mostra il titolo di arrivo. La spiegazione dell'apertura del programma di posta precede i bottoni, a differenza di G-B9. Le vecchie chip di salto della Guida non sono presenti nella vista osservata | Positivo | Alta |
| EN8 | Onboarding interamente in inglese fino a `Return Home`, con regole invariate e Home coerente. Restano l'avanzamento solo testuale (O5), il linguaggio da primo avvio (O6) e la frase tecnica sui permessi (O7). La struttura ampia e il riepilogo testuale restano quelli già segnalati in O1 e O3 | Positivo | Alta |

La prova inglese non ha ripetuto salvataggi, ripristini, disattivazione,
conferme manuali o diagnostica: non riconferma i finding che dipendono da
quelle azioni. Non sono emersi nuovi blocchi del percorso autorizzato.

### 12.2 Risultato di "Richiedi assistenza"

Premuto una sola volta il corrispondente inglese `Get support`, con argomento
`Checkout and rules`. Ha aperto **Apple Mail** con:

- destinatario: `supporto@cfready.it`;
- oggetto: `CF Ready support: Checkout and rules`;
- corpo: due righe iniziali vuote, seguite dalla diagnostica sotto riportata.

Il corpo visibile in Mail coincideva con il `mailto:` della UI. Nessuna
credenziale, token o valore fiscale del cliente nel corpo osservato. Mittente
personale escluso dalla registrazione dell'audit. La bozza non è stata inviata
ed è stata chiusa senza salvarla su incarico dell'owner.

```text
--- Technical details, you can delete them ---
Store: numisleo.myshopify.com
App version: 1.15.17
Language: en
Entitlement type: complimentary
Check active at checkout: yes
Configuration schema version: 3
Configuration hash: cdffb85121b640d2ab912761eea6491b14ed5a68147e39e898347a415b4a01ef
State revision: 452
Last synchronization: 2026-10-01T09:00:54.615Z
checkout_labels_enabled=yes
checkout_labels_mode=partial
checkout_labels_status=synced
address2_classification=expected
address2_decision=pending
address2_market_override=no
locales=en,it
market_count=3
last_label_sync=2026-10-01T09:01:43.412Z
Diagnostic ID: 4cc73f33-d6ed-4eb3-919a-64cf9a2091c8
```

## 13. Stato rispetto alle PR fino alla `1.15.17`

Confronto fatto sui diff di `origin/develop` dopo `git fetch`, il 1 ottobre
2026. Dalla `1.15.13` sono state unite #599, #601, #603, #604 e #606, più le
promozioni #600, #602, #605 e #607. Non risultano PR successive alla `1.15.17`.

- **#599 e #601** (spaziatura nativa, card del piano, contenitore responsive
  della Home) erano già in Production durante i giri 1-3: i findings su Home
  le includono.
- **#604** aggiorna solo lo schema della Function e **#606** solo un test
  visuale: nessun effetto sui findings.
- **#603** è l'unica PR successiva ai giri 1-3 con effetti sull'interfaccia.

| Finding | Effetto di #603 | Stato |
| --- | --- | --- |
| R-B2 | Il contenuto di "Dettagli tecnici" è avvolto in `checkout-labels-disclosure__body` e separa modalità, ultima rilettura e riepilogo | Risolto nel codice, confermato da EN7 |
| G-B3 | I chip sopra la card FAQ sono stati rimossi | Risolto |
| G-B2 | Il chip "Assistenza" non c'è più; il salto alla diagnosi è ora un bottone nel box Assistenza, ancora con il solo `scrollIntoView` | In parte risolto: il focus da tastiera resta sul bottone e non passa alla sezione di arrivo |
| G-B9 | La nota "Il messaggio contiene dominio…" resta dopo i bottoni; i bottoni impilati diventano tre | Non risolto. EN7 lo dava per risolto, ma il codice lo smentisce: il testo che precede i bottoni c'era già prima |
| T3 | I `summary` del simulatore ricevono `cursor: pointer`; i triangoli nativi restano | In parte risolto |
| Simulatore, "Quando si applicano" | Aggiunto spazio tra titolo e testo dell'apertura | Miglioramento non elencato in precedenza |

Nuovo finding introdotto da #603:

| ID | Problema | Severità | Confidenza |
| --- | --- | --- | --- |
| G-N1 | Nel box Assistenza il bottone "Il controllo non compare?" sta tra il testo introduttivo e la select "Scegli l'argomento", che serve a "Richiedi assistenza": il bottone interrompe il flusso testo, argomento, invio. I bottoni impilati diventano tre, con larghezze diverse | Bassa | Alta |

Restano invariati, perché nessuna PR tocca i file coinvolti
(`rules-action.server.ts`, `app.rules.tsx`, `app.messages.tsx`, i testi in
`app/i18n`, la diagnostica e l'onboarding): R-H1, R-H2, R-H3, R-H4, R-H5,
R-H6, R-H7, R-H8, G-B1 e tutti gli altri findings delle sezioni 3-8 e 12.
L'unica eccezione sono gli elementi elencati sopra. Lo stato "risolto" è
dedotto dal diff e, per R-B2 e G-B3, dall'osservazione di EN7: non c'è stato un
nuovo giro in italiano sulla `1.15.17`.

## 14. Stato di implementazione

Branch `fix/ui-trasversali-audit`, versione `1.15.18`, non ancora pubblicata.
Decisioni dell'owner del 1 ottobre 2026. Gate locale `npm run check` verde;
coverage e mutation rimandati alla pubblicazione.

| Finding | Stato | Implementazione |
| --- | --- | --- |
| T1, T2, T6 | Escluso dall'owner | Nessuna modifica |
| T3 | Implementato | Freccia condivisa `.cf-disclosure` per FAQ e simulatore, al posto del triangolo del browser |
| T4 | Implementato | Titolo e testo raggruppati con spazio piccolo in Home, onboarding e "Da verificare nel checkout" |
| T5 | Implementato | "Previsto" verde, "Non previsto" grigio; in Home campi controllati e messaggi personalizzati azzurri, casi non gestiti e predefiniti grigi |
| T7 | Implementato | Etichette reali di Shopify tra virgolette («…» in italiano, “…” in inglese) in Messaggi e Regole |
| T8 | Implementato | Tolti i due punti da "Scegli l'argomento" |
| T9 | Implementato | Nomi delle lingue nella lingua dell'interfaccia; risolve anche M8 |
| T10 | Chiuso senza modifiche | Comportamento nativo di Polaris (`text-wrap: pretty`) |
| T11 | Implementato | Orari nel fuso dello store con sigla; fuso salvato in `shops.iana_timezone` (migrazione 0027, D-173); diagnostica copiabile in UTC |
| T12 | Implementato | "Ultima verifica di regole e attivazione" e "Ultima lettura delle etichette da Shopify"; risolve anche EN1 |
| T13 | Implementato | Toast di App Bridge per gli esiti positivi; avvisi ed errori come banner che si portano in vista |
| T14 | Implementato | Il focus dei link nelle card si limita al testo |
| H1 | Implementato | Icona e testo del riquadro informativo in griglia, sulla stessa riga |
| H2, H9 | Escluso dall'owner | Nessuna modifica |
| H3 | Implementato | Tono critico per "Disattiva nel checkout" e per la conferma |
| H4 | Implementato | Da disattivata, con diritto attivo, "Attiva nel checkout" è primario |
| H5 | Implementato | Tolto "ancora" dal testo da disattivata, in italiano e in inglese |
| H6 | Implementato | Toast "Validazione attivata nel checkout." e "Validazione disattivata." |
| H7 | Implementato | Link "Apri gli ordini" verso la pagina Ordini dell'Admin quando la validazione è attiva |
| H8 | Implementato | Titolo di sezione fisso "Validazione nel checkout"; lo stato è nel badge e il piano scaduto aggiunge una frase |
| R-H1, R-H2, R-H6 | Superato da D-174 | Tolte la card "Cronologia configurazioni" e l'azione `restore_configuration`; `configuration_history` conserva solo l'ultima configurazione per il primo paint della Home (D-167) |
| R-H3 | Implementato | Su `checkout_labels_conflict` al salvataggio l'app rilegge le etichette (`useDeferredCheckoutLabels`), conserva la bozza e chiede di premere di nuovo "Salva". Causa (readback Shopify non ancora stabile) non confermata |
| R-H4 (a) | Implementato | Il riepilogo nomina la lingua ("Un checkout in inglese richiede una verifica") e "Lingua" si posiziona sulla prima lingua in sospeso finché il merchant non sceglie |
| R-H4 (b) | Non riprodotto in locale | Test D1 (`tests/checkout-labels.test.ts`): conferma, cambio di regola e ritorno conservano la conferma. Codice invariato in attesa della riproduzione su `cf-ready-dev` |
| R-H5 | Implementato | Pulsante "Mostra le etichette" nel banner, che apre "Testi del checkout" e lo porta in vista; i passaggi manuali restano |
| R-H7 | Implementato | Salvataggio immediato invariato; durante la rilettura le etichette restano visibili, quindi il pannello non si richiude, e compare il toast "Configurazione del campo Interno salvata." |
| R-H8 | Implementato | Togliendo la gestione automatica compare l'avviso sulle conseguenze del salvataggio |
| R-B1 | Implementato | Piede del simulatore con lo stesso margine del corpo: a 390 px la riga scenario non sporge più; "Svuota" è un `s-button` alto come la select |
| R-B2 | Già risolto da #603 | Nessuna modifica |
| R-B3 | Implementato | Intestazione ridotta a "Checkout di prova"; il badge di stato sta nella colonna del titolo anche sotto i 420 px di contenitore |
| R-B4 | Implementato | Note dei contesti come frasi separate con iniziale maiuscola ("Lingua primaria.", "Tutti i mercati usano questo testo.") |
| R-B5 | Implementato | Badge "Aggiornati" ("Gestiti da te" se il merchant mantiene i suoi testi) al posto di "Gestito da Shopify"; il conteggio somma le etichette di tutte le lingue: "1 etichetta aggiornata automaticamente" |
| R-B6 | Implementato | Tolto il pannello annidato "Dettagli tecnici": modalità, ultima lettura e conteggi sono righe in fondo, accanto a "Rileggi i campi da Shopify" |
| R-B7 | Implementato | "Nessuna etichetta fiscale rilevata" con badge neutro |
| R-B8 | Implementato | Titolo e badge in una griglia comune: il badge resta accanto al titolo, va a capo il titolo (verificato fino a 320 px) |
| R-B9 | Implementato | Card Codice Fiscale e PEC con il titolo nativo di `s-section`: 44 px tra bordo e primo campo come in "Etichette del checkout" |
| R-B10 | Implementato | "Le etichette seguono le regole selezionate qui; nel checkout cambiano dopo il salvataggio." |
| R-B11 | Implementato | "Lingua" diventa "Lingua delle etichette"; "Lingua dei messaggi" e "Lingua dell'anteprima" restano |
| R-B12 | Escluso dall'owner | Nessuna modifica |
