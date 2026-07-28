# Contribuire a CF Ready

CF Ready è una public app Shopify ancora in sviluppo. Prima di un contributo
sostanziale, apri una issue per verificare che rientri nel perimetro della 1.0.

Per vulnerabilità usa esclusivamente la procedura in
[`SECURITY.md`](SECURITY.md), non una issue pubblica.

## Pull request

1. Parti da `develop` e mantieni il diff circoscritto.
2. Usa commit e titolo PR in formato Conventional Commits.
3. Non includere segreti, token, dati fiscali, domini reali di merchant o dati
   personali; usa fixture sintetiche.
4. Esegui:

   ```sh
   mise exec -- npm ci
   mise exec -- npm run check
   ```

5. Compila il template PR, inclusi impatto operativo e rollback.

Le PR ordinarie vengono unite con squash. `main` accetta soltanto promozioni
autorizzate da `develop`.

## Licenza

La visibilità pubblica del repository non concede automaticamente diritti di
riuso. Finché non è presente un file `LICENSE`, concorda prima con il
maintainer qualsiasi riutilizzo o contributo sostanziale.
