# Screenshot della listing — piano di cattura e didascalie

Cosa catturare, come, e cosa scrivere sotto. Le regole visive vengono da §9.3
del [brand](../brand/brand-foundation.md) e da §24.5 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md): qui non si
ridiscutono, si applicano.

**Chi li produce:** Codex, dal dev store `cf-ready-dev.myshopify.com`.
Servono **due serie complete**, una con Admin in italiano e una in inglese: non
si mescolano lingue dentro la stessa serie.

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

Una frase per schermata, 8–10 parole. Le due lingue dicono la stessa cosa: se
una cambia, cambia anche l'altra.

| # | Italiano | English |
| --- | --- | --- |
| 1 | Tre modalità per ogni campo, indipendenti fra loro. | Three modes per field, each one independent. |
| 2 | Validazione attiva: una sola per store, sempre. | Validation active: one per store, always. |
| 3 | I messaggi al cliente, in italiano e in inglese. | The messages your customer sees, in both languages. |
| 4 | Configurazione guidata, senza toccare il tema. | Guided setup, without touching your theme. |
| 5 | Codice Fiscale sbagliato: l'ordine non passa. | Wrong tax code: the order does not go through. |

## Consegna

I file finiti vanno in `docs/brand/assets/png/`, con nomi
`listing-shot-<numero>-<lingua>.png`, e vanno elencati qui sotto quando
esistono. Finché la tabella resta vuota, la listing non è completa.

| File | Schermata | Lingua | Stato |
| --- | --- | --- | --- |
| — | — | — | da produrre |

## Sito pubblico

Gli stessi screenshot chiudono il segnaposto lasciato da M7 sulla Home del sito:
oggi il sito non mostra nessuna schermata dell'app. Usa il numero 1 e il numero
2; le didascalie sono già bilingui e le pagine sono già IT/EN.
