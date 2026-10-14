## Sintesi

-

## Verifica

- [ ] Base `develop`, oppure promozione autorizzata `develop` → `main`
- [ ] Il branch contiene già tutto ciò che la modifica comporta: codice, test,
      documentazione e, se cambia una superficie distribuita e il lotto su
      `develop` non ha ancora una versione, bump e changelog
- [ ] `npm run verify:change` eseguito; coverage, browser e mutation restano
      alla CI
- [ ] Nessun segreto o dato personale aggiunto

## Operazioni remote

- Impatto deploy/release: nessuno
- Rollback:
