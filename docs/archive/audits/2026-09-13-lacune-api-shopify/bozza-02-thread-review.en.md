# Bozza 2 — Risposta nel thread 31931

**Stato:** sospesa dall'owner il 13 settembre fino al ricollegamento di Claude in Chrome. Dopo l'esecuzione CLI dello stesso giorno, il testo va riscritto senza affermare che il bug sia ancora riproducibile per CF Ready nel checkout web dei negozi italiani: la richiesta principale diventa il segnale di intento.

**Dove:** [thread 31931](https://community.shopify.dev/t/bug-cart-validation-functions-two-issues-blocking-migration-from-usebuyerjourneyintercept/31931).

**Prima dell'invio:**

- eseguire la riproduzione fresca (azione interna 2 del dossier) e sostituire ogni segnaposto `<…>`;
- eliminare le frasi non confermate dalla nuova prova;
- usare solo dati sintetici e condividere store, ID dei run e video soltanto in privato con lo staff Shopify.

---

Follow-up from CF Ready, a public app that validates the Italian `TAX_CREDENTIAL_IT` and `TAX_EMAIL_IT` localized fields. Both issues from the original report are still reproducible on API 2026-07 as of <date>.

**Errors not shown on the review step (issue 2)**

Setup: <one-page | three-page> checkout, order confirmation step enabled, validation returning an error on `$.cart.localizedField.TAX_CREDENTIAL_IT` at `CHECKOUT_COMPLETION`.

Result: the Function output contains the error (run ID shared privately on request), "Complete order" on the review step does nothing and no message is displayed. Same result on <desktop | mobile> and in <Italian | English>.

On 30 July 2026 Developer Support told us that the review step doesn't mount the surfaces that host localized field messages, and that there is no banner fallback. Is a fix scheduled? A global summary with a link back to the field would already solve it.

**No step that mirrors native validation timing (issue 1)**

`BuyerJourney` only exposes `step` (`CART_INTERACTION`, `CHECKOUT_INTERACTION`, `CHECKOUT_COMPLETION`). Waiting for the localized field to appear doesn't work as an intent signal. On 8 September 2026, as soon as an Italian address was entered, checkout preselected the only shipping rate, the field appeared and our required error rendered immediately, before the buyer tried to continue.

What would solve it: a signal that the buyer tried to continue or submit (for example a field on `BuyerJourney`), or native "show required errors after the first attempt" behaviour for app validations, with `CHECKOUT_COMPLETION` still enforcing.

We can share run IDs and a screen recording with synthetic data privately.
