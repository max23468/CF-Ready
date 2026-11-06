# Validazione nativa del Codice Fiscale in Shopify

Prove del 6 novembre 2026 sul campo `TAX_CREDENTIAL_IT` del checkout, dopo la
segnalazione di un merchant: le società non riuscivano a inserire il proprio
Codice Fiscale numerico a 11 cifre. Decisione conseguente: D-215.

## Esito

Shopify controlla il formato del campo prima della Cart and Checkout Validation
Function. Accetta solo la struttura ordinaria a 16 caratteri e rifiuta codici
numerici e omocodie, che CF Ready considera validi. Il rifiuto compare all'uscita
dal campo e blocca «Completa ordine».

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
