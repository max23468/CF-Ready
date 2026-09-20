# Outreach opzionale — Controlled Launch

Questo runbook conserva materiale opzionale per un'eventuale attività futura.
Non è un requisito o un gate di M11 e non autorizza messaggi, email, post,
advertising o modifiche alla listing: si usa soltanto su una nuova richiesta
esplicita dell'owner e ogni contatto viene scelto e inviato dall'owner.

## Target iniziale

Contattare soltanto soggetti per cui il problema è plausibile e attuale:

1. merchant Shopify con checkout italiano che chiedono Codice Fiscale e/o PEC;
2. agenzie e freelance che gestiscono store Shopify italiani;
3. merchant che hanno già espresso pubblicamente un problema con i localized
   fields italiani, senza trasformare una richiesta di assistenza in spam.

Escludere chi cerca Partita IVA, SDI, fatturazione elettronica, POS o modifiche
al tema: CF Ready 1.0 non copre questi casi. Non promettere validazione
anagrafica, appartenenza del Codice Fiscale o verifica dell'esistenza di una PEC.

La [community italiana Shopify](https://community.shopify.com/c/it/16?page=1)
ha discussioni recenti sui campi fiscali al checkout. È una fonte per capire il
linguaggio e i problemi dei merchant, non una mailing list. Le indicazioni
Shopify sull'acquisizione suggeriscono inoltre di considerare agenzie,
freelance e team tecnici che consigliano le app ai merchant e di puntare su
contenuti che risolvono un problema preciso:
[guida alla crescita organica](https://www.shopify.com/partners/blog/shopify-app-store-downloads).

## Sequenza controllata

1. Selezionare cinque contatti già pertinenti, privilegiando relazioni esistenti
   o richieste pubbliche recenti.
2. Inviare un solo messaggio personale per contatto. Dichiarare subito che
   Matteo è il creatore di CF Ready.
3. Registrare soltanto canale, data, categoria del contatto e stato
   `da contattare`, `inviato`, `risposto`, `installato`, `non interessato`.
   Niente contenuto delle conversazioni, dati fiscali o dati cliente nel repo.
4. Nessun sollecito senza un segnale di interesse. Se richiesto, offrire una
   breve assistenza all'installazione senza accedere a ordini o dati cliente.
5. Dopo cinque contatti, fermarsi e valutare risposte, installazioni,
   completamento onboarding e Validation abilitate prima di ampliare il gruppo.

## Messaggio per un merchant

> Ciao [nome], ho visto il problema che hai segnalato con Codice Fiscale e PEC
> nel checkout Shopify. Sono Matteo e ho creato CF Ready proprio per rendere
> questi campi facoltativi oppure obbligatori e controllarne il formato prima
> che l'ordine venga completato. Se ti va di provarla, ti mando volentieri la
> pagina dell'app e resto disponibile per la configurazione.

## Messaggio per agenzia o freelance

> Ciao [nome], sono Matteo e ho sviluppato CF Ready, un'app Shopify per gestire
> Codice Fiscale e PEC nei campi italiani del checkout. Ogni campo può essere
> disattivato, facoltativo oppure obbligatorio. Se tra i vostri clienti c'è uno
> store con questa esigenza, posso mandarvi la pagina dell'app e seguire io la
> prima configurazione.

## Risposta pubblica

Da usare solo quando risponde davvero alla domanda, adattandola al contesto:

> Ciao, sono Matteo e ho creato CF Ready proprio per questo problema. Permette
> di impostare Codice Fiscale e PEC come facoltativi oppure obbligatori e ne
> controlla il formato direttamente nel checkout. Se sei su Shopify Community
> puoi cercare CF Ready nell'App Store; se vuoi ti aiuto anche a capire come
> configurarla per il tuo caso.

Su Shopify Community citare il nome dell'app senza inserire il link. Su altri
forum aggiungere il link soltanto se è utile alla risposta e consentito dalle
regole della community. I testi vanno adattati alla domanda: niente invii
automatici e nessuna pubblicazione senza approvazione dell'owner.

## Feedback dei primi merchant

Chiedere dopo uso reale, senza sollecitare recensioni positive:

- qual era il problema concreto prima dell'installazione;
- quale passaggio dell'onboarding ha richiesto più tempo;
- se il comportamento al checkout era quello atteso;
- quale limite non era chiaro prima dell'installazione;
- se continuerebbero a usare l'app e perché.

Annotare nel repository solo sintesi anonime e decisioni di prodotto. Una
recensione App Store va chiesta esclusivamente attraverso il prompt nativo già
governato da FR-093, quando i requisiti temporali e tecnici sono soddisfatti.

## Registro merchant installati

Questo registro è un prospetto operativo manuale, non una fonte autorevole sullo
stato Shopify. Prima di usarlo per decidere un contatto, aggiornare i dati con:

1. riconciliazione Partner recente per installazioni e disinstallazioni;
2. readback Production per onboarding, Validation, prova, piano ed errori;
3. verifica in Mail degli invii e delle risposte già ricevute.

Non registrare indirizzi email, nomi degli owner, contenuto integrale dei messaggi
o altri dati personali. Escludere gli store disinstallati e quelli che l'owner ha
deciso di non contattare. Nessuna riga autorizza automaticamente un invio.

**Ultimo aggiornamento:** 20 settembre 2026. Partner riconciliato alle 15:16
(Europe/Rome); Mail verificata nello stesso aggiornamento. Numismatica Leonessa
è esclusa per decisione dell'owner; due store disinstallati non sono riportati.

| Store | Installazione e uso | Piano | Mail | Prossima azione |
| --- | --- | --- | --- | --- |
| Jackobs Beauty Pet Salon | 27 agosto; Validation attiva; onboarding fermo al passaggio 4 | Launch mensile attivo | Inviata il 5 settembre; nessuna risposta | Non ricontattare senza un nuovo segnale |
| Franklin & Marshall | 1 settembre; onboarding completato; Validation attiva | Launch annuale attivo | Inviata il 5 settembre; nessuna risposta; prompt nativo recensione riuscito il 16 settembre | Nessuna nuova richiesta |
| WillardLtd | 4 settembre; onboarding non iniziato; Validation non attiva | Nessuno | Inviata il 5 settembre; nessuna risposta | Non contattare: zero esecuzioni nella finestra disponibile |
| Francesa SNC | 4 settembre; onboarding completato; Validation attiva | Launch annuale attivo | Ha risposto il 7 settembre; problema risolto e funzionamento confermato | Conversazione conclusa; nessun nuovo contatto |
| Portamicontè | 4 settembre; onboarding completato; Validation attiva | Launch, pagamento unico attivo | Risposte positive il 7 e 9 settembre; recensione già menzionata nella risposta del 9 settembre | Nessun nuovo contatto |
| ByMaggie | 10 settembre; onboarding completato; Validation attiva | Prova attiva fino al 23 settembre; nessun piano attivo | Mai contattato | Candidato per un primo messaggio |
| Storie di Gonne | 15 settembre; onboarding al passaggio 4; Validation non attiva | Nessuno | Mai contattato | Non contattare: zero esecuzioni nella finestra disponibile |
| DREAMIS | 15 settembre; onboarding non iniziato; Validation non attiva | Nessuno | Mai contattato | Non contattare: zero esecuzioni nella finestra disponibile |
| ERAORA - ROMA | 16 settembre; onboarding completato; Validation attiva | Prova attiva fino al 29 settembre; nessun piano attivo | Mai contattato | Rivalutare dal 23 settembre |
| Cinesud | 16 settembre; onboarding completato; Validation attiva | Launch mensile attivo | Mai contattato | Rivalutare dal 23 settembre |
| THE GLOBAL STORE | 19 settembre; onboarding al passaggio 4; Validation non attiva | Nessuno | Mai contattato | Non contattare: zero esecuzioni nella finestra disponibile |

### Esecuzioni della Function

Rilevazione una tantum conclusa il 20 settembre 2026 alle 15:40
(Europe/Rome) dal Dev Dashboard Shopify, filtro `Ultimi 7 giorni` e dettaglio
per negozio. Shopify rende disponibili in questa vista soltanto `Ultimo giorno`
e `Ultimi 7 giorni`.

Il dato conta le esecuzioni della Cart and Checkout Validation Function, non i
checkout unici né gli ordini: lo stesso checkout può eseguire la Function più
volte. Tutte le esecuzioni osservate sono riuscite e la Dashboard riporta zero
errori. Poiché il 20 settembre era ancora in corso e gli store sono stati letti
in sequenza, i totali sono gli snapshot esatti delle singole letture ma non una
fotografia atomica dell'intero parco merchant.

| Store | Esecuzioni riuscite osservate | Errori | Evidenza |
| --- | ---: | ---: | --- |
| Jackobs Beauty Pet Salon | 356 | 0 | Presente nel filtro Shopify |
| Franklin & Marshall | 1.175 | 0 | Presente nel filtro Shopify |
| WillardLtd | 0 | 0 | Assente dal filtro; Validation non attiva |
| Francesa SNC | 3.322 | 0 | Presente nel filtro Shopify |
| Portamicontè | 236 | 0 | Presente nel filtro Shopify |
| ByMaggie | 147 | 0 | Presente nel filtro Shopify |
| Storie di Gonne | 0 | 0 | Assente dal filtro; Validation non attiva |
| DREAMIS | 0 | 0 | Assente dal filtro; Validation non attiva |
| ERAORA - ROMA | 265 | 0 | Presente nel filtro Shopify |
| Cinesud | 15.433 | 0 | Presente nel filtro Shopify |
| THE GLOBAL STORE | 0 | 0 | Assente dal filtro; Validation non attiva |

Numismatica Leonessa, esclusa dall'outreach per decisione dell'owner, compare
nel monitoraggio tecnico con 5.598 esecuzioni riuscite e zero errori nella
stessa finestra.

Per decisione dell'owner, non contattare gli store con zero esecuzioni nella
finestra disponibile. Rivalutarli soltanto dopo una nuova rilevazione che mostri
uso reale della Function; l'onboarding o la sola installazione non bastano.

Quando cambia uno stato, sostituire la riga corrente invece di aggiungere una
cronologia. Le conversazioni che producono una decisione di prodotto vanno
sintetizzate separatamente nella fonte canonica pertinente, senza dati merchant.

## Metriche e stop condition

Per ogni gruppo di cinque contatti, confrontare il conteggio manuale del funnel
`inviato → risposta → installazione` con il report D1:

```sh
npm run report:launch -- production
```

Fermare l'espansione e correggere prima il prodotto se compare un errore critico,
un webhook fallito non riconciliato, un bypass della Validation su un checkout
italiano idoneo o un limite di prodotto presentato in modo ambiguo. L'assenza di
risposte non è un difetto tecnico: richiede revisione umana di target e messaggio.
