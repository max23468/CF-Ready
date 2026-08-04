# Reviewer instructions

Written for the Shopify App Store reviewer, in English, to be pasted into the
submission form. Everything below is reproducible on the test store; nothing
here requires contacting us first.

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

## 2. Test store and credentials

| Item | Value |
| --- | --- |
| Store | `cf-ready-dev.myshopify.com` |
| Store country | Italy — required for the app to operate |
| Access | staff account credentials are supplied in the submission form's testing instructions, not in this document |
| Staff permissions | *Manage and install apps and channels*, *Approve app charges*, and *Orders → View* — enough for every step below |
| Plan | Basic — the app requires no Shopify Plus and no plan-specific feature |
| Billing | test charges only; every charge you approve is a Shopify test charge and moves no money |

A testable product is published in the store with stock available and a price
low enough to complete checkout without concern. Any product works: the app does
not read the catalogue.

**The storefront is password protected**, as development stores are by default:
`cf-ready-dev.myshopify.com` redirects to `/password`. The storefront password
is supplied in the submission form's testing instructions alongside the staff
credentials — without it the checkout steps below cannot be reached at all.

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

Synthetic values. They belong to no real person: the tax code is the example
used throughout Italian documentation, and the domains are not live mailboxes.

| Field | Valid | Invalid | Why the invalid one fails |
| --- | --- | --- | --- |
| Codice Fiscale | `RSSMRA85T10A562S` | `RSSMRA85T10A562X` | wrong check character — the last letter is computed from the first fifteen |
| PEC | `mario.rossi@pec.it` | `mario.rossi@pec` | the domain has no top-level label |

These four values are checked against the shipped validator by
`extensions/cf-ready-validation/tests/validation.test.ts`, so they cannot drift
away from what the app actually accepts.

## 5. Walkthrough and expected results

Each step is independent; run them in order the first time.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open the app in the Admin | Guided setup opens, in Italian or English following the Admin language |
| 2 | On **Regole / Rules**, set Codice Fiscale to **Obbligatorio / Required**, save | The rule is saved. The check is **not** active yet: saving rules and turning the check on are deliberately separate steps |
| 3 | Start the 14-day trial — from the setup card on the Home, or at the end of the guided setup | The trial starts here and nowhere else. It never starts on its own, so until this step the store has no entitlement and step 4 stays disabled |
| 4 | Turn the check on from the Home | One validation object is created for the store. Turning it on again later reuses the same one |
| 5 | Checkout with an Italian address, leaving the tax code empty | Checkout is blocked with the configured message |
| 6 | Enter `RSSMRA85T10A562X` | Blocked: the format is wrong |
| 7 | Enter `RSSMRA85T10A562S` | Checkout completes |
| 8 | Checkout with a non-Italian address | The Italian fields are not shown and checkout completes — a foreign customer is never blocked |
| 9 | Set PEC to **Required** as well, repeat with `mario.rossi@pec` then `mario.rossi@pec.it` | Blocked, then allowed. The two rules are independent |
| 10 | On the Home, choose a paid mode | Shopify's charge approval screen appears as a **test charge** |
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
