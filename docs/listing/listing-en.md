# App Store listing — English

Ready-to-paste listing copy. The Italian version is
[`listing-it.md`](listing-it.md); the two must stay aligned — if a fact changes,
change it in both within the same edit.

Italian is the primary published listing language. This English copy remains
the aligned source for the additional language, which the Partner Dashboard
still marks as incomplete and unpublished as of 23 August 2026.

Field character limits must be **reconfirmed in the Partner Dashboard when
filling the listing in**. Actual lengths are stated below each text so a tighter
limit means trimming, not rewriting.

Sources: §14 and §24 of the
[Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md), `app/plans.server.ts`
for amounts, `extensions/cf-ready-validation/` for checkout behaviour.

---

## Name and identity

| Field | Value |
| --- | --- |
| App name | CF Ready — Codice Fiscale nel Checkout |
| Short name in Admin | CF Ready |
| Handle | `cf-ready` |
| Proposed category | Store management → Tax and compliance — **to be checked against the real list** in the Partner Dashboard: this is a guess, not a verified category |
| Availability | merchants in Italy only |
| Icon | `docs/brand/assets/png/icon-app-1200.png` |
| Feature image | `docs/brand/assets/png/feature-image-en-1600.png` |

The feature image needs alt text alongside it:

> The Codice Fiscale and PEC fields of the Italian checkout, showing the
> "Valid format" result.

It describes what is visible, not what we would like the reader to conclude: alt
text that repeats the tagline is useless to someone who cannot see the image.

## Tagline

> Codice Fiscale and PEC, required and validated at Italian checkout.

**67 characters.**

## Introduction

> CF Ready makes the Italian tax code required at checkout and checks that it is
> formally correct before the order is completed, using the tax field Shopify
> already exposes for Italy.

**181 characters.**

## Description

> **The problem.** Italian merchants who invoice their B2C orders need the
> customer's Codice Fiscale — the Italian tax code. An order without it means
> chasing the customer by email and issuing the invoice late. Shopify shows the
> Italian tax fields at checkout, but offers no way to make them required or to
> check what was typed.
>
> **What CF Ready does.** It makes the Codice Fiscale optional or required, and
> verifies that it is formally correct — length, alphabet, month, day and check
> character — before the order is completed. The same applies to the PEC address,
> Italy's certified email, which you can leave out or require alongside the tax
> code. The two rules are independent.
>
> **It uses the field that is already there.** CF Ready adds no checkout fields:
> it acts on the localized tax fields Shopify itself shows when delivery is in
> Italy. No theme changes, no code to paste, no Shopify Plus — it works on
> standard plans.
>
> **It does not block legitimate sales.** If the configuration cannot be read, if
> the entitlement has lapsed or if anything goes wrong, checkout stays open. A
> foreign customer, who never even sees the Italian fields, is never blocked.
>
> **What it does not do.** Validation is formal, not registry-based: CF Ready
> does not check with the Italian Revenue Agency that a code exists or belongs to
> whoever typed it, and does not certify that a formally valid address is a
> genuinely active PEC mailbox. It does not issue invoices and does not handle
> Italian e-invoicing, VAT numbers or SDI recipient codes. It does not operate in
> POS. Later generations of recurring subscription orders are not covered:
> validation runs at checkout, not on the automatic renewals that follow.

**1 671 characters**, formatting excluded.

## Key features

1. **Codice Fiscale required and validated** — formal correctness checked before
   the order is completed.
2. **PEC as an independent rule** — require it alongside the tax code, or leave
   it out.
3. **No theme changes** — uses the tax fields Shopify already exposes for Italy.
4. **Foreign customers excluded** — the rule applies only when delivery is
   Italian.
5. **Never blocks on failure** — if the app is unavailable, checkout stays open.

## Channels and declared limitations

To be shown in the listing with the same weight as the benefits, not tucked at
the end.

| Scope | Status |
| --- | --- |
| Online checkout | supported |
| Accelerated checkouts (Apple Pay, Google Pay, Shop Pay, PayPal) | supported per the compatibility Shopify declares for Validation Functions |
| In-store pickup with Italian delivery | included when the fields are present |
| Mixed orders | included if at least one delivery is in Italy |
| Shopify POS | **not supported** |
| Recurring subscription generations | **not covered** |
| Non-Italian stores | the app declares the store ineligible and starts neither trial nor payment |

## Pricing and trial

A **14-day** free trial, once per store, with every feature active and no charge.

| Mode | Launch price | Note |
| --- | --- | --- |
| Monthly | € 2.99 / month | |
| Annual | € 29.90 / year | recommended |
| One-time payment | € 89.90 | one payment, no renewal, a single store |

All three modes have **identical functionality**: no artificial tiers. Launch
prices apply for the first 90 days; whoever subscribes keeps the price they
acquired. All payments go through Shopify's app billing.

**The listing shows USD while the charge is in EUR.** The Partner Dashboard plan
editor has no currency field, so the amounts are entered as a USD equivalent,
rounded up so the listing never promises less than the invoice asks. The euro
price is repeated among the plan features, inside *Pricing details* — the only
area where requirements 4.2.2 and 4.2.3 allow amounts. Reasons and sources in
§14.2 of the [Master Plan](../plans/2026-07-28-CF-Ready-Master-Plan.md).

Check the amounts in `app/plans.server.ts` before publishing: listing and code
must state the same figure.

## Privacy

> Your customers' tax codes and PEC addresses never reach us. The check runs
> inside Shopify's infrastructure, during checkout, and the value entered is
> never sent to our systems, never logged and never stored. The app does not read
> orders, customers, products or inventory: the only permission requested is the
> one needed to manage its own validation.

## Links

| Item | URL |
| --- | --- |
| Support | `https://cf-ready.pages.dev/en/support` |
| Privacy | `https://cf-ready.pages.dev/en/privacy` |
| Terms | `https://cf-ready.pages.dev/en/terms` |
| Contact | `cfready@icloud.com` |

## What must not be written

Constraints from §9.2 of the [brand](../brand/brand-foundation.md) and §24 of the
Master Plan, repeated here because the listing is where they are tempting to
break.

- no social proof, no install counts, no quoted reviews until they genuinely
  exist;
- no percentage of orders "recovered" or errors "avoided": we have no such
  measurement and will not have one;
- do not present the app as mandatory for every Italian store;
- do not state or imply a registry-based check;
- no Shopify trademarks inside the icon, feature image or screenshots.
