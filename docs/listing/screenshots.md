# Screenshot della listing — piano di cattura e didascalie

Cosa catturare, come, e cosa scrivere sotto. Le regole visive vengono da §9.3
del [brand](../brand/brand-foundation.md) e da §24.5 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md): qui non si
ridiscutono, si applicano.

**Chi li produce:** Codex, dal dev store `cf-ready-dev.myshopify.com`.
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
- **Sfondo:** un solo colore pieno per tutta la serie. Panna per la maggior
  parte, Verde bottiglia per **uno o due** screenshot chiave — qui: il 2 e il 5.
- **Didascalia:** una frase, stessa posizione e stesso stile in tutti.
- **Accento arancio:** al massimo un elemento per screenshot, e solo se indica
  davvero qualcosa. Mai unico veicolo dell'informazione: accompagna sempre la
  didascalia.
- **UI reale, senza ritocchi:** niente testi sostituiti, niente elementi
  cancellati, niente stati inventati. Cattura a 2× e ridimensionamento pari; se
  a dimensione di listing il testo non si legge, **ritaglia** l'area rilevante
  invece di rimpicciolire tutta la schermata.
- **Stessa larghezza di cattura, stesso zoom, stesso tema dell'Admin, stessi
  dati di esempio** in tutta la serie.
- **Nessun marchio Shopify** dentro l'immagine, e nessun dato reale: usa i
  valori sintetici della [reviewer instructions §4](reviewer-instructions.md).

## Le cinque schermate

| # | Schermata | Stato da mostrare | Sfondo |
| --- | --- | --- | --- |
| 1 | Regole | Codice Fiscale su **Obbligatorio**, PEC su **Facoltativo**: si vede che le due regole sono indipendenti e che le modalità sono tre | Panna |
| 2 | Home | Validation **attiva**, con lo stato commerciale visibile | Verde bottiglia |
| 3 | Messaggi | I testi mostrati al cliente, con il selettore di lingua in vista | Panna |
| 4 | Onboarding | La procedura guidata a metà percorso: mostra quanto poco c'è da configurare | Panna |
| 5 | Checkout | Il campo Codice Fiscale con l'errore di validazione, **ritagliato** all'area del campo e del messaggio | Verde bottiglia |

Sul numero 5: è il checkout reale di Shopify, non una ricostruzione — fingere
una UI di checkout diversa è vietato. Il ritaglio serve a due cose insieme:
rendere leggibile il messaggio a dimensione di listing ed evitare che entrino
nell'immagine marchi Shopify.

## Didascalie

La didascalia visibile è in italiano. La listing inglese usa gli stessi file e
descrive ogni immagine con un alt text inglese coerente.

| # | Didascalia visibile | Alt text inglese |
| --- | --- | --- |
| 1 | Tre modalità per ogni campo, indipendenti fra loro. | Rules page: Codice Fiscale required, PEC optional. |
| 2 | Validazione attiva: una sola per store, sempre. | App Home with active validation and plan status. |
| 3 | I messaggi al cliente, in italiano e in inglese. | Messages page with customer-facing text in Italian and English. |
| 4 | Configurazione guidata, senza toccare il tema. | A guided setup step showing the available choices. |
| 5 | Codice Fiscale sbagliato: l'ordine non passa. | Codice Fiscale field at checkout showing a format error. |

## Consegna

**Gli screenshot non entrano nel repository**, per decisione dell'owner del
4 agosto 2026: si caricano direttamente nella listing del Partner Dashboard.
Il repository conserva questo piano di cattura e le didascalie, che sono la
parte che deve restare coerente con il prodotto; i file vivono dove servono.

Ne consegue che la prova della loro esistenza non è un file in Git ma la
listing stessa. Il readback live del 23 agosto 2026 ha verificato feature media,
cinque screenshot desktop e alt text nelle due lingue; la ricevuta è nel
[`release-readiness-1.0`](../runbooks/release-readiness-1.0.md).

## Sito pubblico

Il segnaposto lasciato da M7 sulla Home del sito **resta aperto**: il sito è
servito da `site/`, che sta nel repository, quindi non può mostrare immagini che
nel repository non ci sono. Delle tre strade — versionare i soli due screenshot
che servono alla Home, tenerli su una destinazione esterna raggiungibile dal
sito, o rinunciare a mostrarli — nessuna è stata scelta, e finché non lo sarà la
Home continua a descrivere l'app senza mostrarla.
