# Prova dei controlli Shopify della release

Modello da copiare per una verifica realmente eseguita seguendo la
[procedura](../../runbooks/shopify-release-security-checks.md).
Stato iniziale: **NON ESEGUITO**. I segnaposto non costituiscono evidenza.
Non allegare risultati grezzi, snippet sensibili o credenziali.

| Dato | Valore da compilare |
| --- | --- |
| Data, operatore e reviewer | Da compilare |
| Ambiente e configurazione | Da compilare |
| Versione app, SHA e tree analizzati | Da compilare |
| SHA e tree del candidato da pubblicare | Da compilare; provare l'identità del contenuto se cambia SHA |
| Shopify CLI, Toolkit e coding agent/provider autorizzato | Da compilare |
| Fonti ufficiali e data di riconferma | Da compilare |
| Comandi, flag, scope e numero file | Da compilare; includere elenco, esclusioni e file saltati |
| Scansione deterministica | NON ESEGUITA; data, exit code, conteggi per severità |
| Review coding agent | NON ESEGUITA; check esaminati, non applicabili motivati, scope coerente |
| Record e review combinata | NON ESEGUITI; exit code e presenza dei tre JSON Shopify |
| Prove grezze locali | Riferimento riservato, data e hash SHA-256 dei file; nessun upload pubblico |
| Finding e disposizione | ID, severità, esito, motivazione, riferimenti al codice e azioni residue |
| Correzioni e nuova verifica | Da compilare; candidato finale e prove aggiornate |
| Esito operativo | INCOMPLETO finché entrambe le fasi e la verifica del candidato non sono concluse |

Prima di accettare il record verificare i risultati originali, non soltanto
questa tabella. Un exit code zero, l'assenza di finding deterministici o una
CI verde non provano che l'agente abbia completato i check. Una scansione pulita
non prova la sicurezza live. L'autorizzazione alla pubblicazione resta separata.
