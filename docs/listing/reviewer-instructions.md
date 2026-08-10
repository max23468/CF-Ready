# Reviewer instructions

Written for the Shopify App Store reviewer, in English, to be pasted into the
submission form. The functional walkthrough is reproducible on any Italian
development store; paid Production charges are shown but never approved.

The Italian-facing copy lives in [`listing-it.md`](listing-it.md); this document
is not translated.

---

## 1. What the app does, in one paragraph

Italian merchants who invoice their B2C orders need the customer's **Codice
Fiscale**, the Italian tax code. Shopify already shows the Italian localized tax
fields at checkout (`TAX_CREDENTIAL_IT` and `TAX_EMAIL_IT`) but cannot make them
required or check what was typed. CF Ready configures a single Cart and Checkout
Validation Function that does exactly that: it can mark each field as
`unmanaged`, `optional` or `required`, and it verifies formal correctness — for
the tax code, its length, alphabet, month, day and check character.

The check is **formal only**. The app does not query the Italian Revenue Agency
and does not certify that an address is a genuinely active certified mailbox.
This is stated in the listing and in the app itself.

## 2. Test environment

**No account and no store of ours.** CF Ready is embedded in the Shopify admin
and has no login of its own, so the submission form declares that the app
requires no account. Requirement 4.5.5 is conditional — *«If your app requires
login credentials»* — and the condition does not apply. Providing a pre-installed
test store is a requirement of Payment apps (5.2.1), not of a regular app.

| Item | Value |
| --- | --- |
| Store | any development store whose country and address are in **Italy** |
| Store country | Italy — the app declares a non-Italian store ineligible and starts neither a trial nor a charge |
| Plan | Basic — the app requires no Shopify Plus and no plan-specific feature |
| Product | any published product with stock; the app does not read the catalogue |
| Billing | Use the 14-day trial for the walkthrough. Production uses real manual-pricing charges: open the approval screen in step 10, then cancel without approving |

The instruction pasted in the submission form leads with the Italian store
requirement, because that is the one condition without which none of the steps
below can be reproduced — and a store that is not Italian would make the app
look broken rather than ineligible by design.

## 3. Setting the address

The Italian tax fields only appear when Shopify has an **Italian delivery**.
Use an Italian shipping address at checkout:

```
Via Roma 1
20121 Milano MI
Italy
```

With any non-Italian address, Shopify does not show the fields and CF Ready
never blocks — that behaviour is intentional and is covered in step 5 below.

## 4. Test values

Synthetic strings for format testing only. The tax code is not identity
evidence; the valid email uses IANA's reserved `example.com` domain.

| Field | Valid | Invalid | Why the invalid one fails |
| --- | --- | --- | --- |
| Codice Fiscale | `RSSMRA85T10A562S` | `RSSMRA85T10A562X` | wrong check character — the last letter is computed from the first fifteen |
| PEC | `mario.rossi@example.com` | `mario.rossi@pec` | the domain has no top-level label |

These four values are checked against the shipped validator by
`extensions/cf-ready-validation/tests/validation.test.ts`, so they cannot drift
away from what the app actually accepts.

## 5. Walkthrough and expected results

Each step is independent; run them in order the first time.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open the app in the Admin | The Home shows the setup guide. Click **Open the guided setup**; it opens in Italian or English following the Admin language |
| 2 | On **Regole / Rules**, set Codice Fiscale to **Obbligatorio / Required**, save | The rule is saved. The check is **not** active yet: saving rules and turning the check on are deliberately separate steps |
| 3 | Start the 14-day trial — from the setup card on the Home, or at the end of the guided setup | The trial starts here and nowhere else. It never starts on its own, so until this step the store has no entitlement and step 4 stays disabled |
| 4 | Turn the check on from the Home | One validation object is created for the store. Turning it on again later reuses the same one |
| 5 | Checkout with an Italian address, leaving the tax code empty | Checkout is blocked with the configured message |
| 6 | Enter `RSSMRA85T10A562X` | Blocked: the format is wrong |
| 7 | Enter `RSSMRA85T10A562S` | Checkout completes |
| 8 | Checkout with a non-Italian address | The Italian fields are not shown and checkout completes — a foreign customer is never blocked |
| 9 | Set PEC to **Required** as well, repeat with `mario.rossi@pec` then `mario.rossi@example.com` | Blocked, then allowed. The two rules are independent |
| 10 | On the Home, choose a paid mode and approve it on Shopify's approval screen | The amount and billing interval match the selected mode. After Shopify redirects back to the app, the Home shows the active plan and the **Turn on in checkout** action is available. Shopify may mark the transaction as a test during review; ordinary Production stores are still charged normally (D-129) |
| 11 | Turn the check off | The checkout stops being affected and the configuration is kept, so nothing has to be reconfigured |

## 6. Deliberate behaviours that may look like bugs

- **The trial never starts on its own.** Installing the app and opening it, any
  number of times, spends no trial day: the merchant decides when to begin. Until
  a trial or a payment is active, rules can be configured but the check cannot be
  turned on.
- **Saving rules does not turn the check on.** Two separate actions, by design: a
  merchant can prepare the configuration and choose when it starts affecting live
  checkouts.
- **The app never blocks on its own failure.** If the configuration cannot be
  read, if the entitlement has lapsed, or on any runtime error, checkout stays
  open. A required field that is genuinely missing blocks only when Shopify
  exposes at least one Italian delivery; with no observable delivery the app
  stays open.
- **A non-Italian store is refused up front.** The app says the store is not
  eligible and starts neither a trial nor a payment.
- **The trial runs once per store.** Uninstalling and reinstalling does not
  grant a second trial, and an existing one-time purchase is recognised again.

## 7. Declared limitations

- **Shopify POS is not supported.**
- **Later generations of recurring subscription orders are not covered.** The
  validation surface Shopify provides runs at checkout, not on the automatic
  renewals that follow. The initial subscription checkout is covered.
- **Accelerated checkouts** (Apple Pay, Google Pay, Shop Pay, PayPal) follow the
  compatibility Shopify declares for Validation Functions. Where a wallet is not
  available in the test environment, the server-side block is still verifiable
  through the standard checkout path.
- The app requests a single access scope, `write_validations`. It does not read
  orders, customers, products or inventory.

## 8. Privacy

Tax codes and PEC addresses typed by customers are **never sent to our
systems**: the check runs inside Shopify's infrastructure and its only output is
an error message. Nothing is logged and nothing is stored.

Full policy: `https://cf-ready.pages.dev/en/privacy`.

## 9. Contact

`cfready@icloud.com` — monitored during review; we answer within one business
day.
