# Validazione nativa del Codice Fiscale in Shopify

Prove del 6 novembre 2026 sul campo `TAX_CREDENTIAL_IT` del checkout, dopo la
segnalazione di un merchant: le società non riuscivano a inserire il proprio
Codice Fiscale numerico a 11 cifre. Decisione conseguente: D-215.

## Esito

Shopify controlla il formato del campo anche con la Cart and Checkout Validation
Function disattivata. Nelle prove accetta la struttura ordinaria a 16 caratteri
e rifiuta codici numerici e omocodie, che CF Ready considera validi. Il rifiuto
compare all'uscita dal campo; il tentativo originale di «Completa ordine» con
codice numerico non procede. L'ordine delle singole invocazioni della Function
non è stato ricostruito dai run.

## Prove

**Codice di CF Ready.** `diagnoseTaxCode` accetta `00743110157` e
`02313821007`; Production 2.6.5 usava lo stesso codice di validazione.

**Checkout reale cf-ready-dev, regola CF Ready disattivata** in Impostazioni >
Check-out > Regole di check-out e riattivata a fine prova. Messaggio di rifiuto
sempre «Inserisci un Codice fiscale (facoltativo) valido».

| Valore | Caso | Esito Shopify |
| --- | --- | --- |
| `RSSMRA85T10A562S` | ordinario | accettato |
| `rssmra85t10a562s` | minuscolo | accettato |
| `RSS MRA 85T10 A562S` | con spazi | accettato |
| `RSSMRA85T10A562X` | carattere di controllo errato | accettato |
| `RSSMRA85Z10A562S` | mese inesistente | accettato |
| vuoto | campo facoltativo | accettato |
| `00743110157`, `02313821007` | 11 cifre valide | rifiutato |
| `12345678901` | 11 cifre con controllo errato | rifiutato |
| `IT00743110157` | prefisso IT | rifiutato |
| `RSSMRA85T10A562` | 15 caratteri | rifiutato |
| `RSSMRA85T10A562SX` | 17 caratteri | rifiutato |
| `AAAAAAAAAAAAAAAA`, `1234567890123456` | 16 lettere o cifre | rifiutato |
| `RSSMRA85T10A56NS`, `RSSMRA8RT10A562S`, `RSSMRA85T1MA562S` | omocodia | rifiutato |

Con `00743110157`, Azienda compilata e deposito bancario, «Completa ordine» non
procede e nessun ordine viene creato.

**Checkout reale Numisleo, Production.** `00743110157` è rifiutato con lo stesso
messaggio. Il carrello è stato svuotato; nessun pagamento.

**Prima del cambiamento.** L'audit Safari Production del 3 ottobre 2026
(sezione 9.2) riporta che nel checkout Numisleo un codice numerico formalmente
valido faceva scomparire gli errori di formato.

**Testo del messaggio.** Nell'editor dei contenuti del checkout di Numisleo
cercare «fiscale» trova solo l'etichetta del campo; «facoltativo) valido» e
«Inserisci un» non trovano testi modificabili.

## Regola dedotta

`^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$` dopo aver tolto gli spazi, senza
distinzione di maiuscole. Non sono verificati: lettera in posizione 12, limiti
del giorno, punti e trattini, controllo ripetuto lato server.

## Annunci e segnalazione

Nessun annuncio trovato nel changelog o nella documentazione Shopify. Segnalato
il 6 novembre 2026 a Shopify Support nel thread del ticket 69254898.

## Integrazione richiesta da Shopify, ticket 71900946

Il 6 novembre alle 17:39 UTC Shopify Support (NK) ha inoltrato il caso agli
specialisti, senza confermare causa o data del cambiamento, chiedendo
identificativi dei run oppure brevi registrazioni dei checkout interessati.

Nuova prova su **Numismatica Leonessa**, `numisleo.it`, Safari, il 6 novembre
2026 fra le 17:53 e le 17:55 UTC, con consegna e fatturazione italiane e CF Ready
attiva. Identificativo checkout: `hWNHXXZdt8DbGzcabJDpbJ8V`.

| Valore | Esito all'uscita dal campo |
| --- | --- |
| `RSSMRA85T10A562S` | nessun errore sul campo |
| `00743110157` | errore nativo Shopify |
| `02313821007` | errore nativo Shopify |
| `RSSMRA85T10A56NH` | errore nativo Shopify |
| `RSSMRA85T10A562S`, reinserito | errore scomparso |

L'errore nativo è «Inserisci un Codice fiscale (facoltativo) valido».
`diagnoseTaxCode` conferma la validità formale dei due numerici e
dell'omocodia corretta. Gli esempi storici di omocodia nella tabella precedente
avevano invece il carattere di controllo errato: le forme corrette sono
`RSSMRA85T10A56NH`, `RSSMRA8RT10A562E` e `RSSMRA85T1MA562J`. Nella nuova prova
`RSSMRA85T10A56NS` ha prodotto il messaggio di CF Ready sul carattere finale;
non va usato come prova del rifiuto di un'omocodia valida.

La nuova prova documenta il rifiuto nativo a campo compilato, senza stabilire
l'ordine di tutte le invocazioni della Function: non sono stati correlati run
ID a queste interazioni. Non è stato premuto «Paga ora» e non sono stati
inseriti dati di pagamento; il prodotto della prova è stato rimosso e il
carrello è stato verificato vuoto.

Preparati per il supporto un MP4 di 20 secondi composto dalle schermate reali
del confronto e due schermate originali. Il video presenta gli stati acquisiti,
non una registrazione continua. Gli allegati sono conservati fuori dal
repository nella cartella locale `CF-Ready-Shopify-71900946` in Download.

Risposta con i tre allegati inviata a `support@shopify.com` il 6 novembre 2026
alle 18:01 UTC, dopo il controllo dell'owner. Il testo dà priorità ai codici
numerici delle società e corregge l'omocodia in una sola frase. iCloud ha
accettato l'invio; la copia è stata verificata in Posta inviata, nello stesso
thread. La ricezione e la presa in carico degli allegati da parte degli
specialisti restano da confermare.
