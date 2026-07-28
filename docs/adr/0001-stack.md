# ADR 0001 — Stack applicativo

- **Stato:** accettato
- **Data:** 2026-07-28

CF Ready usa React Router e TypeScript su Cloudflare Workers, D1 per i dati
applicativi e R2 per i backup. L’interfaccia embedded usa Polaris e App Bridge
Web Components. Le regole di checkout saranno una Shopify Function TypeScript
sull’API `2026-07`, da riconfermare prima della release `1.0.0`.

Non vengono introdotti server Node separati, ORM o servizi infrastrutturali
aggiuntivi finché un requisito verificato non li rende necessari.

Deploy e release Production richiedono sempre l’autorizzazione esplicita
dell’owner.
