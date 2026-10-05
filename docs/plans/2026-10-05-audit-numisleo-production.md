# Audit di CF Ready 2.0.17 in Production su Numisleo

**Data:** 5 ottobre 2026
**Ambiente:** Production, `numisleo.myshopify.com`, app `cf-ready`, versione
Shopify 2.0.17 con Polaris 2 (`77bef94`)
**Strumento:** Chrome con la sessione Admin dell'owner, scheda in primo piano,
solo italiano. Desktop a 1440×666; 390 e 320 px ottenuti restringendo l'iframe
dell'app, quindi emulano il layout dell'app e non la cornice mobile dell'host.
**Prove:** [evidence/2026-10-04-audit-numisleo-prod](evidence/2026-10-04-audit-numisleo-prod)

## Esito

Nessuna anomalia bloccante. Le pagine funzionano e rispettano Polaris 2 come
lo store di preview. Quattro rilievi lievi: uno grafico introdotto dalla
correzione di C-2 in 2.0.16, tre di testo o di caricamento nati prima.

## Percorsi verificati

| Superficie | Esito | Prova |
| --- | --- | --- |
| Home | Badge «Attiva» positivo, regole con badge neutri, piano omaggio permanente, «Modifica regole» primario e disattivazione terziaria; conferma di disattivazione aperta | [01](evidence/2026-10-04-audit-numisleo-prod/01-home-desktop.jpg) |
| Regole, simulatore | CF vuoto, CF sintetico non valido e PEC non valida bloccano con errore in linea; l'indicazione «Deve avere 16 caratteri oppure 11 cifre» coincide con la Function | — |
| Regole, etichette | Italiano senza modifiche proposte, modalità «Mista», nota sui mercati senza la frase di C-3; verifica in sospeso solo sul checkout inglese, che per questo si apre per primo | [02](evidence/2026-10-04-audit-numisleo-prod/02-regole-testi-checkout-italiano.jpg), [03](evidence/2026-10-04-audit-numisleo-prod/03-regole-campo-interno.jpg) |
| Regole, bozza | La navigazione Admin resta bloccata con l'avviso «salva o scarta»; «Rimuovi» ripristina | [04](evidence/2026-10-04-audit-numisleo-prod/04-regole-bozza-navigazione-bloccata.jpg) |
| Messaggi | Focus PEC cambia l'esempio; modifica, salvataggio con toast, conferma di ripristino e nuovo salvataggio; la Home torna a «Predefiniti» | [05](evidence/2026-10-04-audit-numisleo-prod/05-messaggi-desktop.jpg) |
| Guida | FAQ aperte con «Espandi tutte»; «Aggiorna e verifica» riporta validazione, piano, campi e Interno corretti e le etichette da verificare | [06](evidence/2026-10-04-audit-numisleo-prod/06-guida-diagnosi.jpg) |
| Onboarding | Passi 1–4 senza scritture; riepilogo con «Torna alla Home» e «Indietro» | [07](evidence/2026-10-04-audit-numisleo-prod/07-onboarding-riepilogo.jpg) |
| Mobile | Home, onboarding e Messaggi a 320 px, Regole a 390 px, Guida a 320 px: nessun troncamento né scorrimento orizzontale | [08](evidence/2026-10-04-audit-numisleo-prod/08-home-320-etichetta-a-capo.png) |

## Rilievi

| ID | Tipo | Severità | Confidenza | Rilievo e causa |
| --- | --- | --- | --- | --- |
| NP-1 | Grafico | Bassa | Alta | Con le righe di stato impilate (≤ 400 px) l'etichetta resta limitata a metà larghezza: «Messaggi al cliente» e «Controllo di «Interno»» vanno a capo senza motivo. `.cf-status-list__label { max-inline-size: 50cqi }` in `app/ui-status-list.css` vale anche in colonna singola; introdotto con la correzione di C-2 (2.0.16). |
| NP-2 | Testo | Bassa | Alta | La FAQ «Come completo la verifica manuale delle etichette?» cita «Ultima lettura delle etichette da Shopify», ma Regole mostra «Ultima lettura da Shopify» (`app/i18n/it.ts`, `lastReadLabel`). |
| NP-3 | Testo | Bassa | Media | Nella tabella di «Campo Interno» le intestazioni non descrivono il contenuto: sotto «Campo» compare la configurazione («Facoltativo»), sotto «Testo Shopify» compare «Nessuna modifica» (`Address2CheckoutLabels.tsx`). |
| NP-4 | Caricamento | Bassa | Alta | In Messaggi, senza una lettura delle etichette salvata in D1, il primo render dice «con l'etichetta proposta da CF Ready» e dopo la lettura passa a «con l'etichetta attuale di Shopify» (`app.messages.tsx`, `previewField`). |

## Scritture e stato finale

Scritto e ripristinato il messaggio italiano «PEC non valida» con il suffisso
« Grazie.»: salvataggio, ripristino dei predefiniti dalla conferma e nuovo
salvataggio. Nessun'altra modifica. La disattivazione della validazione, il
salvataggio di regole senza campi e il completamento dell'onboarding da stato
disattivato non sono stati eseguiti: il controllo automatico dei permessi di
Claude Code ha bloccato la disattivazione in Production. Le varianti
corrispondenti restano verificate soltanto su Development (audit Claude §30).

Stato finale riletto: validazione attiva, Codice Fiscale obbligatorio, PEC
facoltativa, messaggi predefiniti, gestione etichette «Mista». «Aggiorna e
verifica» ha aggiornato l'orario dell'ultima verifica.

## Limiti

Non verificati: inglese, checkout reale da cliente, dispositivo fisico,
cornice mobile dell'host sotto 500 px, stati disattivati in Production.

## Correzioni locali in 2.0.18

Su richiesta dell'owner, i quattro rilievi sono corretti in locale, senza
pubblicazione. Ogni correzione ha un test che falliva prima:

- **NP-1:** in colonna singola `.cf-status-list__label` non ha più il limite
  di metà riga; il test del riepilogo a 320 px verifica che ogni etichetta
  stia su una riga, in Chromium e WebKit con Polaris 1 e 2.
- **NP-2:** FAQ italiana e inglese citano l'etichetta mostrata in Regole; un
  test i18n lega la risposta a `lastReadLabel`.
- **NP-3:** colonne «Configurazione Shopify», «Campo attuale», «Testo standard
  Shopify» e cella «Già standard» (inglese: «Shopify setting», «Shopify
  standard text», «Already standard»); il test della route Regole controlla
  le intestazioni.
- **NP-4:** senza lettura salvata, l'esempio di Messaggi mostra solo il
  contesto finché Shopify non risponde; il test di caricamento lo verifica.

La verifica live in Chrome resta da fare dopo una pubblicazione.

