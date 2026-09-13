# CF Ready: lacune delle API Shopify e richieste

Ricognizione del 13 settembre 2026, verificata e riorganizzata lo stesso giorno. Glossario in [CONTEXT.md](CONTEXT.md). Pubblicati finora gli invii 1, 4 e 5.

## In sintesi

Le 25 schede della prima stesura diventano cinque invii e quattro domande secondarie. Le capacità già costruibili con le API esistenti passano in un'appendice interna: chiederle a Shopify indebolirebbe le richieste vere.

| # | Invio | Tipo | Stato |
| --- | --- | --- | --- |
| 1 | Sintassi dei target dei localized field nella documentazione | bug documentale | pubblicato il 13 settembre nel [topic 37612](https://community.shopify.dev/t/cart-and-checkout-validation-docs-localized-field-error-target-shown-in-three-different-forms-plural-example-silently-blocks-checkout/37612); chiuso, nessun seguito previsto ([bozza](bozza-01-target-sintassi.en.md)) |
| 2 | Errori invisibili nella review e segnale di intento | bug riconosciuto e capacità | sospeso dall'owner il 13 settembre fino al ricollegamento di Claude in Chrome; [bozza](bozza-02-thread-review.en.md) da riscrivere dopo la prova |
| 3 | Campi fiscali nel checkout: comparsa, input Function, recupero nei wallet | contratto da chiarire e capacità | rinviato dall'owner il 13 settembre; possibile prova su numisleo senza pagamento o con un solo pagamento autorizzato dall'owner |
| 4 | API di configurazione: etichette, impostazioni del modulo, scritture protette, eventi | capacità | pubblicato il 13 settembre nel [topic 37613](https://community.shopify.dev/t/feature-request-admin-api-support-for-native-checkout-field-labels-and-checkout-form-settings/37613), categoria Markets ([bozza](bozza-04-api-configurazione.en.md)) |
| 5 | Dati fiscali nativi oltre CF e PEC: P. IVA, SDI, obbligatorietà condizionale | capacità | pubblicato il 13 settembre nel [topic 37614](https://community.shopify.dev/t/feature-request-localized-checkout-fields-for-the-italian-vat-number-and-sdi-recipient-code/37614), categoria Markets ([bozza](bozza-05-dati-fiscali-nativi.en.md)) |

Stato al 13 settembre: 1, 4 e 5 pubblicati; 2 sospeso; 3 rinviato; domande secondarie D1–D4 non inviate.

**Rischio emerso, da trattare prima internamente.** Da D-143 CF Ready accetta negozi di qualunque Paese. Il 3 agosto il supporto Shopify ha segnalato proprio il dubbio che `TAX_CREDENTIAL_IT` non compaia in un negozio non italiano che spedisce in Italia, senza poterlo chiarire. Se non compare, con Codice Fiscale obbligatorio e consegna italiana la Function blocca a `CHECKOUT_COMPLETION` con un errore globale e il cliente non ha alcun campo da compilare ([cart_validations_generate_run.ts:185](../../../extensions/cf-ready-validation/src/cart_validations_generate_run.ts#L185)). Vedi 3.1 e l'azione interna 1. **Decisione dell'owner del 13 settembre:** poiché riguarda soltanto negozi non italiani, il tema è rinviato.

## Metodo e livelli di prova

Codice e documenti del progetto: verificati su `1.11.0`. La prima stesura partiva da `1.10.1`; le modifiche successive fino a `1.11.2` riguardano la UI delle etichette, il sito e la pubblicazione, e non cambiano le conclusioni.

Fonti Shopify, rilette il 13 settembre:

- reference `2026-07` su shopify.dev e guide su help.shopify.com;
- Shopify Dev MCP `1.14.4`: ricerca nella documentazione e validazione di query e mutation sugli schemi `functions_cart_checkout_validation` e `admin` `2026-07`;
- thread community e risposte del Developer Support del 30 e 31 luglio e del 3 agosto: testo integrale incollato dall'owner nelle chat di quei giorni, sintetizzato in `docs/evidence/2026-07-29-checkout-validation-rendering.md`.

| Livello | Significato |
| --- | --- |
| schema verificato | query o mutation validata sullo schema corrente con l'MCP |
| documentato | reference o guida corrente |
| osservato | ricevuta CF Ready con data |
| dichiarato dal supporto | email o post Shopify, non contratto pubblicato |
| non individuato | assente nelle fonti consultate; non prova che la capacità manchi |

Non sono state eseguite mutation su store, acquisti o modifiche alle impostazioni del checkout.

## 1. Sintassi dei target dei localized field

**Tipo:** bug documentale. **Canale:** feedback sulla pagina di reference e seguito del caso Developer Support del 30 luglio. **Prerequisiti:** nessuno.

**Problema.** La documentazione mostra tre forme diverse per lo stesso target (documentato):

| Dove | Forma |
| --- | --- |
| Validation Function API, tabella dei target supportati | `$.cart.localizedfield.key` |
| Validation Function API, esempio sui localized field obbligatori | `$.cart.localizedFields.${field.key}` |
| Localized Fields API delle checkout UI extensions | `$.cart.localizedField.${taxIdField.key}` |

Solo la terza forma rende il messaggio. Con il plurale dell'esempio il checkout blocca l'ordine e il messaggio non compare da nessuna parte (osservato il 29 luglio, one-page e three-page, conferma ordine attiva e disattiva). Il 30 luglio il supporto ha confermato la forma singolare camelCase con chiave maiuscola, con corrispondenza case-sensitive, indicando come riferimento l'esempio della Localized Fields API. Ha definito lo scarto silenzioso un bug di piattaforma e ha scritto di aver avviato una correzione della documentazione. Al 13 settembre tabella ed esempio sono invariati, anche nella pagina `2026-10`.

**Richiesta.** Usare `$.cart.localizedField.<KEY>` in tabella ed esempi, con un esempio su una chiave reale; segnalare in sviluppo (CLI, replay o log del run) un target non riconosciuto invece di scartarlo in silenzio.

**Accettazione.** L'esempio ufficiale, copiato, mostra l'errore sotto il campo; un target inesistente produce un avviso diagnosticabile.

## 2. Errori invisibili nella review e segnale di intento

**Tipo:** bug riconosciuto e capacità mancante. **Canale:** risposta nel [thread 31931](https://community.shopify.dev/t/bug-cart-validation-functions-two-issues-blocking-migration-from-usebuyerjourneyintercept/31931), con riferimento al caso del supporto. **Prerequisito:** azione interna 2.

### 2.1 Review con conferma ordine attiva

Il thread è stato aperto il 5 marzo da un altro sviluppatore. Shopify lo ha riconosciuto come bug il 9 marzo; è stato sollecitato il 17 giugno e confermato da CF Ready il 30 luglio. Non risultano comunicazioni di correzione (documentato).

Il supporto ha dichiarato che lo step di conferma non monta, in nessun layout, le superfici dei messaggi dei localized field. Ha aggiunto che non esiste un fallback a banner né una soluzione in lavorazione e che l'identificativo interno non è condivisibile. La mitigazione D-146 anticipa gli errori a `CHECKOUT_INTERACTION`, ma non corregge il difetto. La review con conferma attiva non è stata più riprovata dopo luglio.

Esecuzione locale con Shopify CLI del 13 settembre, Function compilata dal codice corrente e consegna italiana selezionata: con CF vuoto o non valido, a `CHECKOUT_INTERACTION` la Function restituisce l'errore sotto il campo; con il campo assente, a Interaction non restituisce nulla e a `CHECKOUT_COMPLETION` restituisce `$.cart`. Nel checkout web dei negozi italiani il cliente non dovrebbe quindi arrivare alla review con un CF mancante o non valido. Resta scoperto il caso del campo non materializzato (negozi non italiani, alcuni wallet), in cui non è verificato se `$.cart` venga mostrato nella review.

**Richiesta.** Un errore bloccante deve essere sempre visibile e accessibile, anche quando il campo target non è montato: riepilogo globale e collegamento per tornare al campo, con i dati conservati.

### 2.2 Nessun segnale di tentativo di avanzamento

`BuyerJourney` espone soltanto `step`, con `CART_INTERACTION`, `CHECKOUT_INTERACTION` e `CHECKOUT_COMPLETION`; altri campi non sono interrogabili (schema verificato).

Il 31 luglio il supporto ha confermato che il segnale non esiste. Ha proposto la presenza della chiave come approssimazione, ammettendo però che scatta appena indirizzo e consegna sono risolti, prima che il cliente compili il campo, e che senza un segnale di intento i tempi nativi non sono raggiungibili. La ricevuta dell'8 settembre lo conferma dal vivo: dopo l'inserimento di un indirizzo italiano, Shopify ha preselezionato l'unica spedizione e l'errore "obbligatorio" è comparso subito. Lo stesso thread descrive il problema dal 10 marzo: `CHECKOUT_INTERACTION` arriva troppo presto, `CHECKOUT_COMPLETION` troppo tardi.

**Richiesta.** Un segnale esplicito di tentativo di avanzamento o di invio, oppure una semantica nativa "mostra il campo obbligatorio dopo il primo tentativo", lasciando a `CHECKOUT_COMPLETION` il blocco finale.

**Accettazione.** Nessun errore di obbligatorietà al primo caricamento né alla sola preselezione della spedizione. Errore al primo tentativo di proseguire, con lo stesso comportamento in one-page e three-page, con conferma attiva e disattiva, su desktop e mobile, in italiano e inglese.

## 3. Campi fiscali nel checkout: comparsa, input Function e recupero

**Tipo:** contratto da chiarire e capacità. **Canale:** seguito del caso Developer Support, poi feature request pubblica. **Prerequisiti:** azione interna 3; l'azione interna 1 è rinviata.

### 3.1 Condizioni di comparsa e negozi non italiani

Dichiarato dal supporto:

- i localized field si popolano dopo la risoluzione di destinazione e origine;
- l'origine deriva dalle sedi dell'opzione di consegna selezionata;
- Paese del negozio, destinazione e origine si combinano;
- l'attivazione per singolo negozio è stata rimossa (3 agosto).

Il 3 agosto il supporto ha scritto di non poter confermare che basti la destinazione italiana: è possibile che `TAX_CREDENTIAL_IT` compaia solo nei negozi con sede in Italia. Ha raccomandato una prova con negozio tedesco e destinazione italiana e, se il campo non compare, due opzioni: limitare l'app ai negozi italiani oppure aggiungere un controllo sul Paese del negozio. Ha portato la domanda nell'escalation promettendo un aggiornamento, da verificare. D-143 (4 settembre) ha poi rimosso il gate sul Paese del negozio, mentre la prova risulta ancora da eseguire (open item 7). Le fonti pubbliche non sono coerenti. La Localized Fields API lega la disponibilità alla configurazione del merchant per il Paese dell'acquirente (documentato). In un [thread su `TAX_CREDENTIAL_ES`](https://community.shopify.dev/t/how-do-i-enable-the-checkout-input-field-for-localizedfield-tax-credential-es-in-a-store/34495) Shopify parla invece di accesso anticipato per singolo negozio.

Per CF Ready il punto è decisivo dopo D-143 (vedi il rischio in sintesi). Senza consegna osservabile, come per digitale e ritiro, la Function controlla soltanto i campi presenti. Quindi nemmeno lì è noto se il cliente possa compilarli.

**Richiesta.** Una matrice ufficiale delle condizioni di comparsa di `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`, per Paese del negozio, destinazione, origine, tipo di consegna (spedizione, ritiro, digitale) ed eventuali accessi. In più, la lettura dell'applicabilità dall'Admin API, senza scope su clienti o ordini.

### 3.2 Input della Function

Schema verificato `2026-07`:

- `Shop` non ha un campo Paese: `countryCode` non è interrogabile, restano ora locale e metafield;
- `LocalizedField` espone `key`, `title` e `value`, senza stato di obbligatorietà o applicabilità;
- `localization.country` è il Paese per cui è personalizzato il checkout, non la sede del negozio.

Un array vuoto non distingue quindi un campo "non ancora risolto", "non applicabile" o "non raccoglibile".

**Richiesta.** Per ogni chiave richiesta, stato di applicabilità e motivo dell'assenza nell'input; in subordine, il Paese del negozio.

### 3.3 Recupero nei wallet

La Validation vale anche per i checkout accelerati (documentato). Il supporto ha confermato il 31 luglio che la Function viene eseguita prima della creazione dell'ordine anche nei wallet.

Il 10 marzo, nel [thread 31935](https://community.shopify.dev/t/bug-cart-validation-functions-apple-pay-google-pay-shows-unhelpful-validation-error-on-product-cart-page/31935), Shopify ha precisato un limite. Il ritorno al checkout per correggere esiste solo per Apple Pay nel checkout one-page, non per Google Pay né partendo da pagina prodotto o carrello. Il thread è aperto, con ultimo post del 17 giugno.

**Richiesta.** Lo stesso percorso di recupero per tutti i wallet e i punti di ingresso, quando l'errore riguarda un localized field o `$.cart`.

**Accettazione.** Ogni blocco per campo mancante porta a un punto in cui il cliente può compilarlo; i contesti senza campo applicabile sono distinguibili da quelli ancora incompleti.

## 4. API di configurazione del checkout

**Tipo:** capacità. **Canale:** feature request su community.shopify.dev, area Admin API e localizzazione. **Prerequisiti:** nessuno.

### 4.1 Testi sorgente nella lingua principale

CF Ready gestisce in automatico soltanto CF e PEC nella traduzione globale `en` non principale. Il testo sorgente è in sola lettura e gli altri contesti sono guidati ([domain.ts:192](../../../app/checkout-labels/domain.ts#L192)). Per un negozio con italiano come lingua principale, l'etichetta italiana non è modificabile via API.

Le chiavi sono contenuto dei file di lingua del tema (`ONLINE_STORE_THEME_LOCALE_CONTENT`). L'unico percorso individuato per cambiare il testo sorgente è `themeFilesUpsert` con `write_themes`, cioè una modifica al tema, fuori dal perimetro di CF Ready (schema verificato).

**Richiesta.** Lettura e scrittura del testo sorgente delle sole chiavi checkout pertinenti, con scope dedicato, senza cambiare lingua principale o tema.

### 4.2 Testo effettivo per lingua e mercato

Esistono `TranslationInput.marketId` e `marketLocalizationsRegister`, ma nessuna API restituisce il testo che il cliente vede, con l'origine dell'eventuale fallback. CF Ready ricostruisce il contesto da lingue, presenze web e override, e lascia guidati i casi ereditati o ambigui. Per trovare le quattro chiavi deve inoltre scorrere tutte le risorse `ONLINE_STORE_THEME_LOCALE_CONTENT`.

**Richiesta.** Una query per chiave, lingua e mercato che restituisca testo risolto, origine, possibilità di scrittura e revisione, più la matrice ufficiale degli override validi per le chiavi checkout.

### 4.3 Impostazioni del modulo: "Interno" e conferma ordine

Open item 8: Shopify non espone l'opzione obbligatorio, facoltativo o nascosto della seconda riga dell'indirizzo, quindi il merchant la dichiara a mano. Nella documentazione Admin (ricerca MCP) non risulta un percorso né per questa opzione né per l'impostazione "Require a confirmation step" (Settings > General > Order processing), da cui dipende il bug del punto 2 (non individuato).

**Richiesta.** Lettura pubblica delle opzioni del modulo checkout e dello step di conferma; la scrittura non serve.

### 4.4 Scritture protette sulle traduzioni

Schema verificato: `metafieldsSet` accetta `compareDigest`, `TranslationInput` no. Il `translatableContentDigest` riguarda il contenuto sorgente, non la traduzione esistente. Resta quindi una finestra, tra lettura e scrittura, in cui CF Ready potrebbe sovrascrivere una modifica fatta nel frattempo con Translate & Adapt.

**Richiesta.** Compare-and-set su risorsa, chiave, lingua e mercato per `translationsRegister` e `translationsRemove`.

### 4.5 Eventi

Documentato: non esistono topic webhook per Validation, traduzioni o impostazioni del checkout. Esistono `LOCALES_*` e `MARKETS_*`, che oggi CF Ready non sottoscrive (azione interna 4).

**Richiesta.** Topic per le modifiche alle traduzioni delle chiavi checkout, allo stato della propria Validation e alle impostazioni del modulo.

**Accettazione.** Un merchant con italiano principale completa l'onboarding senza passaggi manuali su etichette e "Interno"; una modifica concorrente produce un conflitto e resta intatta.

## 5. Dati fiscali nativi oltre CF e PEC

**Tipo:** capacità. **Canale:** feature request, area Checkout e Tax. **Motivazione:** D-005, D-006 e Master Plan §5.3. P. IVA e SDI sono esclusi perché non hanno un percorso nativo equivalente ai due localized field su tutti i piani: servirebbero tema, carrello o estensioni Plus.

### 5.1 Partita IVA anche per vendite nazionali

Documentato: il campo VAT number di Shopify Tax

- compare solo per vendite transfrontaliere UE/UK idonee al reverse charge;
- ha soltanto le opzioni "Don't include" e "Optional";
- richiede Shopify Tax;
- non è disponibile nei checkout B2B dedicati;
- salva il valore nel profilo cliente.

Non è documentato un accesso da API o Function. Per il B2B esiste `CompanyLocation.taxSettings.taxRegistrationId` (schema verificato, `read_companies`), legato alla company e non a un acquisto guest.

**Richiesta.** Un localized field italiano dedicato alla P. IVA, distinto dal CF, con queste proprietà:

- disponibile anche per vendite Italia/Italia;
- configurabile come obbligatorio;
- leggibile dalla Function e usabile come target di errore;
- salvato nell'ordine;
- raccolto indipendentemente dall'esenzione IVA.

### 5.2 Codice Destinatario SDI

Documentato e schema verificato: per l'Italia `LocalizedFieldKey` contiene soltanto `TAX_CREDENTIAL_IT` e `TAX_EMAIL_IT`.

**Richiesta.** Una chiave dedicata con le stesse proprietà di 5.1. Le regole tra PEC e SDI restano una scelta del merchant; la trasmissione allo SDI è fuori da questa richiesta.

### 5.3 Obbligatorietà condizionale e intestazione dell'acquisto

Oggi CF Ready rende la PEC obbligatoria quando il campo Azienda è compilato (`required_when_company`), ma solo lato server. Il modulo non mostra l'obbligatorietà e l'errore arriva con i tempi descritti al punto 2.

**Richiesta.** Un'obbligatorietà dichiarata dall'app su un localized field, anche condizionata a un altro campo, con indicatore, accessibilità e tempi nativi. Eventualmente, un'indicazione esplicita di acquisto aziendale o fattura richiesta, leggibile dalla Function e distinta da esenzione IVA e consenso marketing.

**Accettazione.** Vendita Italia/Italia con P. IVA e SDI obbligatori, come guest e come cliente autenticato, con errori inline e dati presenti in `Order.localizedFields` (schema verificato, `read_orders`), senza effetti sul calcolo delle imposte.

## Domande secondarie

Vanno poste come domande, senza presentarle come lacune dimostrate.

**D1 — Verifiche esterne.** Documentato: il target `fetch` della Validation è limitato alle custom app su store Enterprise e le public app non sono previste. Domanda: esiste, o è prevista, una via per le public app, come accesso di rete o attestazioni gestite dalla piattaforma? Le fonti italiane (Agenzia delle Entrate, registri PEC) restano comunque esterne a Shopify.

**D2 — Superfici non coperte.** Documentato: la Validation non supporta Create Order API, Order Edit (Admin e Checkout), POS, Pre-order e Try Before You Buy, né gli ordini ricorrenti degli abbonamenti. Domanda: quali hook alternativi o piani esistono per applicare le stesse regole, e quale parità è prevista per storefront headless e checkout agentici?

**D3 — Log dei run ed esiti aggregati.** Documentato: i dettagli dei run nel Dev Dashboard includono input e output, la visibilità dipende dagli scope e staff e collaboratori vedono tutto. L'input contiene i valori di CF e PEC, come registra anche il runbook di diagnosi. Non individuati: oscuramento per campo e API di esiti aggregati. Richiesta: oscurare i localized field sensibili nei log, fornire conteggi per regola e target senza valori e codici di errore stabili oltre al messaggio.

**D4 — Accesso API B2B.** Documentato: dal 2 aprile 2026 le principali funzioni B2B sono disponibili sui piani Basic, Grow e Advanced. La guida sviluppatori afferma però ancora che solo dev store, Plus Partner e affiliati accedono alle risorse B2B dell'Admin API. Domanda: una public app può leggere company e `taxRegistrationId` sui piani non Plus?

## Azioni interne prima degli invii

1. **Store non italiano (rinviata dall'owner il 13 settembre).** Verificare su un dev store con sede fuori dall'Italia se `TAX_CREDENTIAL_IT` compare con consegna italiana, spedizione, ritiro e digitale. Se non compare, decidere lato prodotto come evitare il blocco senza campo (D-143, open item 7). Serve prima dell'invio 3.
2. **Riproduzione della review (sospesa finché Claude in Chrome non è ricollegato).** Su `cf-ready-dev.myshopify.com` attivare la conferma ordine e ripetere one-page e three-page, in italiano e inglese, con dati sintetici e ID dei run. Cambiare un'impostazione dello store richiede l'autorizzazione dell'owner. Serve prima dell'invio 2.
3. **Matrice wallet.** Apple Pay e Google Pay dal checkout, dalla pagina prodotto e dal carrello, dove disponibili. Serve prima dell'invio 3.
4. **Webhook già disponibili.** Valutare `LOCALES_UPDATE` e `MARKETS_UPDATE` per ridurre le riletture delle etichette; non dipende da Shopify.
5. **Strumenti.** `shopify-dev-mcp` non si avviava perché il `.npmrc` del progetto imposta `strict-allow-scripts=true`. `.mcp.json` e `.codex/config.toml` lo avviano ora con `npx --ignore-scripts`.

## Appendice: costruibile oggi, da non chiedere a Shopify

Le voci senza "schema verificato" riprendono le fonti della prima stesura.

| Scheda della prima stesura | Perché resta interna |
| --- | --- |
| R14 profili fiscali riutilizzabili | metafield cliente, account extensions e capacità `cartToOrderCopyable` esistono; è lavoro di prodotto |
| R19 correzione dopo l'acquisto | `orderUpdate` accetta `localizedFields` (schema verificato, `write_orders`) |
| R20 fatturazione e gestionali | `Order.localizedFields` è leggibile (schema verificato, `read_orders`) e i webhook ordine esistono |
| R21 altri Paesi | l'enum contiene già identificativi di altri Paesi e i validatori sono nostri; la parità dei canali è in D2 |
| R22 automazioni Flow | trigger e azioni delle app esistono; manca soltanto l'esito della Function, trattato in D3 |
| R23 permessi granulari | protected customer data e scope esistono; nessun blocco dimostrato |
| R24 importazione massiva | bulk operations e metafield coprono il bisogno |
| N03 autodiagnosi ufficiale del checkout | idea valida, da proporre dopo gli invii 3 e 4 |

## Corrispondenza con la prima stesura

| Prima stesura | Ora |
| --- | --- |
| R01, R03 | 2.1, 2.2 |
| R02 | 1 |
| R04, N02 | 3.1–3.3 |
| R05–R09 | 4.1–4.5 |
| R10, N04 | D3 |
| R11, R12, R13, N01 | 5.1, 5.2, 5.3 |
| R15 | D1 |
| R16–R18 | D2 |
| R25 | D4 |
| R14, R19–R24, N03 | appendice (R21 anche D2) |

Rimossi su decisione dell'owner del 13 settembre: pricing, listing, commissioni, BFS e strumenti interni. Rimossi perché non pertinenti per Shopify: dettagli sullo stato del checkout locale.

## Fonti

Progetto:

- [Master Plan](../../../docs/plans/2026-07-28-CF-Ready-Master-Plan.md): §5.2–5.3, D-005, D-006, D-143, D-146, D-149, open items 7 e 8;
- [rendering checkout e risposte del supporto](../../../docs/evidence/2026-07-29-checkout-validation-rendering.md);
- [validazione automatica dell'8 settembre](../../../docs/evidence/2026-09-08-checkout-validation-automatic.md);
- [matrice etichette del 9 settembre](../../../docs/evidence/2026-09-09-checkout-labels-capability-matrix.md) e [ADR etichette native](../../../docs/adr/0003-native-checkout-labels.md);
- [runbook di diagnosi dei run](../../../docs/runbooks/function-run-diagnosis.md), [query della Function](../../../extensions/cf-ready-validation/src/cart_validations_generate_run.graphql), [webhook sottoscritti](../../../shopify.app.toml).

Shopify:

- [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation) e [Localized Fields API](https://shopify.dev/docs/api/checkout-ui-extensions/2026-07/target-apis/checkout-apis/localized-fields-api);
- [LocalizedFieldKey](https://shopify.dev/docs/api/admin-graphql/latest/enums/LocalizedFieldKey), [WebhookSubscriptionTopic](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic);
- [network access](https://shopify.dev/docs/apps/build/functions/network-access), [monitoraggio dei run](https://shopify.dev/docs/apps/build/functions/monitoring-and-errors);
- [VAT validation](https://help.shopify.com/en/manual/taxes/shopify-tax/vat-validate), [B2B per piano](https://help.shopify.com/en/manual/b2b/getting-started/plan-features), [annuncio B2B del 2 aprile 2026](https://www.shopify.com/news/b2b-for-all), [Apps and B2B](https://shopify.dev/docs/apps/build/b2b);
- [opzioni del modulo checkout](https://help.shopify.com/en/manual/checkout-settings/checkout-form-options).
