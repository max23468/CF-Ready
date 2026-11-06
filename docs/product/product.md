# Prodotto

CF Ready, nome esteso **CF Ready — Codice Fiscale nel Checkout**, è una public
app Shopify App Store. Il nome pubblicato è **CF Ready - Codice Fiscale**,
l'handle `cf-ready`, l'unica abbreviazione interna `CFR`.

Shopify può esporre nel checkout i campi nativi **Codice Fiscale** e **PEC**, ma
la configurazione standard non consente di renderli obbligatori. CF Ready lo fa
con una Cart and Checkout Validation Function, senza modificare il tema, senza
nuovi campi e senza conservare i dati degli acquirenti. È disponibile agli store
di qualunque Paese: l'applicabilità si decide nel singolo checkout.

## Problema

Alcuni merchant italiani devono raccogliere il Codice Fiscale prima di poter emettere fattura elettronica per un ordine B2C. Nel comportamento nativo Shopify il cliente può completare il checkout senza compilare il campo fiscale. Il merchant è quindi costretto a:

- inseguire il cliente dopo l’acquisto;
- ritardare la fatturazione;
- rinominare impropriamente il campo “Interno” o “Indirizzo 2”;
- installare soluzioni più invasive basate su carrello o tema;
- perdere o limitare i checkout accelerati.

CF Ready elimina questo attrito usando il campo fiscale nativo e una validazione server-side.


## Utente target

Merchant con tutte le seguenti caratteristiche:

- store Shopify che serve clienti in Italia, indipendentemente dal Paese della sede;
- piano Basic, Grow, Advanced o Plus;
- Online Store e checkout web Shopify; fatturazione, consegna e campi fiscali
  italiani presenti determinano l'applicabilità nel singolo checkout;
- necessità operativa di emettere fattura elettronica per tutti o molti ordini B2C;
- desiderio di rendere obbligatorio il Codice Fiscale senza modificare tema o carrello.


## Promessa centrale

Formulazione consigliata:

> Mai più ordini da fatturare senza Codice Fiscale. Rendi obbligatorio e valida il campo nativo Shopify nel checkout italiano, senza modificare il tema o utilizzare il campo Interno.

Formulazione prudente:

> Per i merchant che devono emettere fattura elettronica per gli ordini B2C, CF Ready impedisce che un cliente completi un ordine italiano senza aver compilato un Codice Fiscale formalmente valido.


## Formulazioni da evitare

Non affermare:

- che la legge italiana imponga a ogni e-commerce di raccogliere il Codice Fiscale per ogni ordine;
- che l’app determini l’obbligo fiscale del merchant;
- che il Codice Fiscale sia “certificato” o verificato presso l’Agenzia delle Entrate;
- che una PEC formalmente valida sia certamente una casella PEC esistente;
- che l’app emetta, trasmetta o conservi fatture;
- che l’app sia “la prima”, “la migliore” o “l’unica”;
- che l’app abbia merchant, recensioni o risultati non dimostrati.


## Differenziazione

Rispetto alle alternative più ampie o invasive:

- usa campi nativi Shopify;
- non modifica il tema;
- non aggiunge moduli al carrello;
- non richiede Shopify Plus;
- non introduce differenze funzionali per piano Shopify;
- non conta ordini;
- non legge clienti, e gli ordini solo per uniformare Codice Fiscale e PEC se il merchant lo attiva (D-206);
- applica regole italiane ed esenzioni geografiche specifiche;
- richiede poca configurazione;
- mantiene checkout e backend applicativo disaccoppiati.

---


## Incluso

- App embedded nell'Admin Shopify, con quattro pagine permanenti.
- Cart and Checkout Validation Function in TypeScript.
- Codice Fiscale `unmanaged`, facoltativo o obbligatorio; PEC con gli stessi
  stati più l'obbligo legato al campo Azienda. I campi sono indipendenti.
- Validazione formale del Codice Fiscale ordinario di 16 caratteri, con
  omocodia, e del numerico di 11 cifre di società, enti e codici provvisori.
  Dal 6 novembre 2026 il campo nativo di Shopify rifiuta numerici e omocodie
  prima della Function (FR-103, D-215).
- Validazione della PEC come indirizzo email, senza certificarne la natura.
- Messaggi personalizzabili in italiano e inglese, con inglese come fallback
  per il checkout in altre lingue.
- Eccezione per fatturazione estera ed esclusione delle sole destinazioni
  estere.
- Ritiro online e ordini misti, quando Shopify espone i campi nativi.
- Gestione facoltativa delle etichette native del checkout e controllo delle
  etichette della seconda riga dell'indirizzo.
- Fail-open quando stato o configurazione sono incerti.
- Prova gratuita di 14 giorni; mensile, annuale e pagamento unico con identiche
  funzionalità.
- Assistenza in app, sito pubblico bilingue, Privacy Policy e Termini.

## Escluso

- Partita IVA.
- Codice Destinatario SDI.
- Theme App Extension.
- Checkout UI Extension.
- App Home UI Extension.
- Campi personalizzati nel carrello.
- Campi personalizzati nel checkout.
- Modifiche al tema.
- Rinomina del campo “Interno”.
- Integrazione con software di fatturazione.
- Emissione, trasmissione o conservazione di fatture elettroniche.
- Collegamento allo SDI.
- Verifica anagrafica presso l’Agenzia delle Entrate.
- Verifica che il Codice Fiscale appartenga all’acquirente.
- Verifica DNS o tramite provider della PEC.
- Shopify POS.
- Generazioni successive degli ordini ricorrenti in abbonamento; il checkout iniziale con prodotto in abbonamento va verificato separatamente.
- Raccolta tramite app mobile Shopify quando i localized fields non sono disponibili.
- Piano gratuito.
- Limiti per numero di ordini.
- Funzionalità diverse per piano Shopify.
- Ruoli interni aggiuntivi.
- Pagina Diagnostica.
- Pagina Analytics per il merchant.
- Email automatiche di promemoria prova.
- Servizi esterni per analytics, error tracking, email o pagamenti.
- Sentry, Stripe, database esterni e ORM.


## Perché queste esclusioni

**Partita IVA e SDI:** non hanno un percorso nativo equivalente ai due localized fields italiani in tutti i piani. Aggiungerli richiederebbe tema, carrello o estensioni Plus, allargherebbe il prodotto verso il B2B e comprometterebbe la promessa di semplicità.

**Theme e Checkout UI Extension:** l’app deve funzionare senza codice nel tema, senza UX differenziata per Plus e senza rompere i checkout accelerati.

**Piano gratuito:** il valore principale non è divisibile senza creare limiti artificiali o pericolosi. Una soglia ordini potrebbe far smettere la validazione proprio durante l’operatività del merchant.

**Diagnostica e analytics visibili:** per una funzione così verticale sarebbero superfici artificiali. La Home deve mostrare solo stato, avvisi comprensibili e azioni di riparazione.

---

## Presentazione esterna

CF Ready si presenta come una normale app completa, non come beta o pilot. Il
Controlled Launch è una modalità interna di acquisizione e supporto graduali, non un
limite di reperibilità: la listing è pubblica dal 25 agosto 2026. Nessuna adozione,
recensione o risultato non osservato. Ogni contatto con le community è pertinente,
trasparente sull'autore e inviato dall'owner, su sua richiesta esplicita.
