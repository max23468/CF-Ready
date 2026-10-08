# Screenshot della listing

La serie 2.x preparata l’8 ottobre 2026 contiene sei PNG desktop per lingua,
1600 × 900 pixel, con interfaccia e didascalie interamente italiane oppure
inglesi. I file sono stati caricati nei listing italiano e inglese l’8 ottobre
2026 su autorizzazione dell’owner. La serie precedente resta conservata.

La composizione applica il [brand §9.3](../brand/brand-foundation.md): UI reale
ritagliata senza ritocchi, cornice bianca ripetuta, una frase per immagine,
sfondi alternati Verde bottiglia (1, 3, 5) e Panna (2, 4, 6), come richiesto
dall’owner l’8 ottobre 2026. Nessuna barra del
browser, marchio Shopify, dato del negozio o prezzo compare nei PNG finali.

## Serie 2.x

| # | Contenuto | File IT | File EN |
| --- | --- | --- | --- |
| 1 | Regole indipendenti CF e PEC; PEC richiesta quando Azienda è compilata | [Regole IT](assets/2x/it/01-regole-cf-pec.png) | [Rules EN](assets/2x/en/01-regole-cf-pec.png) |
| 2 | Editor dei messaggi e anteprima nella lingua della serie | [Messaggi IT](assets/2x/it/02-messaggi.png) | [Messages EN](assets/2x/en/02-messaggi.png) |
| 3 | Simulatore dell’app con Codice Fiscale formalmente errato | [Simulatore CF IT](assets/2x/it/03-simulatore-cf.png) | [Tax code simulator EN](assets/2x/en/03-simulatore-cf.png) |
| 4 | Simulatore dell’app con Azienda compilata e PEC mancante | [Simulatore PEC IT](assets/2x/it/04-simulatore-pec.png) | [PEC simulator EN](assets/2x/en/04-simulatore-pec.png) |
| 5 | Home con controllo attivo e riepilogo delle regole | [Home IT](assets/2x/it/05-home-stato.png) | [Home EN](assets/2x/en/05-home-stato.png) |
| 6 | FAQ e assistenza generale: chat, email precompilata e diagnostica | [Assistenza IT](assets/2x/it/06-assistenza.png) | [Support EN](assets/2x/en/06-assistenza.png) |

Si apre con le regole per chiarire cosa fa l’app prima di mostrarne il
simulatore. Le etichette checkout sono escluse, come richiesto dall’owner.
I numeri 3 e 4 mostrano il simulatore reale incluso nell’app: non sono
schermate di un checkout Shopify e non provano il comportamento shopper.

| # | Alt text IT | Alt text EN |
| --- | --- | --- |
| 1 | Regole indipendenti per Codice Fiscale e PEC. | Independent rules for Italian tax code and PEC. |
| 2 | Editor e anteprima dei messaggi di errore in italiano. | English error message editor and preview. |
| 3 | Simulatore dell’app con Codice Fiscale non valido. | In-app simulator with an invalid Italian tax code. |
| 4 | Simulatore: Azienda compilata e PEC obbligatoria mancante. | In-app simulator: Company filled in and required PEC missing. |
| 5 | Home con controllo attivo, CF obbligatorio e PEC facoltativa. | Home with active check, required tax code and optional PEC. |
| 6 | FAQ, assistenza via chat o email e diagnostica tecnica. | FAQs, chat or email support and technical diagnostics. |

Ogni alt text resta entro i 64 caratteri consentiti nell’editor verificato in
Chrome. Lo stesso editor permette fino a sei screenshot desktop. Le didascalie
visibili, nella rispettiva lingua, sono nel manifest di consegna.
I requisiti di formato sono nelle [best practice Shopify](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices#3-screenshots).

## Consegna e ripristino

- [ZIP con le due cartelle IT/EN e il manifest](assets/2x/cf-ready-2x-screenshots-it-en.zip).
- [Anteprima IT](assets/2x/anteprima-it.png) e [anteprima EN](assets/2x/anteprima-en.png).
- [Manifest con ordine, didascalie e alt text](assets/2x/manifest.json).

L’owner ha autorizzato esplicitamente Numisleo come appoggio e le modifiche
temporanee necessarie, con successivo ripristino. Questa cattura usa l’app
Production 2.1.2, in Chrome, tema chiaro, zoom 80%, screenshot a 2×. La regola
PEC legata ad Azienda è una bozza usata nei numeri 1, 3 e 4, poi scartata senza
salvataggio. I dati del simulatore sono le fixture sintetiche delle
[istruzioni reviewer](reviewer-instructions.md).

Il readback finale conferma controllo attivo, CF obbligatorio e validato,
PEC facoltativa e validata, messaggi predefiniti e nessuna bozza pendente.
La lingua del profilo Shopify è tornata a Italiano, il formato regionale a
Italiano (Italia), il fuso orario a Roma; zoom ripristinato al 100%, chat chiusa
e scheda temporanea del profilo chiusa. Le etichette non sono state modificate.
Non sono stati inviati messaggi.

## Pubblicazione App Store

L’8 ottobre 2026 l’owner ha autorizzato l’aggiornamento dei due listing e la
pubblicazione. In Chrome sono stati sostituiti i cinque screenshot precedenti
con i sei file della lingua corrispondente, mantenendo gli altri contenuti e
la feature image. Ogni slot ha l’alt text riportato sopra, poi il listing è
stato salvato.

Il readback pubblico completato alle 14:38 CEST dell’8 ottobre 2026 ha verificato
su [CF Ready nello Shopify App Store](https://apps.shopify.com/cf-ready), usando
il selettore della lingua, tutte le sei immagini in italiano e tutte le sei
in inglese. Le due gallerie espongono nell’ordine regole, messaggi, simulatore
CF, simulatore PEC, Home e assistenza generale, con interfaccia, didascalie e
alt text nella rispettiva lingua. È stata verificata anche l’alternanza degli
sfondi Verde bottiglia e Panna. La lingua pubblica del browser è stata
riportata a Italiano al termine.

## Serie precedente

La serie storica di cinque immagini italiane è stata usata nelle due listing
con alt text localizzati, per decisione dell’owner del 23 agosto 2026:

1. [Simulatore](assets/01-simulatore-blocco.png).
2. [Regole](assets/02-regole-cf-pec.png).
3. [Messaggi](assets/03-messaggi-it-en.png).
4. [Home](assets/04-home-stato.png).
5. [Guida](assets/05-guida-assistenza.png).

Il readback del 29 agosto 2026 ne ha verificato la pubblicazione; il 9 settembre
sono state ricatturate le immagini 1, 2 e 4 dall’app Development. La ricevuta
storica è nel [release-readiness-1.0](../runbooks/release-readiness-1.0.md).
Il Partner Dashboard resta autorevole per i file effettivamente pubblicati.

## Sito pubblico

L’inserimento degli screenshot nella Home del sito richiede un task dedicato
che scelga immagini e layout; questa consegna aggiorna soltanto i materiali
locali della listing.
