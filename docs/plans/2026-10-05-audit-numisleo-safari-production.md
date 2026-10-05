# Audit CF Ready Production su Numisleo, italiano, Safari

Audit iniziato il 4 ottobre e completato il 5 ottobre 2026. Non sono emersi blocchi funzionali né difetti grafici nelle schermate e negli scenari verificati. È emersa un'ambiguità minore nel riepilogo delle etichette. Questo esito riguarda il percorso osservato; non equivale a garantire l'assenza di ogni possibile anomalia.

## Ambiente e prove

Le cinque tavole riepilogative usate per ispezionare le copie salvate sono
incluse con gli originali: [1](evidence/2026-10-04-audit-numisleo-prod/safari/contact-1.jpg),
[2](evidence/2026-10-04-audit-numisleo-prod/safari/contact-2.jpg),
[3](evidence/2026-10-04-audit-numisleo-prod/safari/contact-3.jpg),
[4](evidence/2026-10-04-audit-numisleo-prod/safari/contact-4.jpg),
[5](evidence/2026-10-04-audit-numisleo-prod/safari/contact-5.jpg).

- Store: Numismatica Leonessa, `numisleo`, Production.
- Browser: Safari su macOS. Il menu Sviluppo espone Safari 27.0.1 come user agent desktop.
- Versione letta nell'assistenza dell'app: 2.0.17.
- HEAD locale e `main` GitHub riconfermato a fine audit: `77bef940f9b9e7aa53ed567b5e9b78912bfab1bf`.
- [Deploy Production dello stesso commit, riuscito](https://github.com/max23468/CF-Ready/actions/runs/37237325580). Il deploy non sostituisce le prove nel browser riportate sotto.
- Schermate nuove di questa sessione, salvate e ispezionate. Nessuna schermata di audit precedenti è usata come prova.
- Desktop a circa 1440 px, finestra stretta a 720 px e modalità design reattivo Safari a 390 × 844. Quest'ultima è una prova di layout sul Mac, non una prova su iPhone fisico.

## Riscontro da correggere

**F1. Il riepilogo delle etichette non chiarisce che lo stato riguarda tutte le lingue. Severità: bassa, P3. Confidenza: alta. Passo 4, schermata 06.**

Selezionando Italiano in Etichette del checkout, la tabella mostra correttamente «Codice fiscale» e «PEC (facoltativa)», ma il riepilogo continua a mostrare «Da verificare» e «Un checkout in inglese richiede una verifica». Il messaggio è in italiano e descrive uno stato globale reale; il collegamento con la lingua selezionata resta poco chiaro. Può far pensare che la verifica italiana non sia stata completata.

Il codice corrente conferma la causa: `NativeCheckoutLabels.tsx` filtra `displayedContexts` sulla famiglia selezionata, ma calcola `pending` e il riepilogo su tutti i `contexts`. Non è stata verificata la correttezza del checkout inglese, escluso dall'incarico.

Proposta: rendere esplicito che il riepilogo riguarda tutte le lingue, oppure distinguere stato della lingua selezionata e altre lingue in attesa. Correzione locale: il titolo è ora «Testi del checkout in tutte le lingue», con traduzione inglese corrispondente. Il test della route Regole passa da Inglese a Italiano e verifica che il riepilogo globale resti esplicito. Il test falliva prima della correzione e passa dopo, su Chromium e WebKit.

![06. Etichette italiane e riepilogo globale](evidence/2026-10-04-audit-numisleo-prod/safari/06-etichette.png)

## Percorso verificato

### 1. Home e conferma di disattivazione: regolare

Validazione attiva, CF obbligatorio e validato, PEC facoltativa e validata, messaggi predefiniti, piano omaggio permanente. Gerarchia, schede, pulsanti e testi coerenti. La finestra di disattivazione spiega che regole e messaggi restano salvati; è stata annullata. Il controllo non è stato disattivato.

![01. Home desktop](evidence/2026-10-04-audit-numisleo-prod/safari/01-home.png)
![02. Conferma annullata](evidence/2026-10-04-audit-numisleo-prod/safari/02-conferma.png)

### 2. Regole checkout e bozza: regolare

Opzioni CF e PEC leggibili, riepilogo coerente con la configurazione. La scelta temporanea della PEC obbligatoria per Azienda aggiorna il simulatore. La bozza è stata scartata con Rimuovi; la configurazione live resta CF obbligatorio e PEC facoltativa. Nessun salvataggio delle regole eseguito.

![03. Regole desktop](evidence/2026-10-04-audit-numisleo-prod/safari/03-regole.png)
![16. Regole in finestra stretta](evidence/2026-10-04-audit-numisleo-prod/safari/16-regole-strette.png)

### 3. Simulatore italiano: regolare nei casi provati

| Caso | Esito osservato |
| --- | --- |
| CF vuoto con consegna italiana | Checkout bloccato, messaggio obbligatorietà, focus sul campo |
| Dati sintetici validi | Checkout pronto |
| CF con carattere di controllo errato | Bloccato, spiegazione sul carattere finale |
| CF provvisorio numerico | Checkout pronto |
| Omocodia nello scenario disponibile | Checkout pronto |
| PEC malformata | Bloccato con errore di formato |
| Svuota | Ripristino campi e successivo errore CF obbligatorio |
| Consegna Francia, fatturazione Italia | Regole non applicate |
| Paese consegna assente e CF non esposto | Il campo obbligatorio nascosto non blocca |
| Bozza PEC richiesta per Azienda, Azienda compilata e PEC vuota | Bloccato, focus PEC |
| Stessa bozza, Azienda vuota | Checkout pronto |

Le opzioni avanzate e le spiegazioni si espandono correttamente. La bozza aziendale è stata scartata. Queste prove non sostituiscono il checkout reale del passo 8.

![04. CF obbligatorio](evidence/2026-10-04-audit-numisleo-prod/safari/04-obbligatorio.png)
![05. PEC errata](evidence/2026-10-04-audit-numisleo-prod/safari/05-pec-errata.png)
![17. Bozza PEC per aziende](evidence/2026-10-04-audit-numisleo-prod/safari/17-pec-azienda.png)

### 4. Etichette italiane: valori corretti, ambiguità F1

Selezione Italiano verificata. Etichette correnti: «Codice fiscale» e «PEC (facoltativa)». Nessuna modifica proposta per queste due etichette. Gestione automatica selezionata, modalità Mista. Campo Interno: «Interno, scala, ecc. (facoltativo)», senza etichetta fiscale rilevata. La conferma manuale visualizzata è storica; non è stata aggiornata durante l'audit. Il riscontro nel checkout reale conferma i testi nel contesto italiano effettivamente aperto.

Prova: schermata 06 sopra. Nessuna modifica dei testi del tema o conferma manuale remota.

### 5. Messaggi al cliente italiani: regolare

Letti tutti e quattro i messaggi. Conteggi iniziali 52/200, 75/200, 50/200 e 56/200. Un messaggio sintetico aggiorna l'anteprima; 208 caratteri producono «Massimo 200 caratteri». La navigazione verso Regole con bozza è protetta e porta l'attenzione al salvataggio. Rimuovi ripristina i valori iniziali. La conferma di ripristino chiarisce che la modifica diventa effettiva soltanto dopo il salvataggio; annullata.

Nessun messaggio salvato. Nessun testo misto italiano/inglese osservato nel contenuto italiano verificato.

![07. Messaggi italiani](evidence/2026-10-04-audit-numisleo-prod/safari/07-messaggi.png)
![08. Limite caratteri e bozza](evidence/2026-10-04-audit-numisleo-prod/safari/08-limite.png)

### 6. Guida, FAQ e diagnosi: regolare, stato etichette in attesa

Verificate le 14 FAQ, espansione e compressione, descrizioni della validazione formale, condizioni territoriali, PEC per Azienda e piano omaggio. «Il controllo non compare?» raggiunge la diagnosi; «Riproduci il caso nel simulatore» apre Regole e raggiunge la sezione pertinente.

«Aggiorna e verifica» eseguito: diagnosi del 5 ottobre 2026 alle 07:11 CEST. Validazione attiva su Shopify, piano attivo, almeno un campo gestito, nessuna etichetta fiscale in Interno. Le etichette richiedono ancora attenzione nel riepilogo globale. Nessuna email inviata.

![09. FAQ espanse](evidence/2026-10-04-audit-numisleo-prod/safari/09-faq.png)
![10. Diagnosi aggiornata](evidence/2026-10-04-audit-numisleo-prod/safari/10-diagnosi.png)
![23. Salto al simulatore](evidence/2026-10-04-audit-numisleo-prod/safari/23-salto-simulatore-390.png)

### 7. Onboarding e layout stretti: regolari nelle viste provate

Rivisitati i quattro passi sullo store già configurato: introduzione, regole, anteprima e riepilogo. Il passo 2 non è stato inviato, perché avrebbe salvato la configurazione; il passo 3 è stato aperto direttamente. L'anteprima e il riepilogo riflettono CF obbligatorio, PEC facoltativa, controllo e piano attivi. Torna alla Home funziona.

Home, Regole, simulatore, Messaggi e Guida verificati a larghezze strette. A 390 × 844 non sono emersi sovrapposizioni o tagli dei controlli osservati; gli errori e le descrizioni vanno a capo. Il simulatore porta il focus al campo errato. Non è una certificazione di accessibilità: VoiceOver, contrasto misurato, navigazione completa da tastiera e dispositivo iOS reale non sono stati verificati.

![11. Onboarding introduzione](evidence/2026-10-04-audit-numisleo-prod/safari/11-onboarding-1.png)
![12. Onboarding regole](evidence/2026-10-04-audit-numisleo-prod/safari/12-onboarding-2.png)
![13. Onboarding anteprima](evidence/2026-10-04-audit-numisleo-prod/safari/13-onboarding-3.png)
![14. Onboarding riepilogo](evidence/2026-10-04-audit-numisleo-prod/safari/14-onboarding-4.png)
![15. Home a 720 px](evidence/2026-10-04-audit-numisleo-prod/safari/15-home-stretta.png)
![18. Regole a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/18-regole-390.png)
![19. Simulatore a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/19-simulatore-390.png)
![20. Messaggi a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/20-messaggi-390.png)
![21. Campi messaggi a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/21-messaggi-campi-390.png)
![22. Guida a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/22-guida-390.png)
![28. Home a 390 px](evidence/2026-10-04-audit-numisleo-prod/safari/28-home-390.png)

### 8. Checkout reale italiano e pulizia: regolare fino alla compilazione

Carrello inizialmente vuoto. Aggiunto un solo articolo per raggiungere il checkout italiano reale su `numisleo.it`, senza modalità preview. Compilati contatto e indirizzo sintetici con consegna e fatturazione Italia. I campi fiscali compaiono dopo l'indirizzo; Interno mantiene la sua etichetta ordinaria.

CF mancante: messaggio obbligatorietà. CF con carattere finale errato: messaggio di invalidità formale con dettaglio. PEC malformata: messaggio formato email. CF valido con PEC vuota: entrambi senza errore. CF valido con PEC sintetica valida: entrambi senza errore. Gli errori spariscono correggendo i campi.

Nessun dato di pagamento inserito e nessun ordine inviato. Non è stato premuto Paga ora: l'esito finale di creazione ordine e le modalità express non sono dimostrati. I casi omocodia, numerico, estero e PEC per Azienda restano provati solo nel simulatore.

L'articolo è stato rimosso e il carrello vuoto riconfermato visivamente. Il pannello pubblico creato per la prova è stato chiuso. Safari è tornato alle dimensioni iniziali e alla Home dell'app, senza bozza. Shopify può conservare una sessione di checkout con i dati sintetici; l'audit non ha verificato né cancellato eventuali record di checkout abbandonato lato amministrazione.

![24. Errori reali italiani](evidence/2026-10-04-audit-numisleo-prod/safari/24-checkout-it.png)
![25. CF obbligatorio reale](evidence/2026-10-04-audit-numisleo-prod/safari/25-checkout-cf-obbligatorio.png)
![26. Correzione degli errori reali](evidence/2026-10-04-audit-numisleo-prod/safari/26-checkout-corretto.png)
![27. Carrello ripristinato vuoto](evidence/2026-10-04-audit-numisleo-prod/safari/27-carrello-ripristinato.png)

## Limiti e stato finale

Non verificati: inglese, acquisto finale, pagamenti, nuove installazioni, acquisto di piani diversi, salvataggi produttivi, attivazione/disattivazione effettiva, invio assistenza, guasti forzati di rete/provider, console e traffico di rete, sicurezza backend, accessibilità completa, sito pubblico CF Ready e tema Numisleo nel suo insieme. Nessun test automatico eseguito, perché l'incarico è un audit live senza modifiche di codice.

Durante l'audit non sono stati modificati codice o configurazioni. Su successiva richiesta dell'owner, F1 è stato corretto in locale e integrato con NP-1–NP-4 di Claude nel candidato 2.0.18 della PR #658. Gate completo e coverage del diff integrato sono verdi. L'owner ha autorizzato la pubblicazione della PR unica soltanto in Development, senza promozione. Il riscontro su Production resta quello di 2.0.17; non attesta la presenza dei fix in Production.
