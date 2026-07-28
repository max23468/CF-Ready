# Contratti tecnici M1

Questo documento descrive il proof of concept consegnato da M1. Non estende il
perimetro della 1.0 e non sostituisce il
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md).

## Runtime e autenticazione

- Runtime: React Router e TypeScript su Cloudflare Workers.
- `app/routes/app.tsx` autentica ogni richiesta embedded e restituisce
  `{ apiKey: string }` al client.
- `app/shopify.server.ts` usa token offline con scadenza e refresh gestiti
  dalla libreria Shopify (`expiringOfflineAccessTokens: true`).
- `D1SessionStorage` conserva access token, refresh token e payload della
  sessione cifrati AES-256-GCM. La chiave è il secret
  `SESSION_ENCRYPTION_KEY`, 32 byte codificati in base64.
- I webhook `app/uninstalled` e `app/scopes_update` passano sempre da
  `authenticate.webhook`; il primo elimina le sessioni dello store, il secondo
  aggiorna gli scope della sessione.

## Home embedded

Il loader di `app/routes/app._index.tsx`:

1. autentica la richiesta;
2. legge nome e paese dello shop tramite Admin GraphQL;
3. legge le Validation disponibili;
4. salva `country_code` in D1 e ne esegue il readback;
5. restituisce:

```ts
{
  shopName: string;
  countryCode: string;
  validationEnabled: boolean;
}
```

L'action accetta soltanto `intent=enable` o `intent=disable`. Crea o aggiorna
la Validation PoC di CF Ready e ne verifica il readback. Gli esiti sono
`{ ok: true }` oppure `{ ok: false, error: string }`.

L'interfaccia usa Polaris Web Components, espone lo stato corrente e un solo
pulsante contestuale. Durante una mutation il pulsante è disabilitato; gli
errori sono presentati in un banner critical. Non sono richiesti CSS o stato
client custom.

## Validation PoC

| Proprietà | Valore |
| --- | --- |
| titolo | `CF Ready — PoC tecnico` |
| Function handle | `cf-ready-validation` |
| `blockOnFailure` | `false` |
| namespace metafield | `$app:cf-ready-validation` |
| chiave metafield | `function-configuration` |
| configurazione | `{"pocVersion":1,"enabled":true}` |

La Function:

- opera solo in `CHECKOUT_COMPLETION`;
- legge soltanto `TAX_CREDENTIAL_IT`;
- se il localized field è assente applica il fail-open;
- se il campo è presente ma vuoto restituisce l'errore sul target
  `$.cart.localizedFields.TAX_CREDENTIAL_IT`;
- su configurazione mancante o non valida e su errore runtime applica il
  fail-open.

M1 non implementa ancora la validazione formale completa, le tre modalità
merchant o PEC: sono deliverable successivi.

## D1

La migrazione `0001_initial.sql` crea `shops` e `shopify_sessions`. Shopify
resta autorevole per Validation e token; D1 conserva soltanto stato operativo.
Le migrazioni applicate non vengono riscritte.

## Verifica e handoff

I gate locali sono:

```sh
mise exec -- npm test
mise exec -- npm run test:function
mise exec -- npm run build:function
mise exec -- npm run preflight:dev
mise exec -- npm run check
```

Il test Worker copre cifratura e roundtrip di access token, refresh token e
relative scadenze. Le fixture Function coprono CF vuoto e CF presente. Per i
test di route successivi usare richieste sintetiche e mockare Admin GraphQL e
D1 ai confini, senza dati merchant.

Le evidenze osservate sono registrate in
[M1 proof of concept](../evidence/2026-07-28-m1-proof-of-concept.md).
