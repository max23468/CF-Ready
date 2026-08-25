# Outreach M11 — Controlled Launch

Questo runbook prepara il lavoro umano del Controlled Launch. Non autorizza
messaggi, email, post, advertising o modifiche alla listing: ogni contatto viene
scelto e inviato dall'owner.

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

> Ciao [nome], sono Matteo, il creatore di CF Ready. Ho visto che per il tuo
> store Shopify italiano ti serve rendere facoltativi o obbligatori Codice
> Fiscale e PEC nei campi locali del checkout. L'app fa una validazione formale
> di questi due campi e lascia separate configurazione e attivazione. Non
> gestisce Partita IVA, SDI o fatturazione elettronica. Sto seguendo un piccolo
> gruppo iniziale di merchant: se il caso coincide con il tuo, ti mando
> volentieri la listing e resto disponibile durante la configurazione. Nessun
> problema se non è una priorità.

## Messaggio per agenzia o freelance

> Ciao [nome], sono Matteo, sviluppatore di CF Ready. È una public app Shopify
> focalizzata sui localized fields italiani: Codice Fiscale e PEC, ciascuno
> disattivabile, facoltativo o obbligatorio. La validazione è formale e
> fail-open sugli errori dell'app; non copre Partita IVA, SDI o fatturazione
> elettronica. Sto cercando pochi casi reali per il Controlled Launch. Se segui
> uno store italiano con questa esigenza, posso condividere listing, limiti e
> assistenza iniziale; non chiedo accesso a ordini o dati cliente.

## Risposta pubblica trasparente

Da usare solo quando risponde davvero alla domanda, adattandola al contesto:

> Dichiarazione: sono lo sviluppatore di CF Ready. Per il solo caso Codice
> Fiscale/PEC nei localized fields italiani, l'app consente di impostare ogni
> campo come disattivato, facoltativo o obbligatorio e applica una validazione
> formale al checkout. Non risolve Partita IVA, SDI o fatturazione elettronica e
> non verifica che il dato appartenga davvero alla persona. Se può essere utile,
> posso indicare la listing; altrimenti provo volentieri a chiarire il limite
> tecnico anche senza installazione.

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
