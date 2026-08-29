# Screenshot della listing — piano di cattura e didascalie

Cosa catturare, come, e cosa scrivere sotto. Le regole visive vengono da §9.3
del [brand](../brand/brand-foundation.md) e da §24.5 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md): qui non si
ridiscutono, si applicano.

**Chi li produce:** Codex, esclusivamente dall'app installata sul dev store
`cf-ready-dev.myshopify.com`. Non si usano schermate di checkout o storefront,
né del dev store né di altri negozi.
La serie pubblicata in M9 è unica, con Admin e didascalie in italiano, e viene
riutilizzata nelle listing italiana e inglese. Nella listing inglese gli alt
text sono localizzati: è la scelta finale dell'owner del 23 agosto 2026. Una
futura serie con Admin inglese dovrà essere completa; non si mescolano lingue
dentro la stessa serie.

## Regole valide per tutta la serie

- **Cornice unica e ripetuta:** rettangolo bianco, `--cf-radius-lg`, bordo
  `--cf-color-border-subtle`, ombra `--cf-shadow-frame` appena percettibile.
  Nessuna finestra di browser disegnata, nessuna barra del Mac, nessun mockup di
  laptop, nessuna prospettiva.
- **Sfondo:** un solo colore pieno per ogni immagine. Panna per la maggior
  parte, Verde bottiglia per **uno o due** screenshot chiave — qui: il 1 e il 2.
- **Didascalia:** una frase, stessa posizione e stesso stile in tutti.
- **Accento arancio:** al massimo un elemento per screenshot, e solo se indica
  davvero qualcosa. Mai unico veicolo dell'informazione: accompagna sempre la
  didascalia.
- **UI reale, senza ritocchi:** niente testi sostituiti, niente elementi
  cancellati, niente stati inventati. Cattura a 2× e ridimensionamento pari; se
  a dimensione di listing il testo non si legge, **ritaglia** l'area rilevante
  invece di rimpicciolire tutta la schermata.
- **Nessun testo troncato:** il ritaglio termina tra blocchi completi; non lascia
  a metà frasi, etichette, campi o messaggi di errore.
- **Stesso zoom, stesso tema dell'Admin, stessi dati di esempio** in tutta la
  serie. La larghezza può aumentare solo quanto serve a chiudere interamente un
  blocco di testo prima del ritaglio.
- **Nessun marchio Shopify** dentro l'immagine, e nessun dato reale: usa i
  valori sintetici della [reviewer instructions §4](reviewer-instructions.md).

## Le cinque schermate

| # | Schermata | Stato da mostrare | Sfondo |
| --- | --- | --- | --- |
| 1 | Simulatore | Il campo Codice Fiscale con l'errore formale e lo stato **Checkout bloccato**, ritagliato all'anteprima interattiva della 1.1 | Verde bottiglia |
| 2 | Regole | Codice Fiscale **obbligatorio** e PEC **facoltativa**, inquadrati sulle due schede indipendenti | Verde bottiglia |
| 3 | Messaggi | Testi in italiano e inglese con la nuova anteprima affiancata della 1.1 | Panna |
| 4 | Home | Controllo **attivo**, con stato delle regole, piano e accesso alla guida visibili | Panna |
| 5 | Guida | FAQ e azioni di assistenza con diagnostica tecnica copiabile, in due ritagli affiancati e completi | Panna |

Sul numero 1: è il simulatore reale incluso nell'app, non un checkout né una
ricostruzione grafica. Il ritaglio rende leggibili stato e messaggio a dimensione
di listing ed evita che entrino nell'immagine elementi dell'Admin Shopify.

## Didascalie

La didascalia visibile è in italiano. La listing inglese usa gli stessi file e
descrive ogni immagine con un alt text inglese coerente.

| # | Didascalia visibile | Alt text inglese |
| --- | --- | --- |
| 1 | Vedi subito perché il checkout verrebbe bloccato. | In-app simulator with a formally invalid Codice Fiscale. |
| 2 | Scegli regole separate per Codice Fiscale e PEC. | Separate controls for Codice Fiscale and PEC. |
| 3 | Personalizza i messaggi in italiano e inglese. | Italian and English checkout message previews. |
| 4 | Attiva il controllo solo quando sei pronto. | Home with active checkout control, rules and plan. |
| 5 | Guida e diagnostica pronte quando serve assistenza. | FAQs, support actions and privacy-safe diagnostics. |

## Consegna

**Gli screenshot non entrano nel repository**, per decisione dell'owner del
4 agosto 2026: si caricano direttamente nella listing del Partner Dashboard.
Il repository conserva questo piano di cattura e le didascalie, che sono la
parte che deve restare coerente con il prodotto; i file vivono dove servono.

Ne consegue che la prova della loro esistenza non è un file in Git ma la
listing stessa. Il readback live del 23 agosto 2026 ha verificato feature media,
cinque screenshot desktop e alt text nelle due lingue; questa nuova serie li
sostituisce con cinque schermate più focalizzate. La ricevuta storica è nel
[`release-readiness-1.0`](../runbooks/release-readiness-1.0.md).

## Sito pubblico

Il segnaposto lasciato da M7 sulla Home del sito **resta aperto**: il sito è
servito da `site/`, che sta nel repository, quindi non può mostrare immagini che
nel repository non ci sono. Delle tre strade — versionare i soli due screenshot
che servono alla Home, tenerli su una destinazione esterna raggiungibile dal
sito, o rinunciare a mostrarli — nessuna è stata scelta, e finché non lo sarà la
Home continua a descrivere l'app senza mostrarla.
