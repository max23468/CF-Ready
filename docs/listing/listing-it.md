# Listing App Store — italiano

Testi pronti da incollare nella listing. La versione inglese è
[`listing-en.md`](listing-en.md) e le due devono restare allineate: se cambia un
fatto, cambialo in entrambe nella stessa modifica.

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
| Nome app | CF Ready — Codice Fiscale nel Checkout |
| Nome breve in Admin | CF Ready |
| Handle | `cf-ready` |
| Categoria proposta | Store management → Tassazione e conformità — **da confrontare con l'elenco reale** del Partner Dashboard: è un'ipotesi, non una categoria verificata |
| Disponibilità | solo merchant in Italia |
| Icona | `docs/brand/assets/png/icon-app-1200.png` |
| Feature image | `docs/brand/assets/png/feature-image-it-1600.png` |

L'alt text della feature image è richiesto insieme all'immagine:

> Il campo Codice Fiscale e il campo PEC del checkout italiano, con l'esito
> «Formato valido».

Descrive quello che si vede, non quello che vorremmo far capire: un alt text che
ripete lo slogan è inutile a chi non vede l'immagine.

## Tagline

> Codice Fiscale e PEC obbligatori e validati nel checkout italiano.

**66 caratteri.**

## Introduzione

> CF Ready rende obbligatorio il Codice Fiscale nel checkout e ne verifica la
> correttezza formale prima che l'ordine venga completato, usando il campo
> fiscale che Shopify espone già per l'Italia.

**193 caratteri.**

## Descrizione

> **Il problema.** Se emetti fattura per gli ordini B2C, un ordine senza Codice
> Fiscale è un ordine da rincorrere: email al cliente, attesa, fattura in
> ritardo. Shopify espone i campi fiscali italiani nel checkout, ma non permette
> di renderli obbligatori né di controllarli.
>
> **Cosa fa CF Ready.** Rende il Codice Fiscale facoltativo o obbligatorio, e ne
> verifica la correttezza formale — lunghezza, alfabeto, mese, giorno e carattere
> di controllo — prima che l'ordine venga completato. Lo stesso vale per
> l'indirizzo PEC, che puoi lasciare fuori o richiedere insieme al Codice
> Fiscale. Le due regole sono indipendenti.
>
> **Usa il campo che c'è già.** CF Ready non aggiunge campi al checkout: agisce
> sui campi fiscali localizzati che Shopify mostra da sé quando la consegna è in
> Italia. Non tocca il tema, non chiede di incollare codice, non richiede
> Shopify Plus e funziona sui piani standard.
>
> **Non blocca le vendite legittime.** Se la configurazione non è leggibile, se
> il diritto d'uso è scaduto o se qualcosa va storto, il checkout resta aperto.
> Un cliente estero, che non vede nemmeno i campi italiani, non viene mai
> bloccato.
>
> **Cosa non fa.** La validazione è formale, non anagrafica: CF Ready non
> verifica presso l'Agenzia delle Entrate che un codice esista o appartenga a
> chi lo scrive, e non attesta che un indirizzo formalmente valido corrisponda a
> una casella PEC realmente attiva. Non emette fatture e non gestisce la
> fatturazione elettronica, la Partita IVA o il Codice Destinatario SDI. Non
> opera nel POS. Le generazioni successive degli ordini ricorrenti in
> abbonamento non sono coperte: la validazione interviene sul checkout, non sui
> rinnovi automatici che ne derivano.

**1 666 caratteri**, formattazione esclusa.

## Punti in evidenza

1. **Codice Fiscale obbligatorio e validato** — correttezza formale verificata
   prima che l'ordine sia completato.
2. **PEC come regola indipendente** — richiedila insieme al Codice Fiscale o
   lasciala fuori.
3. **Nessuna modifica al tema** — usa i campi fiscali che Shopify espone già per
   l'Italia.
4. **Clienti esteri esclusi** — la regola vale solo quando la consegna è
   italiana.
5. **Non blocca in caso di errore** — se l'app non è disponibile, il checkout
   resta aperto.

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
