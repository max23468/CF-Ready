# ADR 0003 — Etichette native del checkout

- **Stato:** accettato
- **Data:** 2026-09-08

CF Ready legge le etichette native Shopify di Codice Fiscale, PEC e seconda
riga dell'indirizzo tramite `ONLINE_STORE_THEME_LOCALE_CONTENT`. Gli scope
`write_translations`, `read_locales` e `read_markets` restano opzionali e
separati dalla Validation. La loro revoca sospende la gestione delle etichette
senza impedire il salvataggio delle regole.

L'app scrive automaticamente soltanto le traduzioni globali inglesi esatte di
Codice Fiscale e PEC per la locale secondaria `en`. Fonti primarie, altre
locali, override di mercato e chiavi della seconda riga restano guidati. Ogni
conferma guidata vale per la singola risorsa, chiave, locale, mercato, tipo di
slot e valore osservato; una modifica successiva la invalida.

Prima della prima scrittura automatica l'app mostra il confronto e richiede un
consenso esplicito. D1 conserva per ogni slot valore originario, ultima
scrittura e revisione osservata. La disattivazione ripristina soltanto le
traduzioni ancora possedute dall'app. Risorse mancanti o ambigue, digest
scaduti e readback divergenti lasciano la sincronizzazione incompleta e
visibile al merchant.

La verifica di “Interno” resta prudente: il merchant sceglie le sole traduzioni
da ripristinare e conferma separatamente eventuali personalizzazioni. Shopify
non espone all'app lo stato completo dell'opzione che rende la seconda riga
obbligatoria, facoltativa o nascosta; quella verifica resta manuale.
