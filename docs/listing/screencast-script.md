# Demo screencast — copione di ripresa

Video obbligatorio per la review (§24.6 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md)). Il video
promozionale pubblico resta facoltativo e non è questo.

**Chi lo registra:** Codex, sul dev store `cf-ready-dev.myshopify.com`.
**Durata target:** 3–5 minuti. Sforare i 5 è peggio che tagliare una scena.
**Lingua:** parlato inglese, oppure schermo in inglese con sottotitoli inglesi.
La scelta va fatta una volta e tenuta per tutto il video.

## Prima di registrare

- Admin in inglese, così il parlato e la UI dicono le stesse parole.
- Store con un prodotto pubblicato, disponibile e a prezzo basso.
- App **non ancora installata**: la scena 1 è una prima installazione vera e non
  si può rigirare senza disinstallare.
- Nessun dato reale a schermo: usa i valori sintetici della
  [reviewer instructions §4](reviewer-instructions.md), gli stessi che il
  reviewer digiterà.
- Niente notifiche di sistema, niente altre schede aperte, niente segnalibri
  personali nella barra del browser.
- Cattura a risoluzione piena e zoom costante: la leggibilità del testo
  dell'Admin conta più della dimensione della finestra.

## Scaletta

Le dodici scene sono quelle richieste, con l'avvio della prova che dalla `0.9.2` è un gesto esplicito del merchant. La colonna «Dice» è il senso da
trasmettere, non un copione da leggere parola per parola.

| # | Scena | Cosa si vede | Dice |
| --- | --- | --- | --- |
| 1 | Installazione | Installazione dall'Admin, schermata dei permessi, ingresso nell'app | Un solo permesso richiesto: `write_validations`. L'app non legge ordini, clienti o prodotti |
| 2 | Disponibilità globale | La Home accessibile e il Paese dello store usato solo nella diagnostica | Il Paese dello store non blocca app, prova o pagamento. Le regole si applicano con fatturazione non estera e consegna italiana; senza un Paese di consegna, solo ai campi presenti |
| 3 | Onboarding | La procedura guidata, senza saltarla | Poche scelte, e nessuna tocca il tema |
| 4 | Codice Fiscale obbligatorio | Regole → Codice Fiscale su Obbligatorio → salva | Salvare la regola **non** attiva ancora il controllo: sono due passi separati apposta |
| 5 | PEC | La seconda regola, indipendente | La PEC si può richiedere insieme o lasciare fuori |
| 6 | Avvio della prova | Il pulsante «Inizia la prova» dalla scheda di preparazione | La prova non parte da sola: la decide il merchant, e fino a qui non si è consumato niente. Senza prova o pagamento il controllo non si può attivare |
| 7 | Attivazione | Attivazione dalla Home, con l'esito | Da qui in poi la regola vale nel checkout reale. Un solo controllo per store |
| 8 | Checkout bloccato | Checkout con indirizzo italiano, campo vuoto, poi `RSSMRA85T10A562X` | Prima manca, poi è formalmente sbagliato: in entrambi i casi l'ordine non passa |
| 9 | Checkout consentito | `RSSMRA85T10A562S`, ordine completato | Il controllo è formale: correttezza del codice, non appartenenza a una persona |
| 10 | Cliente estero | Checkout con fatturazione o sole consegne non italiane | CF Ready non produce errori; Shopify decide autonomamente se mostrare i campi italiani |
| 11 | Billing | Scelta di una modalità a pagamento e ispezione della schermata di approvazione Shopify. Nella ripresa interna annulla una charge reale; il reviewer segue invece il passo 10 delle istruzioni e approva la propria transazione | Dopo l'approvazione reviewer, il ritorno alla Home mostra il piano attivo e rende disponibile l'azione checkout. Shopify può marcare quella transazione come test; gli store Production ordinari ricevono addebiti reali |
| 12 | Disattivazione | Disattivazione dalla Home | Il checkout torna libero e la configurazione resta salvata |

## Da dire esplicitamente nel video

Quattro frasi che devono essere pronunciate o mostrate, perché sono i punti su cui
una review può fraintendere il prodotto:

1. la validazione è **formale**, non anagrafica;
2. la prova **non parte da sola**: la avvia il merchant quando vuole;
3. l'app **non blocca** quando è lei a fallire;
4. l'app **non modifica il tema** e non aggiunge campi al checkout.

## Da non fare

- non accelerare le riprese del checkout: il reviewer deve vedere il messaggio
  di errore per il tempo di leggerlo;
- non tagliare la scena 10, che è la prova del fail-open sul cliente estero;
- non mostrare il Partner Dashboard, i secret, gli URL dei Worker o la
  configurazione Cloudflare;
- non dichiarare a voce funzioni che l'app non ha: niente fatturazione
  elettronica, niente Partita IVA, niente SDI, niente POS.

## Consegna

**Il video non entra nel repository**, per decisione dell'owner del 4 agosto
2026: si carica dove la submission lo richiede. Qui resta il copione, che è la
parte che deve restare allineata al prodotto — e che la `0.9.2` ha già dovuto
correggere una volta.
