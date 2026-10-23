# Controlli ufficiali Shopify a ogni release

Prima di ogni release Development o Production, e prima della submission,
l'operatore esegue gli App security checks Shopify sul candidato e conserva
la prova descritta qui. La verifica comprende scansione deterministica e
review del coding agent; `npm audit` e gli altri audit non la sostituiscono.
La scansione deterministica si ripete sempre per intero; la review dell'agente
è [incrementale](#review-incrementale) rispetto all'ultimo
[baseline](../evidence/shopify-security/baseline.md).

## Contratto verificato

Verifica delle fonti e del manifest locale di `@shopify/cli` `4.9.4`:
21 ottobre 2026.

- [Best practice Shopify](https://shopify.dev/docs/apps/build/security/following-security-best-practices#check-your-app-on-every-release):
  richiedono la ripetizione a ogni release.
- [App security checks](https://shopify.dev/docs/apps/build/security/app-security-checks):
  una parte dei controlli richiede l'analisi del coding agent con AI Toolkit.
- [CLI check](https://shopify.dev/docs/api/shopify-cli/app/app-security-check):
  produce risultati locali e istruzioni; `--blocking` controlla l'exit code
  dei finding deterministici, non completa la review dell'agente.
- [CLI record](https://shopify.dev/docs/api/shopify-cli/app/app-security-record)
  e [CLI review](https://shopify.dev/docs/api/shopify-cli/app/app-security-review):
  registrano il documento dell'agente e combinano i risultati. La review può
  essere eseguita anche senza risultati dell'agente; una differenza di scope
  viene segnalata senza cambiare l'exit code.

Non esiste quindi in questa integrazione un gate CI che attesti automaticamente
la verifica completa. Il coordinatore di pubblicazione e i workflow restano
invariati: l'operatore deve controllare la prova prima di avviarli. Una CI verde
non attesta l'esecuzione di questa procedura.

## Esecuzione su un candidato autorizzato

Una richiesta di pubblicazione o promozione autorizza anche questi controlli
locali obbligatori e la review dell'agente corrente, senza conferma aggiuntiva.
Restano soggetti ad autorizzazione specifica nuovi provider e invio del codice
a servizi esterni. La sola manutenzione di questa procedura non avvia né
attesta una scansione.

1. Preparare un checkout isolato del candidato pulito e registrare SHA,
   versione, ambiente e configurazione selezionata. Verificare le versioni
   Node/npm del progetto e installare dal lockfile. Usare la CLI locale fissata,
   senza download implicito di versioni più recenti. Riconfermare le fonti
   sopra se cambia lo strumento o il suo contratto.
2. Usare un coding agent e un provider già autorizzati con Shopify AI Toolkit.
   Non attivare Codex Security, nuovi provider, upload del repository o tool
   che trasmettono codice senza un'autorizzazione specifica. Non mettere nel
   checkout `.env` reali, credenziali o dati merchant. I risultati grezzi possono
   contenere frammenti sensibili: conservarli in locale, fuori da Git e dagli
   artifact pubblici. Disabilitare il reporting CLI con
   `SHOPIFY_CLI_NO_ANALYTICS=1`; ciò non controlla il provider dell'agente.
3. Dalla radice eseguire la sequenza seguente, scegliendo **una** configurazione.
   Per Production ripetere gli stessi comandi con `--config shopify.app.toml` sul
   candidato effettivamente promosso. Non usare `--client-id`, che comporta
   una verifica dell'account, né `--no-git-ignore`, che includerebbe file locali
   ignorati. Non aggiungere esclusioni per ottenere un esito favorevole.

   ```sh
   export SHOPIFY_CLI_NO_ANALYTICS=1
   ./node_modules/.bin/shopify version
   git rev-parse HEAD
   git status --porcelain
   ./node_modules/.bin/shopify app security check --path . --config dev --list-files --no-input
   ./node_modules/.bin/shopify app security check --path . --config dev --blocking high --print-instructions --no-input
   ```

   Conservare elenco file, output, exit code e i file generati sotto
   `.shopify/app-security/shopify.app.dev/` (oppure
   `shopify.app/`). Nessun numero di file è un requisito fisso:
   confrontare lo scope con le superfici del candidato, inclusi `app/`,
   `workers/` ed `extensions/`. Annotare file saltati e motivazioni.
4. Consegnare al coding agent le istruzioni appena generate e seguirne il
   contratto corrente, compreso `shopify app security record`. Solo l'agente
   produce il documento dei finding dopo aver svolto la review: non scrivere
   JSON vuoti o stati di successo per sbloccare il processo. Usare sempre gli
   stessi `--path` e `--config`. Un errore o l'indisponibilità dell'agente
   lascia il controllo incompleto.
5. Mostrare il risultato combinato:

   ```sh
   ./node_modules/.bin/shopify app security review --path . --config dev --blocking high --no-input
   git status --porcelain
   ```

   Verificare anche la presenza di `agent-findings.json`, la corrispondenza
   dello scope con `agent-checks.json` e l'esame di tutti i check applicabili.
   L'exit code da solo non basta. Correggere i finding high prima di distribuire;
   per gli altri conservare valutazione, azione e responsabilità secondo le
   indicazioni Shopify. Un falso positivo richiede motivazione e riferimenti
   al codice: registrarlo come finding soppresso con `suppression.justification`.
   Le soppressioni dell'agente non coprono le occorrenze deterministiche, quindi
   `review --blocking high` può uscire 1 anche senza finding reali: il baseline
   elenca ogni occorrenza con il suo motivo. Una correzione cambia il candidato:
   ripetere la verifica incrementale sul risultato finale.
6. Aggiornare [baseline.md](../evidence/shopify-security/baseline.md) con la
   struttura del [modello di prova](../evidence/templates/shopify-release-security.md)
   e copiare il documento registrato in
   [agent-findings.json](../evidence/shopify-security/agent-findings.json), con
   soli metadati e riferimenti privi di segreti, nello stesso branch del
   candidato. Il record è una prova operativa da verificare, non una certificazione.

## Review incrementale

Il baseline registra SHA, tree, versioni di CLI e ruleset e l'esito di ogni
check. A ogni release:

1. Eseguire il passo 3 per intero: la scansione deterministica richiede pochi
   secondi e rigenera `agent-checks.json`.
2. Elencare i file cambiati con
   `git diff --name-only <SHA baseline> <SHA candidato>` e confrontare le
   versioni dei check in `agent-checks.json` con `agent-findings.json`.
3. Ripetere con l'agente soltanto i check selezionati dalla tabella sotto, quelli
   con versione nuova o diversa, quelli `unresolved` e quelli le cui occorrenze
   deterministiche sono nuove o hanno cambiato file o riga. Un dubbio sulla
   superficie vale come check da ripetere.
4. Per gli altri check riusare voce e finding soppressi di `agent-findings.json`,
   poi registrare con `record` il documento completo: la CLI sostituisce sempre
   tutti i risultati.
5. Aggiornare il baseline indicando quali check sono stati ripetuti e quali
   riusati, con lo SHA da cui proviene ciascun esito riusato.

| File cambiati | Check da ripetere |
| --- | --- |
| Solo documentazione, test, changelog, versione di `package.json` | Nessuno |
| `shopify.app*.toml`, `extensions/**` | Tutti |
| `package-lock.json` o dipendenze | `DEPENDENCY_REACHABILITY`, `COMMITTED_SECRET` |
| `app/routes/**`, `workers/**`, `app/*auth*`, `app/session*`, `app/shopify.server.ts`, `app/webhooks/**`, `app/owner-control/**`, `app/performance*` | `UNAUTHENTICATED_ENDPOINT`, `MISSING_AUTHORIZATION_CHECK`, `CSRF_MISSING_PROTECTION`, `REQUEST_CONTROLLED_ADMIN_CONTEXT`, `REQUEST_DERIVED_SHOP_SCOPE`, `MISSING_TENANT_ISOLATION`, `UNSCOPED_SHOP_CONFIG_WRITE`, `SESSION_LIFECYCLE_AND_REPLAY`, `WEAK_SHOP_VALIDATION`, `OPEN_REDIRECT`, `OVERBROAD_DATA_ACCESS`, `EXPIRING_OFFLINE_TOKEN`, `CREDENTIAL_BROWSER_LEAKAGE`, `CREDENTIAL_LOG_LEAKAGE` |
| Componenti e route `.tsx`, `app/i18n/**`, `site/**` | `CROSS_SITE_SCRIPTING`, `UNSAFE_INNERHTML`, `TEXT_SETTING_HTML_SMUGGLING`, `STATIC_FRAME_ANCESTORS`, `MISSING_EMBEDDED_CSP` |
| Query SQL, repository D1, `migrations/**` | `SQL_INJECTION`, `MISSING_TENANT_ISOLATION`, `OVERBROAD_DATA_ACCESS` |
| `fetch` verso l'esterno, client Partner o Telegram | `SSRF_REQUEST_FORGERY`, `CREDENTIAL_LOG_LEAKAGE` |
| Metafield, Validation, billing o scope richiesti | `METAFIELD_OFFLINE_TOKEN`, `SCOPE_OVER_REQUEST`, `UNSCOPED_SHOP_CONFIG_WRITE` |
| Qualsiasi file nuovo con segreti o configurazione, `cloudflare.config.ts` | `COMMITTED_SECRET`, `CREDENTIAL_LOG_LEAKAGE` |

Si ripetono tutti i check quando cambia la versione minor o major della CLI o
del ruleset, quando il baseline non è dell'ultima release o quando la tabella
non copre un file cambiato.

## Identità del candidato e limiti

Confrontare SHA e tree verificati con il candidato prima del comando di
pubblicazione. Se squash o merge cambiano lo SHA ma conservano il contenuto,
registrare entrambi gli SHA e dimostrare l'identità dei tree con Git. Un tree
diverso richiede una nuova verifica incrementale. Per Production eseguire la
scansione con `--config shopify.app.toml` sul commit promosso e riusare la
review Development dello stesso tree, ripetendo solo i check delle righe
`shopify.app*.toml` se la configurazione Production differisce; registrare il
legame con il commit promosso. Anche un retry deve verificare
che candidato, configurazione e prove siano ancora gli stessi.

La scansione riguarda sorgenti, non il comportamento live. L'esecuzione manuale
su 333 file del 20 ottobre, riportata nell'incarico, è un antecedente storico:
senza risultati, scope e identità del candidato non prova una release successiva.
In questo intervento non è stata ripetuta né attestata.

Collegamento proposto per `security-maintenance.md`, da integrare separatamente:
«Per i controlli ufficiali Shopify a ogni release seguire
[la procedura dedicata](shopify-release-security-checks.md)».
