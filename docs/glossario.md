# Glossario canonico

Termini che compaiono nell'interfaccia, nel checkout, nell'assistenza e nei
documenti pubblici, con la traduzione inglese da usare. Fissa parole e
traduzioni, non requisiti né microcopy: quelli restano nel
[Master Plan](plans/2026-07-28-CF-Ready-Master-Plan.md) e nella
[Brand Foundation](brand/brand-foundation.md), che governa il tono.

Regola generale: un concetto, una parola, ovunque. Se un termine qui elencato
non basta per un caso nuovo, si aggiunge a questo file prima di usarlo.

## Dati raccolti nel checkout

| Italiano | English | Significato | Da non usare |
| --- | --- | --- | --- |
| Codice Fiscale | Italian tax code (Codice Fiscale) alla prima occorrenza, poi tax code | Il codice del cliente, raccolto nel campo fiscale nativo del checkout italiano | codice fiscale minuscolo, CF, cod. fisc., fiscal code |
| Codice Fiscale provvisorio | provisional tax code | La forma a 11 cifre attribuita a chi non ha il codice ordinario | partita IVA, codice temporaneo |
| omocodia | omocodia (invariato, con glossa) | La variante del codice che risolve due persone con gli stessi dati | codice alternativo |
| PEC | certified email address (PEC) alla prima occorrenza, poi PEC | L'indirizzo di posta elettronica certificata | pec minuscolo, posta certificata, email certificata |
| validazione formale | format validation | Il controllo su lunghezza, struttura, data, codice catastale e carattere di controllo | verifica, certificazione, controllo anagrafico |
| formalmente valido | formally valid | Conforme alle regole di composizione, senza alcuna verifica presso terzi | valido, verificato, certificato, conforme |

`CFR` è un'abbreviazione interna: non compare in nessun materiale rivolto a
merchant o clienti.

## Comportamento nel checkout

| Italiano | English | Significato | Da non usare |
| --- | --- | --- | --- |
| regole | rules | Le tre modalità scelte dal merchant per ciascun campo | impostazioni, configurazione, settings |
| Non gestito / Non gestita | Not managed | CF Ready non controlla il campo | disattivato, off, ignorato |
| Facoltativo e validato | Optional and validated | Il campo può restare vuoto, ma se compilato deve essere formalmente valido | opzionale |
| Obbligatorio e validato | Required and validated | Il campo va compilato e deve essere formalmente valido | mandatorio, richiesto per legge |
| attivare nel checkout | turn on in checkout | Rendere operative le regole per i clienti | abilitare, accendere, pubblicare, deployare |
| disattivare nel checkout | turn off in checkout | Sospendere le regole conservando la configurazione | spegnere, disabilitare, cancellare |
| attiva / disattivata | active / turned off | Lo stato della validazione | on/off, inattiva, spenta |
| eccezioni automatiche | automatic exceptions | I casi in cui le regole non si applicano, non scelti dal merchant | esclusioni, whitelist |
| avvisi preventivi | early warnings | La modalità che mostra gli errori già al caricamento del checkout | validazione live, controllo immediato |
| messaggi al cliente | customer messages | I testi mostrati nel checkout quando un campo manca o non è valido | errori, alert |

**Validation** con la maiuscola indica l'oggetto Shopify e resta nella
documentazione tecnica. Nell'interfaccia merchant non compare, e non compare
nemmeno «validazione»: si parla di **controllo nel checkout**, perché è ciò che
il merchant riconosce senza doverlo imparare. Le regole valgono, o non valgono,
per i suoi clienti.

## Commerciale

| Italiano | English | Significato | Da non usare |
| --- | --- | --- | --- |
| prova di 14 giorni | 14-day trial | Il periodo iniziale gratuito, uno solo per store | trial, periodo di test, demo |
| piano | plan | La modalità commerciale scelta | licenza, sottoscrizione generica |
| abbonamento mensile / annuale | monthly / annual subscription | Gli addebiti ricorrenti | mensile secco, piano base |
| Un solo pagamento | One payment | L'acquisto singolo senza rinnovi | Lifetime, a vita, per sempre, illimitato |
| Consigliato | Recommended | L'etichetta dell'annuale | Migliore offerta, Risparmia il 17% |
| prezzo di lancio | launch price | Il prezzo della prima generazione tariffaria | sconto, promozione, offerta |
| generazione tariffaria | pricing generation | Il listino acquisito dallo store e mantenuto finché esiste continuità commerciale | fascia, tier |
| primo addebito | first charge | La data del primo pagamento effettivo | scadenza, rinnovo |
| credito stimato | estimated credit | La quota del ciclo corrente non usufruita, mostrata come stima | rimborso, storno |

## Persone e luoghi

| Italiano | English | Significato | Da non usare |
| --- | --- | --- | --- |
| merchant | merchant | Chi gestisce il negozio e configura l'app | utente, cliente, admin |
| cliente | customer | Chi acquista nel checkout | utente, acquirente, buyer |
| store | store | Il negozio Shopify | shop, sito, e-commerce |
| campo nativo del checkout italiano | native Italian checkout field | Il campo fiscale che Shopify espone per l'Italia | campo custom, campo aggiuntivo, nostro campo |
| campo “Interno” | “Apartment, suite, etc.” field | La seconda riga dell'indirizzo, che non va usata per il Codice Fiscale | Indirizzo 2, campo note |

“Acquirente” si usa solo nei documenti legali e nella privacy, dove il termine
è quello consolidato; nell'interfaccia si dice sempre **cliente**.

## Ambienti e rilasci

Termini interni, mai rivolti al merchant.

| Termine | Significato | Da non confondere con |
| --- | --- | --- |
| Development | L'ambiente di sviluppo e collaudo sul dev store | test, staging |
| Production | L'ambiente dei merchant reali | live, prod |
| deploy | La distribuzione di un artefatto in un ambiente | rilascio, pubblicazione |
| release | Una versione promossa in Production, con tag e changelog | deploy, snapshot |
| snapshot | Una versione dell'app rilasciata su Shopify | build, versione generica |
| publish | Portare a termine una modifica: PR, merge e deploy con verifica | push, merge |

In inglese pubblico questi termini non compaiono: al merchant si parla di
funzionalità e aggiornamenti, non di ambienti.
