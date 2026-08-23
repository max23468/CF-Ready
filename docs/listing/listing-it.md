# Listing App Store — italiano

Testi pronti da incollare nella listing. La versione inglese è
[`listing-en.md`](listing-en.md) e le due devono restare allineate: se cambia un
fatto, cambialo in entrambe nella stessa modifica.

Il Partner Dashboard mostra questa lingua primaria e l'inglese entrambe `Live`
dal 23 agosto 2026; non resta alcuna lingua non pubblicata.

I limiti di caratteri dei campi vanno **riconfermati nel Partner Dashboard al
momento della compilazione**: cambiano senza preavviso e non sono una costante
di questo documento. Sotto ogni testo è indicata la lunghezza effettiva, così
un limite più stretto si affronta tagliando e non riscrivendo.

Fonti dei fatti: §14 e §24 del
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md), `app/plans.server.ts`
per gli importi, `extensions/cf-ready-validation/` per il comportamento nel
checkout.

---

## Nome e identità

| Campo | Valore |
| --- | --- |
| Nome app | CF Ready - Codice Fiscale |
| Nome breve in Admin | CF Ready |
| Handle | `cf-ready` |
| Categoria primaria | Gestione del negozio → Finanze → Imposte |
| Categoria secondaria | Marketing e conversione → Checkout → Checkout - Altro |
| Requisito geografico | il merchant deve spedire in Italia |
| Icona | `docs/brand/assets/png/icon-app-1200.png` |
| Feature image | `docs/brand/assets/png/feature-image-it-1600.png` |

L'alt text della feature image è richiesto insieme all'immagine:

> CF Ready - Codice Fiscale nel checkout

Descrive quello che si vede, non quello che vorremmo far capire: un alt text che
ripete lo slogan è inutile a chi non vede l'immagine.

## Sottotitolo della scheda app

> Codice Fiscale e PEC obbligatori e validati nel checkout.

**57/62 caratteri.**

## Introduzione

> Rende obbligatorio il Codice Fiscale nel checkout italiano e ne verifica la
> correttezza formale.

**96/100 caratteri.**

## Dettagli app

> Shopify mostra i campi fiscali italiani nel checkout, ma non può renderli
> obbligatori né controllarli. CF Ready lo fa: Codice Fiscale e PEC diventano
> facoltativi o obbligatori, con verifica della correttezza formale prima che
> l'ordine sia completato. Non aggiunge campi, non tocca il tema, non richiede
> Plus. Se l'app non è disponibile il checkout resta aperto, e i clienti esteri
> non sono mai bloccati. La validazione è formale, non anagrafica: non attesta
> che un codice appartenga a chi lo scrive.

**499/500 caratteri.**

## Punti in evidenza

1. `Codice Fiscale obbligatorio e validato prima che l'ordine sia completato.`
2. `PEC come regola indipendente: richiedila insieme o lasciala fuori.`
3. `Nessuna modifica al tema: usa i campi che Shopify espone già per l'Italia.`
4. `Clienti esteri esclusi: la regola vale solo con consegna italiana.`
5. `Non blocca in caso di errore: il checkout resta sempre aperto.`

## Ricerca e SEO

- termini di ricerca: `Codice Fiscale`, `PEC`, `Fatturazione`, `Campi fiscali`,
  `Checkout`;
- title tag: `CF Ready - Codice Fiscale obbligatorio nel checkout`;
- meta description: `Rendi obbligatorio il Codice Fiscale nel checkout
  italiano e verificane la correttezza formale, senza toccare il tema. PEC come
  regola indipendente.`

## Canali e limitazioni dichiarate

Da riportare nella listing con lo stesso rilievo dei benefici, non in coda.

| Ambito | Stato |
| --- | --- |
| Checkout online | supportato |
| Checkout accelerati (Apple Pay, Google Pay, Shop Pay, PayPal) | supportati secondo la compatibilità dichiarata da Shopify per le Validation Function |
| Ritiro in negozio con consegna italiana | incluso quando i campi sono presenti |
| Ordini misti | inclusi se almeno una consegna è in Italia |
| Shopify POS | **non supportato** |
| Generazioni ricorrenti degli abbonamenti | **non coperte** |
| Store non italiani | l'app dichiara lo store non idoneo e non avvia prova né pagamento |

## Prezzi e prova

Prova gratuita di **14 giorni**, una sola volta per store, con tutte le
funzionalità attive e nessun addebito.

| Modalità | Prezzo di lancio | Nota |
| --- | --- | --- |
| Mensile | € 2,99 / mese | |
| Annuale | € 29,90 / anno | consigliato |
| Un solo pagamento | € 89,90 | un pagamento, nessun rinnovo, un singolo store |

Le tre modalità hanno **identiche funzionalità**: nessun tier artificiale. I
prezzi di lancio valgono i primi 90 giorni; chi sottoscrive mantiene il prezzo
acquisito anche dopo. Tutti i pagamenti passano dal sistema di fatturazione
delle app di Shopify.

**La vetrina della listing è in dollari e l'addebito è in euro.** L'editor dei
piani del Partner Dashboard non ha un campo valuta: gli importi vanno inseriti
in USD come controvalore, arrotondato per eccesso perché la vetrina non prometta
mai meno di quanto la fattura chiede. Il prezzo in euro va ripetuto fra le
funzionalità del piano, che sono dentro *Pricing details* e perciò l'unica area
dove i requisiti 4.2.2 e 4.2.3 consentono di indicare importi. Motivi e fonti in
§14.2 del [Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md).

Verifica gli importi in `app/plans.server.ts` prima di pubblicare: la listing e
il codice devono dire la stessa cifra.

## Privacy

> I Codici Fiscali e gli indirizzi PEC dei tuoi clienti non arrivano a noi. Il
> controllo avviene dentro l'infrastruttura di Shopify, durante il checkout, e
> il valore inserito non viene inviato ai nostri sistemi, non viene registrato e
> non viene conservato. L'app non legge ordini, clienti, prodotti o giacenze:
> l'unico permesso richiesto è quello necessario a gestire la propria
> validazione.

## Link

| Voce | URL |
| --- | --- |
| Assistenza | `https://cf-ready.pages.dev/support` |
| Sito sviluppatore | `https://cf-ready.pages.dev` |
| Privacy | `https://cf-ready.pages.dev/privacy` |
| Termini | `https://cf-ready.pages.dev/terms` |
| Contatto | `cfready@icloud.com` |

## Cosa non va scritto

Vincoli di §9.2 del [brand](../brand/brand-foundation.md) e §24 del Master Plan,
elencati qui perché è nella listing che si è tentati di violarli.

- nessuna prova sociale, nessun numero di installazioni, nessuna recensione
  citata finché non esistono davvero;
- nessuna percentuale di ordini «recuperati» o di errori «evitati»: non abbiamo
  la misura e non la avremo;
- non presentare l'app come obbligatoria per ogni e-commerce italiano;
- non dichiarare o lasciare intendere una verifica anagrafica;
- nessun marchio Shopify dentro icona, feature image o screenshot.
