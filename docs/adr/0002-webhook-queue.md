# ADR 0002 — Coda durevole per i webhook

- **Stato:** accettato
- **Data:** 2026-08-05

CF Ready registra il claim idempotente del webhook in D1 e pubblica su
Cloudflare Queues un messaggio che contiene soltanto ID webhook, token del claim
dominio dello store necessario ai retry dopo la sua anonimizzazione in D1 e gli
eventuali scope tecnici. Il payload non entra nella coda. CF Ready risponde `200`
a Shopify solo dopo che la coda ha accettato il messaggio.

Il consumer ricostruisce da D1 store, topic e ciclo di installazione, rinnova il
claim durante il lavoro e usa i retry nativi della coda. Dopo cinque retry il
messaggio passa a una DLQ che porta la ricevuta a `failed` e registra il solo
codice errore stabile. La DLQ ritenta la finalizzazione; se D1 resta
indisponibile per cento tentativi, rimanda il messaggio alla coda primaria
invece di eliminarlo.

`waitUntil` non basta: accelera la risposta ma non garantisce la riconsegna dopo
un'interruzione del Worker. Non vengono introdotti payload webhook, sessioni
nella coda o un secondo sistema di stato.
