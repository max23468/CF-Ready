# ADR 0008 — Codice Fiscale e PEC uniformati negli ordini

- **Stato:** accettato
- **Data:** 2026-11-05

La Validation Function può solo consentire o bloccare il checkout, e la Localized
Fields API delle Checkout UI Extension è in sola lettura, anche su Shopify Plus.
Per salvare Codice Fiscale e PEC in forma canonica CF Ready corregge l'ordine dopo
la sua creazione, con `orderUpdate` e `OrderInput.localizedFields`, disponibili su
tutti i piani.

Il 5 novembre 2026 una prova su `cf-ready-dev.myshopify.com` con l'API 2026-10 ha
verificato che `orderUpdate` sostituisce il valore della chiave inviata senza
duplicarla, lascia invariate le chiavi non inviate e funziona anche su ordini
chiusi.

- Gli scope `read_orders` e `write_orders` sono opzionali e si chiedono solo
  all'attivazione. L'app usa i protected customer data di livello 1 senza campi
  protetti (nome, email, telefono, indirizzo).
- L'opzione vive nella configurazione della Validation
  (`rules.normalizeOrderFields`) come D-192: Shopify resta la fonte autorevole e
  conflitti, cronologia e onboarding la conservano senza codice dedicato.
- `orders/create` riceve solo `admin_graphql_api_id` (`include_fields`) e passa
  dalla coda webhook di ADR 0002 con il solo ID dell'ordine. Il job rilegge
  ordine e configurazione in un'unica query e scrive soltanto le chiavi cambiate.
- La correzione degli ordini esistenti riusa la stessa coda con un ID sintetico
  per pagina, così claim, retry e dead letter restano gli stessi. Ogni pagina
  rilegge la configurazione e si ferma se l'opzione o la Validation sono spente.
- Nessun valore di Codice Fiscale o PEC entra in D1, nei log o negli eventi.

Alternative scartate: Checkout UI Extension (fuori perimetro, sola lettura e
limitata a Plus), rifiuto dei valori minuscoli nella Validation (blocca codici
corretti), tabella D1 dedicata (duplica lo stato già in Shopify), webhook
`orders/updated` (riscriverebbe le modifiche del merchant).
