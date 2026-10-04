# Audit grafico di CF Ready 2.0 con Polaris 2 (Claude)

**Stato:** audit concluso; findings ricontrollati in Chrome il 4 ottobre 2026 su Development 2.0.7. Correzioni nelle sezioni 19 e 20; verifica per ID, prove nuove e limiti nella sezione 21. Restano 7 risolti, 9 parziali, 30 aperti e 4 accettati per decisione.
**Data:** 3 ottobre 2026, circa 20:30-21:45 CEST, compresi il ricontrollo e la prova della conferma etichette
**Ambiente:** Development, `cf-ready-polaris-2.myshopify.com` (preview
`new_admin_design`), app `cf-ready-development`
**Codice di riferimento:** `develop` a `e68cac8` (`package.json` 2.0.4). La
versione live non è stata letta dalla diagnostica (sezione 16)
**Strumento:** Chrome con la sessione Admin dell'owner, scheda visibile, a
1440, 1054 e 500 px reali
**Metodo:** [audit di Claude del 1 ottobre](2026-10-01-audit-ui-ux-production.md)
**Prove:** [evidence/2026-10-03-polaris-2-claude](evidence/2026-10-03-polaris-2-claude)

## 1. Metodo e perimetro

Il fuoco è la resa grafica dell'intera app nel nuovo Admin, non solo ciò che
la migrazione a Polaris 2 ha cambiato: box, spaziature, colori, tipografia,
gerarchia dei titoli, badge, bottoni, icone, testi e armonia con le pagine
native. Le funzioni esistenti non sono state valutate. I salvataggi sono
serviti solo a far comparire stati visivi (toast, save bar, badge, conferme,
pannelli); i difetti funzionali notati di passaggio stanno in una riga ciascuno
nella sezione 14.

Tre giri, come il 1 ottobre:

1. osservazione delle quattro pagine e dell'onboarding nello stato iniziale;
2. interazioni senza scritture: pannelli, disclosure, simulatore, FAQ,
   diagnosi, bozza delle regole poi scartata;
3. scritture temporanee con ripristino: regole, attivazione, messaggi,
   lingua del profilo (sezione 15).

Un ricontrollo finale ha confrontato ogni finding con la propria cattura e con
il codice, ha cercato le superfici non aperte (sezione 16) e ha corretto le
misure non confermate.

Le misure sono in px CSS, lette da screenshot a 1:1 e da ingrandimenti. Il
documento dell'app è un iframe cross-origin: niente letture DOM interne, quindi
le misure hanno una tolleranza di circa 2 px. Le cause indicate nel codice sono
state verificate su `e68cac8`.

Severità: **Alta** confonde un flusso con effetti sul checkout; **Media**
degrada chiarezza o coerenza in modo evidente; **Bassa** è rifinitura. La
confidenza indica quanto il problema è dimostrato dalle prove.

## 2. Criteri Polaris 2 e confronto nativo

Fonti consultate il 3 ottobre:

- [Guida Polaris 2](https://shopify.dev/docs/apps/build/app-home/polaris2):
  tutto ciò che Polaris non controlla resta com'è, e i valori CSS copiati dai
  vecchi token restano ancorati alla vecchia palette; gli elementi fissi in basso
  devono rispettare `--shopify-safe-area-inset-bottom`.
- [Layout](https://shopify.dev/docs/apps/design/layout): griglia a 4 px,
  contenuti dentro contenitori, al massimo un'azione primaria per card, densità
  costante nella stessa pagina.
- [Visual design](https://shopify.dev/docs/apps/design/visual-design): verde
  solo per stati positivi o completati, arancione per attenzione non
  bloccante, rosso solo per blocchi o errori; gerarchia data da dimensione e
  peso; icone coerenti negli elenchi ripetuti.

Confronto con le pagine native dello stesso store:

| Elemento | Admin nativo | CF Ready | Esito |
| --- | --- | --- | --- |
| Colonna laterale | Scheda prodotto: sezioni senza card, titoli grigi, divisori sottili ([03](evidence/2026-10-03-polaris-2-claude/03-nativo-prodotto-aside.jpg)) | Stesso modello in Home, Messaggi, Guida | Coerente |
| Titolo di pagina | Grande titolo nel contenuto, colonna laterale allineata a esso | Titolo solo nella barra Admin; la colonna laterale parte 25 px sopra il primo titolo di sezione | P2-T2 |
| Sezioni impostazioni | Titolo e descrizione fuori dalla card, card bianca ([04](evidence/2026-10-03-polaris-2-claude/04-nativo-impostazioni-checkout.jpg)) | Titoli fuori dalla card in tre pagine su quattro | P2-T3 |
| Badge di stato | «Attivo» verde, «Novità» neutro | Ciano per regole configurate, verde per «Può comparire» | P2-T4 |
| Save bar, toast, modali | Nativi | Nativi in tutte le pagine | Coerente |
| Nome della pagina impostazioni | «Check-out» | «Impostazioni → Checkout» | R-10 |

## 3. Priorità

La matrice per ID della sezione 21 è il riferimento aggiornato per gli stati
di chiusura, riportati anche nella colonna **Stato attuale** delle tabelle.
Le descrizioni conservano il problema iniziale; prove e limiti successivi
sono in §21. **Risolto** indica chiusura comprovata, **Parziale** una parte
ancora incompleta, **Aperto** assenza di chiusura completa e **Accettato per
decisione** una scelta conservata. Positivi e informativi non sono difetti.

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| H-5 | Badge verde «Attiva» con nessun campo configurato | Media | Alta | **Aperto** |
| P2-T4 | Toni dei badge non semantici: ciano identico al banner commerciale, verde per una possibilità | Media | Alta | **Parziale** |
| R-1 | In Regole la colonna destra resta vuota per almeno tre schermate quando si apre «Testi del checkout» | Media | Alta | **Parziale** |
| R-2 | Simulatore con due fondi non tematizzati nello stesso riquadro | Media | Alta | **Accettato per decisione** |
| H-2 | Azioni della card principale: primario e critico si scambiano posto e peso al cambio di stato | Media | Alta | **Aperto** |
| P2-T1 | Tre larghezze e griglie di pagina diverse: il bordo sinistro si sposta di 61 px tra Home e Regole | Media | Alta | **Accettato per decisione** |
| P2-T3 | Gerarchia dei titoli incoerente tra pagine e dentro simulatore e onboarding | Media | Alta | **Parziale** |
| M-1, N-1 | Esempi dei messaggi indistinguibili dai campi di testo a 500 px; un campo nativo in sola lettura con errore li renderebbe fedeli al checkout | Media | Alta | **Aperto** |
| N-2 | Il confronto tra etichetta attuale e nuova è una griglia CSS che spezza le citazioni; `s-table` lo risolve in modo nativo | Media | Alta | **Aperto** |
| R-6, R-7 | Pannello etichette: righe valore mal raggruppate, citazioni spezzate, doppio badge con stati opposti | Media | Alta | **Parziale** |
| G-2, G-3 | FAQ senza gerarchia domanda-risposta; risultati della diagnosi poco leggibili | Media | Alta | **Aperto** |

## 4. Problemi trasversali

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| P2-T1 | Tre impianti di pagina. Home, Messaggi e Guida usano `s-page` con colonna laterale (contenuto da x 284, colonna principale 760 px, laterale 280 px). Regole usa una griglia custom 50/50 senza colonna laterale (`RulesLayout.css:127`, contenuto da x 345, due colonne da 476 px). L'onboarding usa `inlineSize="small"` (card 785 px, da y 75 invece di 113). Passando da una pagina all'altra il bordo sinistro si sposta di 61 px, e nell'onboarding la prima riga sta 38 px più in alto che altrove. Prove [01](evidence/2026-10-03-polaris-2-claude/01-home-disattivata-1440.jpg), [05](evidence/2026-10-03-polaris-2-claude/05-regole-iniziale-1440.jpg), [19](evidence/2026-10-03-polaris-2-claude/19-onboarding-passo-1.jpg) | Media | Alta | **Accettato per decisione** |
| P2-T2 | Colonna laterale non allineata. In Home, Messaggi e Guida il primo titolo laterale («Piano», «Messaggi collegati alle regole», «Assistenza») sta a y 88 e il titolo della prima sezione a y 113. Nella scheda prodotto nativa la colonna laterale è allineata al titolo di pagina, che in CF Ready non c'è nel contenuto | Bassa | Alta | **Accettato per decisione** |
| P2-T3 | Gerarchia dei titoli incoerente. I titoli di sezione stanno fuori dalla card in Home, Regole, Messaggi e FAQ, ma dentro la card in «Il controllo non compare?» ([16](evidence/2026-10-03-polaris-2-claude/16-guida-diagnosi-card.jpg)), nei passi dell'onboarding e nel simulatore. Nell'onboarding «Benvenuto in CF Ready» è più leggero di «Cosa fa e cosa non fa». Nel simulatore i titoli di gruppo con icona hanno peso normale e le etichette dei campi sono semibold. I sottotitoli laterali sono semibold in Guida («Dove si configura») e quasi uguali alle righe in Messaggi («Codice Fiscale», «PEC») | Media | Alta | **Parziale** |
| P2-T4 | Toni dei badge non semantici. «Obbligatorio e validato» e «Obbligatoria per aziende» sono ciano saturo, lo stesso tono del banner della prova, anche con validazione disattivata ([29](evidence/2026-10-03-polaris-2-claude/29-home-regole-salvate-disattivata.jpg)). «Può comparire» è verde ([32](evidence/2026-10-03-polaris-2-claude/32-messaggi-puo-comparire.jpg)), ma descrive una possibilità, non un esito positivo. «Aggiornati» verde convive con «Da configurare» arancione nello stesso pannello ([08](evidence/2026-10-03-polaris-2-claude/08-regole-testi-checkout-da-configurare.jpg)). «Consigliato» è neutro e non dà rilievo al piano annuale | Media | Alta | **Parziale** |
| P2-T5 | Logo in quattro forme. Lockup da 130 px centrato in fondo alla colonna laterale della Home, mentre i testi sopra sono allineati a sinistra. Lockup da circa 160 px a sinistra sotto un titolo grigio in Guida. `s-avatar` con la favicon e un quadrato crema attorno nel simulatore e nell'onboarding | Bassa | Alta | **Risolto** |
| P2-T6 | Virgolette miste in italiano. «» per le etichette Shopify, ma “ ” in «Nel campo “Interno”», «Controllo di “Interno”», nella procedura manuale («“Campo dopo il salvataggio”») e nella FAQ «Come devo gestire il campo “Interno”?». La decisione T7 del 1 ottobre ha scelto «» | Bassa | Alta | **Risolto** |
| P2-T7 | Ripetizioni che appesantiscono la pagina. «Nessun campo è configurato: il checkout resta invariato.» compare due volte nella stessa card di Regole. Il paragrafo «Le regole si applicano alle consegne in Italia…» è identico in Home, simulatore e onboarding (passi 1 e 3). A 500 px la nota «L'esempio mostra il testo del messaggio…» compare cinque volte in Messaggi. Nel passo 3 «Con le regole attuali questo messaggio non compare» si ripete quattro volte accanto al badge «Non compare», che dice la stessa cosa | Media | Alta | **Aperto** |
| P2-T8 | Raggruppamento per vicinanza assente. Nel pannello etichette le righe «Campo attuale» e «Campo dopo il salvataggio» distano 16 px tra loro e 16 px dal campo successivo. Nei risultati della diagnosi testo, link e risultato seguente sono equidistanti (16 px). Nel passo 2 dell'onboarding «Codice Fiscale» sta 40 px sopra i suoi radio e 38 px sotto il gruppo precedente | Media | Alta | **Parziale** |
| P2-T9 | Disclosure custom disallineati. Il chevron di «Come completare la verifica manuale» sta 16 px più a sinistra di quelli del pannello che lo contiene (x 762 contro 778). Nel simulatore «Quando si applicano» e «Opzioni avanzate» partono dall'icona (x 853) e non dal testo del gruppo (x 885). I chevron sono disegnati in CSS con bordi da 1,5 px, mentre select e controlli nativi usano le icone Polaris | Bassa | Alta | **Risolto** |

### 4.1 Componenti da sostituire con alternative native

Il catalogo di riferimento e l'inventario dei componenti custom sono nella
sezione 18. Queste tre sostituzioni risolvono problemi osservati; la loro resa
nel nuovo Admin non è ancora stata provata.

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| N-1 | Gli esempi di errore in Messaggi e nel passo 3 dell'onboarding sono box custom (`CustomerMessagesPreview.css`, classe `.customer-messages-preview__error`): testo rosso in un riquadro bianco bordato, che non somiglia al checkout e su mobile si confonde con i campi modificabili (M-1, O-4). Polaris 2 offre `s-text-field` con `readOnly` ed `error`: con `label` uguale all'etichetta Shopify attuale e `error` uguale al messaggio, riproduce campo ed errore in linea come nel checkout reale, senza CSS. Da provare che il campo in sola lettura non sembri modificabile e che l'errore resti rosso | Media | Alta sul problema, Media sulla resa | **Aperto** |
| N-2 | Il confronto «Campo attuale / Campo dopo il salvataggio» è una griglia CSS (`.checkout-label-context__row`, `RulesLayout.css`) con una colonna valori di circa 270 px: spezza le citazioni a metà, non separa i campi e ripete le etichette su ogni riga (R-6, P2-T8). `s-table` con colonne Campo, Attuale, Dopo il salvataggio allinea i valori, separa le righe in modo nativo e su mobile diventa da sola un elenco chiave-valore (`variant="auto"`) | Media | Alta sul problema, Media sulla resa | **Aperto** |
| N-3 | Nel simulatore e nel passo 1 dell'onboarding il logo è un `s-avatar` con la favicon: il componente è pensato per persone e aggiunge un fondo chiaro attorno al marchio (R-5). `s-image` a dimensione fissa, come il lockup della Home, mostra il logo senza fondo e unifica il trattamento (P2-T5) | Bassa | Alta | **Risolto** |

## 5. Home

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| H-1 | Nella card principale il banner della prova è seguito da 33 px vuoti prima del divisore, che dista poi 25 px dalla prima riga. La data della prova compare tre volte nella prima schermata: banner, colonna laterale e testo «primo addebito il 17 ottobre» ([01](evidence/2026-10-03-polaris-2-claude/01-home-disattivata-1440.jpg), [02](evidence/2026-10-03-polaris-2-claude/02-home-piani-1440.jpg)) | Media | Alta | **Parziale** |
| H-2 | Da disattivata «Modifica regole» è secondario a sinistra e «Attiva nel checkout» primario a destra. Da attiva «Modifica regole» diventa primario a sinistra e «Disattiva nel checkout» compare a destra in rosa critico, con lo stesso peso visivo. Il primario cambia posizione e l'azione distruttiva diventa la più evidente dopo il primario ([30](evidence/2026-10-03-polaris-2-claude/30-home-attiva.jpg)) | Media | Alta | **Aperto** |
| H-3 | Righe campo-stato: la colonna delle etichette si adatta al testo più lungo, da «Messaggi al cliente» in italiano a «Italian tax code (Codice Fiscale)» in inglese, senza tagli ([43](evidence/2026-10-03-polaris-2-claude/43-home-en-1440.jpg)) | Informativo | Alta | **Informativo** |
| H-4 | Card dei piani: il nome del piano è testo normale da 14 px sopra un prezzo da circa 24 px. Solo «Un solo pagamento» ha una riga descrittiva, quindi le tre righe hanno altezze diverse. Il periodo («al mese») sta 12 px dopo il prezzo. «Consigliato» è neutro mentre «Attiva l'annuale» è l'unico primario della card | Bassa | Media | **Aperto** |
| H-5 | Con validazione attiva e nessun campo configurato la card mostra il badge verde «Attiva» sopra «Nessun campo è configurato: il checkout resta invariato.» ([49](evidence/2026-10-03-polaris-2-claude/49-home-attiva-senza-campi-conferma.jpg)). Il verde comunica una protezione in corso che non esiste | Media | Alta | **Aperto** |
| H-6 | «Prossimo passo» cambia struttura con lo stato: link «Regole checkout» da disattivata, solo testo con regole pronte, «Apri gli ordini» da attiva. La colonna laterale cambia altezza e ritmo a ogni stato ([29](evidence/2026-10-03-polaris-2-claude/29-home-regole-salvate-disattivata.jpg)) | Bassa | Media | **Aperto** |

## 6. Regole checkout

### 6.1 Layout ed etichette

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| R-1 | La griglia 50/50 mette «Etichette del checkout» sotto le regole nella colonna sinistra ([06](evidence/2026-10-03-polaris-2-claude/06-regole-etichette-chiuse.jpg)). Con «Testi del checkout» e la procedura aperti la colonna sinistra si allunga per almeno tre schermate da 666 px e la destra resta bianca, perché il simulatore non è fisso ([26](evidence/2026-10-03-polaris-2-claude/26-regole-testi-da-verificare.jpg), [27](evidence/2026-10-03-polaris-2-claude/27-regole-procedura-manuale.jpg)) | Media | Alta | **Parziale** |
| R-6 | Righe valore del pannello: colonna valori di circa 270 px, quindi «Campo dopo il salvataggio: «Codice / fiscale»» va a capo dentro le virgolette. «Predefinito per questa lingua» fa da intestazione sia in «Campo Interno» (senza badge, con una riga «Facoltativo … «Interno, scala, ecc.»») sia in «Testi del checkout» (con badge), con significati diversi ([07](evidence/2026-10-03-polaris-2-claude/07-regole-campo-interno-aperto.jpg), [26](evidence/2026-10-03-polaris-2-claude/26-regole-testi-da-verificare.jpg)) | Media | Alta | **Parziale** |
| R-7 | Doppio badge: «Da verificare» nel sommario e di nuovo accanto a «Predefinito per questa lingua». Nello stato iniziale il sommario è «Da configurare» arancione e l'interno «Aggiornati» verde ([08](evidence/2026-10-03-polaris-2-claude/08-regole-testi-checkout-da-configurare.jpg), [09](evidence/2026-10-03-polaris-2-claude/09-regole-testi-checkout-dettagli.jpg)) | Media | Alta | **Parziale** |
| R-8 | Coda tecnica del pannello: «Modalità», «Ultima lettura» e il conteggio sono paragrafi semplici. «Rileggi i campi da Shopify» sta circa 10 px sotto il testo, contro i 16 px del resto. Il bottone disabilitato «Conferma verifica manuale» e «Mantieni le mie etichette» sono due secondari impilati di larghezze diverse sotto un banner giallo ([28](evidence/2026-10-03-polaris-2-claude/28-regole-banner-avviso-annidato.jpg)) | Bassa | Alta | **Aperto** |
| R-9 | Quattro livelli annidati (card, pannello bordato, disclosure, banner) e una procedura numerata di nove passi densi in una colonna da 410 px | Media | Media | **Aperto** |
| R-13 | Togliendo il controllo guidato compare un banner giallo dentro il pannello, sopra la spiegazione dei mercati: aggiunge una cornice colorata dentro card e pannello (R-9) e sposta tutto il contenuto di circa 100 px ([56](evidence/2026-10-03-polaris-2-claude/56-regole-avviso-disattivazione-guidato.jpg)) | Bassa | Alta | **Aperto** |
| R-10 | Il testo dice «Impostazioni → Checkout», ma nell'Admin italiano la pagina si chiama «Check-out» ([04](evidence/2026-10-03-polaris-2-claude/04-nativo-impostazioni-checkout.jpg)) | Bassa | Alta | **Aperto** |

### 6.2 Simulatore

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| R-2 | Due fondi nello stesso riquadro: verde `#f1f5ef` impostato inline (`CheckoutSimulator.tsx:154`) per la parte superiore e `s-box background="subdued"` grigio per «Prova uno scenario», senza separatore. Il riquadro vuoto «Nessun campo è configurato» è grigio su verde. Il verde è un valore fisso che non segue il tema, il caso che la guida Polaris 2 segnala ([05](evidence/2026-10-03-polaris-2-claude/05-regole-iniziale-1440.jpg), [12](evidence/2026-10-03-polaris-2-claude/12-simulatore-checkout-bloccato.jpg)) | Media | Alta | **Accettato per decisione** |
| R-3 | Gerarchia invertita: «Destinazione dell'ordine» e «Dati fiscali del cliente» (titoli con icona) hanno peso normale, «Paese di consegna» e «Codice fiscale» (etichette) sono semibold. «Prova uno scenario» è testo normale come le descrizioni | Media | Alta | **Aperto** |
| R-4 | «Continua» è un bottone custom (`#20492f`, raggio 9 px, 13 px, peso 650) accanto a «Svuota», che è Polaris: nella stessa riga convivono due sistemi di bottoni. Il verde imita il checkout ed è una scelta deliberata; il problema è l'accostamento | Bassa | Media | **Accettato per decisione** |
| R-5 | Il logo nell'intestazione è un `s-avatar` con la favicon: attorno al marchio compare un quadrato crema chiaro, visibile anche nel passo 1 dell'onboarding | Bassa | Media | **Risolto** |
| R-12 | Quando nelle opzioni avanzate Shopify non mostra il campo Codice Fiscale, il gruppo «Dati fiscali del cliente» resta con titolo e icona ma senza campi né spiegazione: subito sotto c'è la nota sulle etichette ([52](evidence/2026-10-03-polaris-2-claude/52-simulatore-gruppo-dati-fiscali-vuoto.jpg), [53](evidence/2026-10-03-polaris-2-claude/53-simulatore-opzioni-avanzate.jpg)) | Bassa | Alta | **Aperto** |
| R-11 | Errore in linea, focus sul campo, badge «Checkout bloccato» con icona e scorrimento automatico al campo funzionano e si leggono bene ([11](evidence/2026-10-03-polaris-2-claude/11-simulatore-errore-in-linea.jpg)) | Positivo | Alta | **Positivo** |

## 7. Messaggi al cliente

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| M-1 | L'esempio è un box bianco con bordo e testo rosso scuro, senza icona né campo: non somiglia né al checkout né a un errore Polaris. A 500 px gli esempi locali hanno sfondo, bordo e raggio identici ai campi di testo e si distinguono solo per il colore del testo ([39](evidence/2026-10-03-polaris-2-claude/39-messaggi-500-esempi-locali.jpg)) | Media | Alta | **Aperto** |
| M-2 | La nota «L'esempio mostra il testo del messaggio…» sta fuori dal riquadro grigio dell'esempio, tra esempio e campi, quindi non è chiaro a cosa si riferisca ([13](evidence/2026-10-03-polaris-2-claude/13-messaggi-top-1440.jpg), [14](evidence/2026-10-03-polaris-2-claude/14-messaggi-campi-1440.jpg)) | Bassa | Alta | **Aperto** |
| M-3 | Spaziatura interna del riquadro esempio non uniforme: lo spazio tra il titolo con l'icona e la prima riga è maggiore di quello tra le righe seguenti. «Messaggio selezionato» con badge ripete il nome del campo che ha il focus | Bassa | Media | **Aperto** |
| M-4 | Colonna laterale: quattro badge identici («Non compare» grigi oppure «Può comparire» verdi) con sottotitoli di peso simile alle righe; il blocco comunica poco a colpo d'occhio | Bassa | Media | **Parziale** |
| M-5 | La barra di Sidekick copre il campo in fondo mentre lo si modifica a 1440×666 ([51](evidence/2026-10-03-polaris-2-claude/51-messaggi-sidekick-sul-campo.jpg)). È un elemento dell'host; la pagina ha margine sufficiente solo a fine scorrimento | Bassa | Media | **Aperto** |

## 8. Guida e FAQ

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| G-1 | Le domande hanno un rientro di 6 px rispetto ai titoli di gruppo (x 306 contro 300); i divisori partono da 300 ([15](evidence/2026-10-03-polaris-2-claude/15-guida-top-1440.jpg)) | Bassa | Alta | **Aperto** |
| G-2 | La risposta ha peso, colore e dimensione della domanda; a 1440 px le righe arrivano a circa 120 caratteri ([18](evidence/2026-10-03-polaris-2-claude/18-guida-faq-espanse.jpg)) | Media | Alta | **Aperto** |
| G-3 | Risultati della diagnosi: l'icona informativa è nera mentre avvisi e successi sono colorati; tre link identici «Regole checkout»; ogni link è equidistante dal proprio testo e dal risultato seguente; l'elenco non è contenuto e non ha un riepilogo ([17](evidence/2026-10-03-polaris-2-claude/17-guida-diagnosi-risultati.jpg)) | Media | Alta | **Aperto** |
| G-4 | Assistenza: tre bottoni a tutta larghezza impilati in 280 px, con un primario nero molto pesante, poi un divisore e un bottone con lente per un salto interno. A 500 px la colonna laterale va in fondo, dopo la card di diagnosi, quindi quel salto porta verso l'alto ([40](evidence/2026-10-03-polaris-2-claude/40-guida-500-aside.jpg)) | Bassa | Media | **Aperto** |

## 9. Onboarding

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| O-1 | Gerarchia: «Benvenuto in CF Ready» è più leggero di «Cosa fa e cosa non fa». Nel passo 2 «Codice Fiscale» e «PEC» sono titoli di gruppo con peso normale, sotto «Scegli cosa controllare» semibold ([19](evidence/2026-10-03-polaris-2-claude/19-onboarding-passo-1.jpg), [20](evidence/2026-10-03-polaris-2-claude/20-onboarding-passo-2.jpg)) | Media | Alta | **Aperto** |
| O-2 | Divisore prima di «Campo Interno» ma non prima di «PEC» nello stesso passo | Bassa | Alta | **Aperto** |
| O-3 | Il riquadro «Etichette proposte» scrive «Italiano: Mantieni il testo attuale, Mantieni il testo attuale» senza nominare i campi ([21](evidence/2026-10-03-polaris-2-claude/21-onboarding-passo-2-fondo.jpg)) | Media | Alta | **Aperto** |
| O-4 | Passo 3: «Quando si applicano» è un elenco puntato con una sola voce; i quattro esempi sono box bianchi bordati su card bianca, diversi dal riquadro grigio di Messaggi ([22](evidence/2026-10-03-polaris-2-claude/22-onboarding-passo-3.jpg)) | Bassa | Alta | **Aperto** |
| O-5 | Passo 4: il riepilogo usa testo semplice per gli stessi stati che la Home mostra con badge; tre bottoni con il primario in mezzo ([23](evidence/2026-10-03-polaris-2-claude/23-onboarding-passo-4.jpg)) | Bassa | Alta | **Aperto** |
| O-6 | «Configurazione completata» ha il titolo fuori dalla card, mentre i passi lo hanno dentro; il bottone dice «Vai alla home» con l'iniziale minuscola ([24](evidence/2026-10-03-polaris-2-claude/24-onboarding-completata.jpg)) | Bassa | Alta | **Aperto** |

## 10. Conferme e feedback

| ID | Risultato | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| F-1 | Save bar, toast «Regole salvate.», «Messaggi salvati.», «Validazione attivata/disattivata nel checkout.» e le due finestre di conferma sono nativi, con critico rosso e annullamento neutro ([10](evidence/2026-10-03-polaris-2-claude/10-regole-bozza-save-bar.jpg), [25](evidence/2026-10-03-polaris-2-claude/25-regole-toast-salvate.jpg), [33](evidence/2026-10-03-polaris-2-claude/33-messaggi-toast-salvati.jpg), [31](evidence/2026-10-03-polaris-2-claude/31-home-conferma-disattivazione.jpg), [34](evidence/2026-10-03-polaris-2-claude/34-messaggi-conferma-ripristino.jpg)) | Positivo | Alta | **Positivo** |
| F-3 | Dopo un salvataggio con etichette da verificare compare in cima a Regole un banner di avviso a tutta larghezza, «Regole salvate. Le etichette richiedono attenzione.», con il bottone «Mostra le etichette» e 16 px di distacco dalle sezioni ([55](evidence/2026-10-03-polaris-2-claude/55-regole-banner-etichette-attenzione.jpg)). È coerente con la decisione T13 del 1 ottobre; il banner sparisce appena si apre una nuova bozza | Positivo | Alta | **Positivo** |
| F-4 | La finestra «Conferma etichette» (`AutomaticLabelsConfirmModal.tsx`) non compare in questo store: attivando il controllo guidato con Codice Fiscale obbligatorio, «Salva» scrive subito, perché con i mercati non univoci le etichette sono solo da verificare a mano e non ci sono scritture automatiche da confermare (`app.rules.tsx:244`). L'unico riscontro visivo del salvataggio è la barra di caricamento dell'Admin, poi il banner F-3 ([54](evidence/2026-10-03-polaris-2-claude/54-regole-salva-guidato-senza-conferma.jpg)). La resa della finestra resta non verificata | Informativo | Alta | **Informativo** |
| F-2 | Con una bozza aperta in Regole, un clic su «Messaggi al cliente» nella navigazione non produce cambiamenti visibili nello screenshot: la pagina resta e la save bar non cambia aspetto ([50](evidence/2026-10-03-polaris-2-claude/50-regole-navigazione-con-bozza.jpg)). Il clic è stato inviato via script sul link dell'Admin: l'eventuale scossa animata della save bar non è stata catturata | Bassa | Media | **Aperto** |

## 11. Responsive

- **500 px reali** (Chrome non scende sotto): nessuno scorrimento orizzontale
  osservato, colonne impilate, colonna laterale dopo il contenuto come nella
  scheda nativa ([35](evidence/2026-10-03-polaris-2-claude/35-home-500.jpg),
  [36](evidence/2026-10-03-polaris-2-claude/36-home-500-aside.jpg)).
- **RW-1** (Bassa, Media): la barra inferiore dell'host (menu e Sidekick,
  circa 100 px opachi) copre le azioni della card principale nella prima vista
  della Home. Sono raggiungibili scorrendo.
  **Stato attuale: Parziale** · Azioni visibili nello stato corrente a
  500×844 e 390×844; non copre ogni stato e altezza (§21).
- **RW-2** (Bassa, Media): in Regole il simulatore finisce dopo tutte le
  etichette ([38](evidence/2026-10-03-polaris-2-claude/38-regole-500-simulatore.jpg)).
  A 500 px il badge di «Testi del checkout» va su una riga propria senza tagli
  ([37](evidence/2026-10-03-polaris-2-claude/37-regole-500-etichette.jpg)).
  **Stato attuale: Risolto** · Simulatore prima delle etichette, riconfermato
  a 500 px (§21).
- **1054 px**: Home e Regole tengono le due colonne; il riquadro della località
  in Home va su quattro righe in una card da 440 px
  ([41](evidence/2026-10-03-polaris-2-claude/41-home-1054.jpg),
  [42](evidence/2026-10-03-polaris-2-claude/42-regole-1054.jpg)).
- Nella finestra a 500 px compaiono anche M-1 e P2-T7.

## 12. Inglese

Profilo salvato temporaneamente in English; percorse Home, Regole, Messaggi e
Guida a 1440 px. Nessun testo italiano residuo nell'app; la cornice Admin
mantiene alcune voci nella lingua precedente per cache.

| ID | Problema | Severità | Confidenza | Stato attuale |
| --- | --- | --- | --- | --- |
| EN-1 | Titolo «How you want to continue»: sgrammaticato come titolo; per esempio «How do you want to continue?» o «Choose how to continue» ([44](evidence/2026-10-03-polaris-2-claude/44-home-en-piani.jpg)) | Bassa | Alta | **Aperto** |
| EN-2 | Badge «Set up required»: come sostantivo è «Setup required» ([45](evidence/2026-10-03-polaris-2-claude/45-regole-en-etichette.jpg)) | Bassa | Alta | **Aperto** |
| EN-3 | Lo stesso campo ha tre nomi: «Italian tax code (Codice Fiscale)» in Home e Regole, «Tax code» nella colonna laterale e nel badge di Messaggi ([46](evidence/2026-10-03-polaris-2-claude/46-messaggi-en.jpg)) | Bassa | Media | **Risolto** |
| EN-4 | «Frequently asked questions» completo; etichette lunghe senza troncamenti ([47](evidence/2026-10-03-polaris-2-claude/47-guida-en.jpg)) | Positivo | Alta | **Positivo** |

## 13. Aspetti riusciti

- Card, ombre, raggi, font, primari neri e controlli seguono il nuovo Admin
  nelle parti costruite con i componenti Polaris.
- La colonna laterale senza card coincide con il modello della scheda prodotto
  nativa.
- Radio con descrizioni, select, save bar, toast e modali sono nativi e
  coerenti tra le pagine.
- I titoli di sezione fuori dalla card, in tre pagine su quattro, seguono le
  impostazioni native.
- Il simulatore dà un esito chiaro (badge con icona, errore in linea, focus).

## 14. Note funzionali di passaggio

Non valutate oltre, una riga ciascuna:

- La validazione si può attivare e risulta «Attiva» con entrambi i campi non
  gestiti (H-5 ne descrive la resa).
- In Messaggi l'esempio mostra l'etichetta Shopify «Codice fiscale (opzionale)»
  accanto all'errore di campo obbligatorio, perché le etichette non sono state
  aggiornate dopo il salvataggio delle regole.
- Con una bozza aperta, la navigazione dall'Admin resta ferma (F-2).
- L'attivazione del controllo guidato delle etichette si salva senza conferma
  quando non ci sono scritture automatiche (F-4).

## 15. Stato dello store dopo i test

Stato iniziale e finale coincidono: validazione disattivata, Codice Fiscale e
PEC non gestiti, messaggi predefiniti, prova fino al 16 ottobre 2026, campo
Interno facoltativo, gestione etichette disattivata, profilo in Italiano con
fuso Roma ([48](evidence/2026-10-03-polaris-2-claude/48-home-finale-ripristinata.jpg)).

Scritture eseguite e ripristinate, tra circa le 21:00 e le 21:30 CEST:

- **Regole:** salvate Codice Fiscale obbligatorio e PEC obbligatoria per aziende,
  poi di nuovo non gestiti. Una bozza precedente è stata scartata con «Rimuovi».
- **Validazione:** attivata e poi disattivata dalla Home, con la conferma critica.
- **Messaggi:** salvato il messaggio italiano «Codice Fiscale obbligatorio» con
  il suffisso « Grazie.», poi ripristinati e salvati i predefiniti.
- **Lingua del profilo:** English salvata e riletta. Al ripristino un
  salvataggio intermedio ha registrato «Indonesia (Beta)» per la selezione da
  tastiera della select di Shopify (come il 1 ottobre). Corretta subito in
  Italiano e riletta; fuso Roma invariato. Il primo tentativo di cambio lingua
  era stato bloccato dal controllo dei permessi di Claude Code ed è stato
  ripetuto su richiesta dell'owner.
- **Diagnosi:** «Aggiorna e verifica» eseguita una volta (21:02 CEST).
- **Onboarding:** percorso dal passo 1 a «Torna alla Home senza attivare» senza
  cambiare valori.
- **Ricontrollo:** due bozze in Regole (Codice Fiscale obbligatorio con il campo
  nascosto nel simulatore; controllo guidato delle etichette) scartate con
  «Rimuovi», senza salvataggi. Dopo lo scarto la pagina mostra di nuovo «Da
  configurare».
- **Conferma etichette, su richiesta dell'owner:** salvati Codice Fiscale
  obbligatorio e controllo guidato delle etichette (nessuna finestra, F-4),
  poi Codice Fiscale non gestito e controllo guidato tolto. Rilettura alle
  21:38 CEST: modalità «Disattivata», etichette Shopify invariate
  («Codice fiscale (opzionale)», «PEC (opzionale)»), stato «Da configurare»
  ([57](evidence/2026-10-03-polaris-2-claude/57-regole-etichette-ripristinate.jpg)).
  Nessuna etichetta è stata scritta su Shopify.

Tracce non annullabili: orari di salvataggio e lettura aggiornati, eventi di
telemetria di attivazione e disattivazione, ultima diagnosi registrata. Etichette
Shopify, campo Interno, mercati e piano non sono stati toccati. Non sono stati
premuti «Richiedi assistenza», «Copia diagnostica», «Rileggi i campi da
Shopify» o i bottoni dei piani.

## 16. Non verificato

- **Versione live:** non letta dalla diagnostica; il riferimento è il codice di
  `develop` a `e68cac8`.
- **390 px reali:** la finestra di Chrome non scende sotto 500 px; nessuna
  emulazione mobile.
- **Inglese a 500 px e onboarding in inglese.**
- **Checkout reale, stati di billing (piano attivo, scaduto, pagamento unico),
  gestione automatica delle etichette, ErrorBoundary.**
- **Finestre e stati non raggiungibili senza scritture:** conferma «Annulla
  rinnovo» (`PlanChoice.tsx:27`, solo con abbonamento attivo); ripristino delle
  etichette del campo Interno (`Address2CheckoutLabels.tsx:246`, solo con
  etichette ripristinabili); conferma della gestione automatica
  (`AutomaticLabelsConfirmModal.tsx`), che in questo store non compare perché
  non ci sono scritture automatiche (F-4); banner
  critico dei campi mancanti del simulatore (`CheckoutSimulator.tsx:417`,
  non comparso nella fase «Compilazione»); guida di configurazione e banner di
  check-in della Home (`SetupGuide.tsx`, `MerchantCheckIn.tsx`), legati a stati
  commerciali o di primo avvio diversi da quello dello store.
- **Tema scuro, zoom al 200%, screen reader.**
- **Misure DOM:** l'iframe è cross-origin, quindi le misure vengono dagli
  screenshot con tolleranza di circa 2 px.

## 17. Relazione con l'audit Codex dello stesso giorno

Il [report pubblicato con #628](2026-10-03-audit-ui-ux-development-2.0.md) e
i fix dei gruppi 1 e 2 erano già su `develop` durante questo giro. Sovrapposizioni:

| Questo audit | Codex | Stato osservato |
| --- | --- | --- |
| R-2, R-4 | V2-T1 | Il fallback dei pannelli è stato rimosso dal gruppo 1, ma il verde fisso del simulatore resta |
| R-7, R-9 | V2-R2, V2-R3 | «Da configurare» ha sostituito «Verifica manuale richiesta»; resta il doppio badge con stati opposti |
| M-1 | V2-M2 | Il titolo «Esempio del messaggio» c'è; l'esempio ora si confonde con i campi a 500 px |
| H-4 | V2-H2 | La card dei piani è stata modificata dal gruppo 2 (`PlanChoice.tsx`); restano nome del piano leggero e righe di altezze diverse |
| P2-T3 | V2-T2 | Titolo FAQ portato fuori dalla card; restano le altre incoerenze |
| EN-4 | V2-G1 | Risolto |

Gli altri findings di questo report non compaiono nel report Codex.

## 18. Componenti custom e alternative native

Inventario su `e68cac8`: 519 righe di CSS in otto file e markup HTML custom in
13 file dell'interfaccia. Catalogo di riferimento:
[App Home 2.0 RC web components](https://shopify.dev/docs/api/app-home/v2.0-rc/web-components).
Il catalogo non contiene accordion o disclosure. `s-text-field` supporta
`readOnly` ed `error`; `s-table` passa da tabella a elenco su mobile
(`variant="auto"`); lo slot `aside` di `s-page` esiste solo con
`inlineSize="base"`.

| Componente CF Ready | Dove | Alternativa nativa | Findings risolti | Raccomandazione |
| --- | --- | --- | --- | --- |
| Box dell'esempio errore (`CustomerMessagesPreview.css`, `.customer-messages-preview__error`) | Messaggi, esempi locali a 500 px, passo 3 dell'onboarding | `s-text-field` con `readOnly`, `label` uguale all'etichetta Shopify attuale ed `error` uguale al messaggio: riproduce campo ed errore in linea come nel checkout | N-1 (M-1, M-3, O-4, V2-M2) | **Sostituire**. Verificare nel nuovo Admin che `readOnly` mostri l'errore in rosso e non venga scambiato per un campo modificabile |
| Righe «Campo attuale / Campo dopo il salvataggio» (`.checkout-label-context__row`, griglia CSS) | Regole, «Testi del checkout» e «Campo Interno» | `s-table` con colonne Campo, Attuale, Dopo il salvataggio; su mobile diventa elenco chiave-valore | N-2 (R-6, parte di P2-T8) | **Sostituire** |
| Elenchi chiave-valore `.cf-data-list` / `.cf-data-row` (`ui-motion.css`, `app.onboarding.css`) | Colonna laterale di Messaggi, riepilogo del passo 4 | `s-query-container` con `s-grid` e `s-badge`, come le righe stato della Home (`HomeSections.tsx:112`) | M-4, O-5 | **Sostituire**, con lo stesso schema della Home |
| Logo con `s-avatar` e favicon | Intestazione del simulatore, passo 1 dell'onboarding | `s-image` con dimensione fissa, come il lockup della Home | N-3 (R-5, parte di P2-T5) | **Sostituire**. `s-avatar` è pensato per persone e aggiunge il fondo chiaro |
| `<details>` con chevron disegnato in CSS (`.cf-disclosure`, `.checkout-labels-disclosure__summary::before`) | FAQ, simulatore, pannelli etichette, procedura manuale | Nessun accordion nativo. Tenere `<details>` e mettere nel `summary` un `s-icon` `chevron-down`, con una sola regola di posizione | P2-T9 | **Tenere** il contenitore, **sostituire** il chevron |
| Procedura manuale in nove passi dentro un `<details>` annidato | Regole, «Testi del checkout» | `s-button` «Come completare la verifica» che apre un `s-modal` con `s-ordered-list` | R-9, parte di R-1 | **Valutare**: riduce l'annidamento e l'altezza della colonna sinistra |
| Fondo `#f1f5ef` inline e `s-box background="subdued"` | Simulatore | Un solo `s-box`, con fondo `subdued` oppure senza fondo | R-2 | **Sostituire** il colore fisso; la scelta del fondo è editoriale |
| Bottone «Continua» custom (`.checkout-simulator__button`) | Simulatore | `s-button variant="primary"` | R-4 | **Valutare**: il verde imita il checkout. Se resta, va tenuto distinto anche nel peso dagli `s-button` vicini |
| Griglia `.rules-layout` (`RulesLayout.css`) | Regole | `s-grid` con colonne responsive. Lo slot `aside` di `s-page` non basta, perché è largo circa 280 px | Non risolve da solo P2-T1 e R-1 | **Valutare** insieme a una diversa collocazione delle etichette, per esempio a tutta larghezza sotto la griglia |
| Elenco risultati della diagnosi (`.guide-diagnosis`) | Guida | `s-stack` con `s-icon` già nativi; per i link ripetuti `s-table variant="list"` oppure un `s-banner` di riepilogo | G-3 | **Valutare**: il problema è la composizione, non il componente |
| `<button>` dentro `ui-save-bar` | Regole, Messaggi | Nessuna: App Bridge richiede bottoni HTML nella save bar | — | **Tenere** |
| `s-progress`, `s-badge`, `s-banner`, `s-modal`, toast, save bar, `s-choice-list`, `s-select`, `s-text-area` | Tutte le pagine | Già nativi | — | Nessuna azione |

Le raccomandazioni non sono state provate nel nuovo Admin: prima di adottarle
serve una prova visiva su `cf-ready-polaris-2` e sul vecchio Admin, perché
l'app deve funzionare in entrambi durante il rollout. Per le sostituzioni
contrassegnate «Sostituire», l'ordine di convenienza è: esempio errore,
tabella delle etichette, elenchi chiave-valore, logo, chevron.

## 19. Correzioni verificate live

La base condivisa (P2-T1…P2-T9, N-3, R-5, EN-3) è entrata in `develop` con
[#629](https://github.com/max23468/CF-Ready/pull/629) (`db4b589`, versione
`2.0.5-dev.e1d976218ee1`) ed è stata distribuita in Development. La verifica
live è del 4 ottobre 2026, in Chrome con la sessione Admin dell'owner, scheda
in primo piano, su `cf-ready-polaris-2`, in italiano, a 1440, 1054 e 500 px,
senza salvataggi. Lo stato dello store era quello iniziale della sezione 15:
regole non gestite, validazione disattivata, prova attiva.

### 19.1 Corretti e verificati live

| ID | Esito osservato | Prove |
| --- | --- | --- |
| P2-T1 | Home, Regole, Messaggi e Guida partono dallo stesso bordo sinistro (x 284 a 1440 px, contro x 345 di Regole nell'audit); in Regole il simulatore stava nella colonna laterale. Sostituito da 2.0.6, vedi 19.3 | [58](evidence/2026-10-03-polaris-2-claude/58-v205-home-1440.jpg), [59](evidence/2026-10-03-polaris-2-claude/59-v205-regole-1440.jpg), [62](evidence/2026-10-03-polaris-2-claude/62-v205-messaggi-1440.jpg), [63](evidence/2026-10-03-polaris-2-claude/63-v205-guida-1440-faq-aperta.jpg) |
| P2-T4 (parte) | Righe Codice Fiscale, PEC e Messaggi della Home con badge neutri al posto del ciano; colonna laterale di Messaggi con badge neutri | [58](evidence/2026-10-03-polaris-2-claude/58-v205-home-1440.jpg), [70](evidence/2026-10-03-polaris-2-claude/70-v205-messaggi-500-colonna-laterale.jpg) |
| P2-T5 | Lockup a 128 px allineato al testo, dentro «Guida e assistenza» nella Home e sotto «Cosa fa e cosa non fa CF Ready» nella Guida | [58](evidence/2026-10-03-polaris-2-claude/58-v205-home-1440.jpg), [63](evidence/2026-10-03-polaris-2-claude/63-v205-guida-1440-faq-aperta.jpg) |
| P2-T6 | Citazioni italiane con «»: «Interno», «Regole checkout», «Campo Interno», «Codice fiscale (opzionale)», «PEC (opzionale)» | [60](evidence/2026-10-03-polaris-2-claude/60-v205-regole-1440-campo-interno-aperto.jpg), [61](evidence/2026-10-03-polaris-2-claude/61-v205-regole-1440-testi-checkout-aperto.jpg), [63](evidence/2026-10-03-polaris-2-claude/63-v205-guida-1440-faq-aperta.jpg) |
| P2-T8 (parte) | Righe etichetta-valore della Home e della colonna laterale di Messaggi in un'unica griglia, valori allineati anche a 500 px | [58](evidence/2026-10-03-polaris-2-claude/58-v205-home-1440.jpg), [67](evidence/2026-10-03-polaris-2-claude/67-v205-home-500.jpg), [70](evidence/2026-10-03-polaris-2-claude/70-v205-messaggi-500-colonna-laterale.jpg) |
| P2-T9 | Chevron Polaris al bordo destro di «Campo Interno», «Testi del checkout», «Quando si applicano», «Opzioni avanzate» e delle FAQ; verso l'alto quando il pannello è aperto | [60](evidence/2026-10-03-polaris-2-claude/60-v205-regole-1440-campo-interno-aperto.jpg), [61](evidence/2026-10-03-polaris-2-claude/61-v205-regole-1440-testi-checkout-aperto.jpg), [63](evidence/2026-10-03-polaris-2-claude/63-v205-guida-1440-faq-aperta.jpg) |
| N-3, R-5 | Marchio senza il quadrato crema nell'intestazione del simulatore e nel passo 1 dell'onboarding (il fondo stava nella favicon, non in `s-avatar`) | [59](evidence/2026-10-03-polaris-2-claude/59-v205-regole-1440.jpg), [64](evidence/2026-10-03-polaris-2-claude/64-v205-onboarding-passo1-1440.jpg) |
| P2-T3 (parte) | Sottotitoli «Codice Fiscale» e «PEC» della colonna laterale di Messaggi come titoli, distinti dalle righe | [62](evidence/2026-10-03-polaris-2-claude/62-v205-messaggi-1440.jpg), [70](evidence/2026-10-03-polaris-2-claude/70-v205-messaggi-500-colonna-laterale.jpg) |

### 19.2 Corretti nel codice, non ancora verificati live

- **EN-3:** un solo nome inglese per il Codice Fiscale. Serve il profilo in
  inglese, che richiede un permesso dell'owner.
- **P2-T8, passo 4 dell'onboarding:** verificato nel giro della sezione 21.
  Riaprendo un onboarding già completato e mantenendo le scelte salvate,
  il passo 2 prosegue senza scrivere le regole.

Non corretti di proposito: P2-T2 (comportamento dell'host). P2-T3 (resto),
P2-T7 e le applicazioni di P2-T8 a diagnosi e passo 2 sono convenzioni del
Master Plan §15.1, assegnate alle chat di pagina.

### 19.3 Decisioni successive, verificate live (2.0.6)

Dopo la verifica di 2.0.5 l'owner ha preso cinque decisioni, entrate con
[#630](https://github.com/max23468/CF-Ready/pull/630) (`b7c2db9`, versione
`2.0.6-dev.6d362a39b546`). Verifica live del 4 ottobre, stesse condizioni di
19.1. Nel frattempo l'owner aveva salvato nuove regole nello store (Codice Fiscale
facoltativo, PEC obbligatoria per aziende, con due verifiche manuali in
sospeso): questo ha reso visibili casi che in 2.0.5 non
comparivano.

| ID | Esito osservato | Prove |
| --- | --- | --- |
| R-1, P2-T1 | Regole affianca regole e simulatore al 50% (simulatore circa 476 px a 1440, 360 px a 1054) ed «Etichette del checkout» sta a tutta larghezza sotto; a 500 px tutto si impila. A 1440 il bordo sinistro di Regole è x 345 contro x 284 delle altre pagine, per scelta; a 1054 coincide (x 252) | [72](evidence/2026-10-03-polaris-2-claude/72-v206-regole-1440.jpg), [78](evidence/2026-10-03-polaris-2-claude/78-v206-regole-1054.jpg), [79](evidence/2026-10-03-polaris-2-claude/79-v206-home-1054.jpg), [80](evidence/2026-10-03-polaris-2-claude/80-v206-regole-500-simulatore.jpg) |
| R-2, R-4 | Il simulatore ha un solo fondo panna, senza la fascia grigia di «Prova uno scenario»; «Continua» resta verde bottiglia (brand A-19) | [72](evidence/2026-10-03-polaris-2-claude/72-v206-regole-1440.jpg), [73](evidence/2026-10-03-polaris-2-claude/73-v206-regole-1440-colonna-sinistra-vuota.jpg) |
| H-1 | La card della Home non ha più il banner della prova; «Scegli un piano» sta nella sezione Piano. A 500 px le azioni della card stanno sopra la barra dell'host (migliora RW-1) | [71](evidence/2026-10-03-polaris-2-claude/71-v206-home-1440.jpg), [81](evidence/2026-10-03-polaris-2-claude/81-v206-home-500.jpg) |
| P2-T8 (densità) | Righe di stato a 26 px l'una dall'altra (prima 32) nella Home e nella colonna laterale di Messaggi | [71](evidence/2026-10-03-polaris-2-claude/71-v206-home-1440.jpg), [77](evidence/2026-10-03-polaris-2-claude/77-v206-messaggi-1440.jpg) |
| P2-T4 | «Può comparire» è neutro, come «Non compare» | [77](evidence/2026-10-03-polaris-2-claude/77-v206-messaggi-1440.jpg) |
| R-7 | Nessun badge verde per lingua: con verifiche in sospeso il titolo e la riga da verificare hanno «Da verificare» arancione | [74](evidence/2026-10-03-polaris-2-claude/74-v206-regole-1440-testi-checkout-aperto.jpg) |
| P2-T9 | Il chevron di «Come completare la verifica manuale» è alla stessa x del pannello che la contiene (x 1267; nell'audit lo scarto era 16 px); aperta, la procedura mostra i nove passi | [74](evidence/2026-10-03-polaris-2-claude/74-v206-regole-1440-testi-checkout-aperto.jpg), [75](evidence/2026-10-03-polaris-2-claude/75-v206-regole-1440-procedura-aperta.jpg) |
| Campo Interno | L'aiuto sotto la scelta è un solo paragrafo | [76](evidence/2026-10-03-polaris-2-claude/76-v206-regole-1440-campo-interno-aperto.jpg) |

Rilievi aperti emersi dalla verifica:

- **R-1 residuo:** con la PEC obbligatoria per aziende il simulatore è più
  alto delle due card di regole, quindi a 1440 px la colonna sinistra resta
  vuota per circa 240 px prima delle etichette
  ([73](evidence/2026-10-03-polaris-2-claude/73-v206-regole-1440-colonna-sinistra-vuota.jpg)).
- **Confronto delle etichette con modifiche:** quando cambia il valore restano
  due righe («Campo attuale», «Campo dopo il salvataggio»), come deciso; la
  riga singola vale solo senza modifiche, caso non presente nello store.
- **Non verificati live durante quel giro:** EN-3 e passo 4 dell'onboarding.
  Gli stati aggiornati e i limiti del ricontrollo sono nella sezione 21.

## 20. Correzioni successive in 2.0.7

Decisioni dell'owner del 4 ottobre, completate dopo l'interruzione della
sessione di Claude:

- esito del simulatore nell'intestazione, in alto a destra; rimossa la nota
  sulle etichette e la spiegazione degli scenari, con «Prova uno scenario»
  come etichetta nativa della select;
- banner della prova nuovamente visibile dopo la card della validazione,
  equidistante dalla card e dal titolo «Come vuoi continuare», con «Scegli un
  piano» nello slot nativo del banner. Questa decisione sostituisce la
  collocazione nella sezione Piano descritta in 19.3.

La verifica locale misura le distanze con i componenti Polaris reali in
Chromium e WebKit, con Polaris 1 e 2, in italiano e inglese, a 1440, 1054,
500 e 390 px. Non costituisce una verifica del rendering nell'Admin live.
La pubblicazione richiesta riguarda solo Development.

## 21. Ricontrollo degli stati in Chrome, 4 ottobre 2026

Verifica nel tab **già aperto** di `cf-ready-polaris-2`, app Development.
La diagnostica della Guida identifica la versione **2.0.7**; commit e
stato provider non sono stati riconfermati in questo giro. Questo giro aggiorna
il presente audit con gli stati, non il report separato con ID `V2-*`.

Superfici osservate: Home, Regole, Messaggi, FAQ espanse, risultati della
diagnosi e tutti i quattro passi dell'onboarding riaperto. Desktop a
1440×900, Messaggi con focus a 1440×666, Home/Messaggi/Regole a 500×844;
Home anche a 390×844. Sono viewport CSS emulati in Chrome, non dispositivi
fisici. Le prove sono in
[evidence/2026-10-04-status-chrome](evidence/2026-10-04-status-chrome).

Stato trovato nello store: Validation attiva, CF e PEC facoltativi e validati,
messaggi predefiniti, gestione etichette guidata, due verifiche manuali
pendenti. È diverso dal ripristino storico di §15 e non ne modifica il
resoconto. «Aggiorna e verifica» ha riletto lo stato e aggiornato l'orario
operativo. Le due bozze locali (CF obbligatorio e disattivazione del controllo
guidato) sono state scartate; nessun salvataggio, attivazione, pagamento,
scrittura delle etichette o invio di assistenza.

Alla fine viewport ripristinato e tab originale riportato alla Home, senza
bozze: [rilettura finale](evidence/2026-10-04-status-chrome/home-finale-ripristinata.jpg).
Gli altri tab già aperti non sono stati modificati.

### 21.1 Esito per finding

Gli stati di chiusura restano invariati: **50 ID**, **7 risolti**, **9
parziali**, **30 aperti**, **4 accettati per decisione**, quindi **39 da
completare**. Una mancata riproduzione in un solo stato non equivale a
risoluzione. «Prova precedente» distingue i casi non riconfermati live in
questo giro; non sono nuovi esiti positivi.

| ID | Stato | Riscontro di questo giro |
| --- | --- | --- |
| P2-T1 | Accettato per decisione | Regole conserva il 50/50 e l'onboarding il contenitore stretto. Decisione precedente preservata. |
| P2-T2 | Accettato per decisione | Aside di Messaggi/Guida ancora sopra la prima sezione; comportamento host accettato. |
| P2-T3 | Parziale | Titoli laterali di Messaggi distinti; diagnosi e passi onboarding mantengono titoli dentro la card. |
| P2-T4 | Parziale | Badge neutri in Home e Messaggi, ma **«Può comparire» è ancora verde nel passo 3 dell'onboarding**. Non resta soltanto «Consigliato». |
| P2-T5 | Risolto | Marchio senza fondo in simulatore e onboarding; lockup allineato in Guida. Nessuna regressione osservata nelle superfici controllate. |
| P2-T6 | Risolto | «Interno» e citazioni nelle etichette, FAQ e riepilogo onboarding usano «». |
| P2-T7 | Aperto | Nota dell'esempio presente cinque volte nel DOM mobile di Messaggi; disponibilità ripetuta negli esempi onboarding. |
| P2-T8 | Parziale | Righe del passo 4 **ora verificate live e allineate**; restano le distanze dei risultati diagnostici e dei gruppi del passo 2. |
| P2-T9 | Risolto | Chevron Polaris a destra nei pannelli, procedura manuale e FAQ; apertura confermata. |
| N-1 | Aperto | Messaggi e passo 3 conservano box custom rossi, senza campo nativo in sola lettura. |
| N-2 | Aperto | Confronto etichette ancora in righe custom; nessuna tabella nativa. |
| N-3 | Risolto | Marchio senza quadrato crema nel simulatore e nel passo 1. |
| H-1 | Parziale | Banner esterno e compatto; data della prova ripetuta nella sezione Piano e continuità commerciale. |
| H-2 | Aperto | Da attiva: Modifica regole primaria a sinistra, Disattiva critica a destra. Variante disattivata non ricreata. |
| H-4 | Aperto | Prezzo distinto e periodo vicino; nome leggero, descrizione aggiuntiva solo nel pagamento unico, «Consigliato» neutro. |
| H-5 | Aperto | Non ricreato: lo store ha entrambi i campi configurati. Resta la prova precedente del caso attivo senza campi. |
| H-6 | Aperto | Da attiva la sezione propone Apri gli ordini; confronto con gli altri stati conservato dalla prova precedente. |
| R-1 | Parziale | Etichette sotto entrambe le colonne; diversa altezza di regole e simulatore ancora visibile. Non confermata la misura storica di 240 px con PEC aziendale. |
| R-2 | Accettato per decisione | Unico fondo panna del simulatore riconfermato. |
| R-3 | Aperto | Titoli dei gruppi leggeri rispetto alle etichette; Prova uno scenario è ora etichetta nativa, come già documentato in §20. |
| R-4 | Accettato per decisione | Continua verde custom mantenuto accanto a Svuota Polaris. |
| R-5 | Risolto | Marchio del simulatore senza il fondo crema. |
| R-6 | Parziale | Caso con modifiche: due righe attuale/proposto; intestazione Predefinito per questa lingua ancora presente. Caso senza modifiche non ricreato. |
| R-7 | Parziale | Da verificare ripetuto nel sommario e nel caso della lingua; nessun Aggiornati verde in quello stato. |
| R-8 | Aperto | Modalità, ultima lettura e conteggio restano paragrafi; conferma disabilitata nella procedura aperta. |
| R-9 | Aperto | Procedura annidata di nove passi e banner interno ancora presenti. |
| R-10 | Aperto | Testo Impostazioni → Checkout ancora nel DOM; denominazione nativa Check-out conservata dalla prova precedente. |
| R-12 | Aperto | Togliendo entrambi i campi nelle opzioni locali resta Dati fiscali del cliente vuoto, senza spiegazione. |
| R-13 | Aperto | Disattivazione guidata in bozza mostra ancora il banner giallo dentro il pannello; bozza scartata. |
| M-1 | Aperto | A 500 px esempi locali e campi modificabili conservano box bianchi bordati simili. |
| M-2 | Aperto | Nota di fedeltà ancora fuori dal riquadro grigio. |
| M-3 | Aperto | Spaziatura differenziata e Messaggio selezionato con badge ancora presenti. |
| M-4 | Parziale | Titoli e badge neutri confermati; restano i quattro indicatori ripetuti. |
| M-5 | Aperto | **Non riprodotto nel percorso provato:** a 1440×666 il focus su PEC non valida scorre il campo sopra Sidekick. Il percorso intermedio storico non è escluso. |
| G-1 | Aperto | Domande ancora rientrate rispetto ai titoli e divisori. |
| G-2 | Aperto | Espandi tutte conferma domanda e risposta con gerarchia poco distinta e righe desktop lunghe. |
| G-3 | Aperto | Diagnosi eseguita: tre link Regole checkout, distanze uniformi e assenza di riepilogo. Nel caso corrente non c'è un esito informativo con icona nera. |
| G-4 | Aperto | Tre azioni impilate nell'assistenza desktop; variante con salto verso l'alto a 500 px non riprovata. |
| O-1 | Aperto | Passi 1 e 2 confermano il titolo introduttivo leggero e la gerarchia dei gruppi. |
| O-2 | Aperto | Passo 2: separatore prima di Interno, nessun separatore equivalente prima di PEC. |
| O-3 | Aperto | Proposte ancora elencate per lingua senza righe dedicate ai campi. Variante Mantieni il testo attuale non ricreata. |
| O-4 | Aperto | Passo 3: una sola voce sotto Quando si applicano, esempi bianchi su card bianca. |
| O-5 | Aperto | **Passo 4 verificato live:** righe allineate ma stati in testo semplice. Da già attiva ci sono due azioni; variante con tre bottoni non ricreata. |
| O-6 | Aperto | Completamento non rieseguito; conserva la prova precedente. Riaprire l'onboarding non mostra quella schermata. |
| F-2 | Aperto | Clic reale sul link Admin con bozza: pagina resta in Regole e save bar presente, senza spiegazione aggiuntiva. Animazione transitoria non qualificata; bozza scartata. |
| RW-1 | Parziale | Azioni della Home visibili sopra la barra host a 500×844 e 390×844 nello stato corrente; non copre ogni stato e altezza. |
| RW-2 | Risolto | A 500 px simulatore prima delle etichette; badge delle etichette su riga autonoma. |
| EN-1 | Aperto | Non riconfermato live EN; codice corrente conserva How you want to continue (`app/i18n/en.ts`). |
| EN-2 | Aperto | Non riconfermato live EN; codice corrente conserva Set up required (`app/i18n/en.ts`). |
| EN-3 | Risolto | Conservata la verifica inglese recente riportata nella copia locale aggiornata dell'audit consultata prima del giro; nessuna nuova conferma live EN. |

### 21.2 Prove e limiti

| Prova | Findings principali |
| --- | --- |
| [Home desktop](evidence/2026-10-04-status-chrome/home-1440.jpg), [Home mobile](evidence/2026-10-04-status-chrome/home-500.jpg) | H-1, H-2, H-4, H-6, RW-1 |
| [Confronto etichette](evidence/2026-10-04-status-chrome/etichette-confronto-1440.jpg), [procedura](evidence/2026-10-04-status-chrome/etichette-procedura-1440.jpg) | N-2, R-6, R-7, R-8, R-9, P2-T9 |
| [Banner in bozza](evidence/2026-10-04-status-chrome/etichette-disattivazione-bozza-500.jpg) | R-13 |
| [Simulatore senza campi](evidence/2026-10-04-status-chrome/simulatore-senza-campi-1440.jpg), [ordine mobile](evidence/2026-10-04-status-chrome/regole-simulatore-500.jpg) | R-12, RW-2 |
| [Messaggi desktop](evidence/2026-10-04-status-chrome/messaggi-1440.jpg), [mobile](evidence/2026-10-04-status-chrome/messaggi-500.jpg), [focus](evidence/2026-10-04-status-chrome/messaggi-focus-1440x666.jpg) | N-1, M-1…M-5, P2-T7 |
| [FAQ espanse](evidence/2026-10-04-status-chrome/faq-espanse-1440.jpg), [diagnosi](evidence/2026-10-04-status-chrome/diagnosi-1440.jpg) | G-1…G-3, P2-T8 |
| [Passo 1](evidence/2026-10-04-status-chrome/onboarding-passo1-1440.jpg), [passo 2](evidence/2026-10-04-status-chrome/onboarding-passo2-1440.jpg), [passo 3](evidence/2026-10-04-status-chrome/onboarding-passo3-1440.jpg), [passo 4](evidence/2026-10-04-status-chrome/onboarding-passo4-1440.jpg) | O-1…O-5, P2-T3/T4/T8, N-3 |
| [Navigazione con bozza](evidence/2026-10-04-status-chrome/navigazione-bozza-1440.jpg) | F-2 |

L'Admin conserva l'italiano anche passando `locale=en` nell'URL esterno;
quel tentativo non è una prova inglese. Profilo non modificato, quindi
EN-1/EN-2 restano corroborati dal codice e EN-3 dalla prova precedente.
Durante il giro sono comparse modifiche locali concorrenti a componenti,
test e Master Plan: non sono state toccate né usate come prova di correzione
live. Gli stati della tabella si riferiscono alla versione osservata in Chrome.
Non sono stati ricreati Validation disattivata, assenza di campi salvati,
completamento onboarding, scritture automatiche e varianti di billing.
I positivi/informativi H-3, R-11, F-1, F-3, F-4 ed EN-4 restano esclusi
dal conteggio; toast di salvataggio, errori del simulatore e modale automatica
non sono stati riqualificati in questo giro.
