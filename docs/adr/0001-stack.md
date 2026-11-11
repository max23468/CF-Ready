# ADR 0001 — Stack applicativo

- **Stato:** accettato
- **Data:** 2026-07-28

CF Ready usa React Router e TypeScript su Cloudflare Workers, D1 per i dati
applicativi e R2 per i backup. L’interfaccia embedded usa Polaris e App Bridge
Web Components. Le regole di checkout sono una Shopify Function TypeScript; la
versione API in uso è indicata in
[architecture.md](../engineering/architecture.md).

Non vengono introdotti server Node separati, ORM o servizi infrastrutturali
aggiuntivi finché un requisito verificato non li rende necessari.

Le autorizzazioni a pubblicare e promuovere sono descritte in
[AGENTS.md](../../AGENTS.md#pubblica).
