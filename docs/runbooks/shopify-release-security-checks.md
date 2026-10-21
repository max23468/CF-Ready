# Controlli ufficiali Shopify a ogni release

Prima di ogni release Development o Production, e prima della submission,
l'operatore esegue gli App security checks Shopify sul candidato e conserva
la prova descritta qui. La verifica comprende scansione deterministica e
review del coding agent; `npm audit` e gli altri audit non la sostituiscono.

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
   Per Production ripetere gli stessi comandi con `--config production` sul
   candidato effettivamente promosso. Non usare `--client-id`, che comporta
   una verifica dell'account, né `--no-git-ignore`, che includerebbe file locali
   ignorati. Non aggiungere esclusioni per ottenere un esito favorevole.

   ```sh
   export SHOPIFY_CLI_NO_ANALYTICS=1
   ./node_modules/.bin/shopify version
   git rev-parse HEAD
   git status --porcelain
   ./node_modules/.bin/shopify app security check --path . --config development --list-files --no-input
   ./node_modules/.bin/shopify app security check --path . --config development --blocking high --print-instructions --no-input
   ```

   Conservare elenco file, output, exit code e i file generati sotto
   `.shopify/app-security/shopify.app.development/` (oppure
   `shopify.app.production/`). Nessun numero di file è un requisito fisso:
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
   ./node_modules/.bin/shopify app security review --path . --config development --blocking high --no-input
   git status --porcelain
   ```

   Verificare anche la presenza di `agent-findings.json`, la corrispondenza
   dello scope con `agent-checks.json` e l'esame di tutti i check applicabili.
   L'exit code da solo non basta. Correggere i finding high prima di distribuire;
   per gli altri conservare valutazione, azione e responsabilità secondo le
   indicazioni Shopify. Un falso positivo richiede motivazione e riferimenti
   al codice. Una correzione cambia il candidato: ripetere la verifica sul
   risultato finale e non riusare i file precedenti come prova fresca.
6. Compilare il [modello di prova](../evidence/templates/shopify-release-security.md)
   con soli metadati e riferimenti privi di segreti. Collegarlo al record di
   readiness o alla descrizione della PR prima della pubblicazione autorizzata.
   Il record è una prova operativa da verificare, non una certificazione.

## Identità del candidato e limiti

Confrontare SHA e tree verificati con il candidato prima del comando di
pubblicazione. Se squash o merge cambiano lo SHA ma conservano il contenuto,
registrare entrambi gli SHA e dimostrare l'identità dei tree con Git. Un tree
diverso richiede una nuova verifica. Non trasferire automaticamente una prova
Development a Production: ripetere il controllo con la configurazione Production
e registrare il legame con il commit promosso. Anche un retry deve verificare
che candidato, configurazione e prove siano ancora gli stessi.

La scansione riguarda sorgenti, non il comportamento live. L'esecuzione manuale
su 333 file del 20 ottobre, riportata nell'incarico, è un antecedente storico:
senza risultati, scope e identità del candidato non prova una release successiva.
In questo intervento non è stata ripetuta né attestata.

Collegamento proposto per `security-maintenance.md`, da integrare separatamente:
«Per i controlli ufficiali Shopify a ogni release seguire
[la procedura dedicata](shopify-release-security-checks.md)».
