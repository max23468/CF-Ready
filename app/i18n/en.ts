import type { it } from "./it";

export const en: typeof it = {
  nav: {
    home: "Home",
    rules: "Checkout rules",
    messages: "Customer messages",
    guide: "Help and FAQ",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
  },
  errors: {
    validation_locked: "Another operation on this validation is running. Try again shortly.",
    validation_write_failed:
      "Couldn’t save. Shopify didn’t accept the write. Try again; if it keeps failing, contact us.",
    validation_readback_failed:
      "Couldn’t save. Shopify didn’t confirm the write. Reload the page to see the real state.",
    validation_limit_reached:
      "This store already has the maximum number of active validations Shopify allows. Your rules are still saved. Turn off another app’s validation in Settings → Checkout, then try again: CF Ready never touches other apps’ resources.",
    country_not_eligible:
      "CF Ready only works with stores based in Italy. Your rules are still saved.",
    entitlement_required:
      "Start a trial or plan first. Without a valid entitlement, the validation would have no effect.",
    config_conflict:
      "The rules changed in another tab or from another staff member while you were editing. Reload the page to see the current ones, then redo your change: we don’t overwrite someone else’s work.",
    duplicate_validations:
      "Shopify returned more than one CF Ready validation. They were turned off to keep checkout fail-open, but we can’t choose which one to keep without risking your configuration: none is deleted automatically.",
    duplicate_validations_active:
      "Shopify returned more than one CF Ready validation and didn’t confirm that they were turned off. Try the repair again: no validation is deleted automatically.",
    billing_read_failed:
      "Plan information isn’t up to date. Checkout isn’t blocked: reload the page in a few minutes.",
    one_time_already_active:
      "This store already has the one-time payment: another charge wouldn’t add anything.",
    charge_pending:
      "A one-time payment is already waiting for approval. Complete it or wait for it to expire before trying again.",
    charge_failed: "Couldn’t start the payment. Try again shortly.",
    trial_unavailable:
      "This store has already used its trial. Choose how to pay to apply the checkout rules again.",
    no_subscription: "There’s no subscription to cancel.",
    cancel_failed: "The cancellation didn’t go through. Try again shortly.",
    generic: "Something went wrong. Try again; if it keeps failing, contact us.",
  },
  home: {
    heading: "CF Ready",
    howHeading: "How the rules apply",
    nextHeading: "Next step",
    badgeActive: "Active",
    badgeInactive: "Turned off",
    badgeNotStarted: "Not active yet",
    titleActive: "Check active at checkout",
    titleDisabled: "Check not active",
    titleNotStarted: "Checkout check not active yet",
    titleLapsed: "Check on, plan not active",
    unsupported: "Store not supported",
    unsupportedBody:
      "CF Ready only works with stores based in Italy. No trial has started, no validation has been created and no payment has been requested.",
    unsupportedCheckAddress:
      "If your store is Italian, check the address in Settings → Store details: that’s where CF Ready reads the country from.",
    unsupportedGuide: "The Help page explains what the app does and where its limits are.",
    noEntitlement:
      "Without an active plan, checkout no longer blocks anything. Rules and messages stay saved and apply again once you pay.",
    syncNeeded:
      "What you see here may not match Shopify. Checkout isn’t blocked. Reload the page in a few minutes.",
    repair: "Repair configuration",
    messagesLabel: "Customer messages",
    messagesDefault: "Default",
    messagesCustom: "Edited",
    editRules: "Edit rules",
    activate: "Turn on in checkout",
    deactivate: "Turn off in checkout",
    deactivateConfirm:
      "From now on checkout stops checking the fields. Rules and messages stay saved and you can turn them back on whenever you want.",
    nextConfigure: "Choose which fields to check in checkout.",
    nextActivate: "Your rules are ready. Turn them on to apply them in checkout.",
    nextTestOrder: "Review your next orders to confirm that the rules are applied as expected.",
    nextStartTrial:
      "Your rules are ready. Start the free trial whenever you want, or choose a plan now.",
    nextChoosePlan: "Choose a plan to apply your rules in checkout again.",
    helpHeading: "Help and support",
    helpBody: "What CF Ready checks, what it doesn’t, and what happens in the edge cases.",
    checkInHeading: "Thank you for choosing CF Ready",
    checkInBody:
      "The checkout check is active. If you have feedback on the setup or need help, message the developer directly.",
    checkInContact: "Message me",
    checkInDismiss: "Don’t show this again",
    nextAddress2:
      "Stop using the “Apartment, suite, etc.” field for the tax code: right now customers see two fields for the same value. The steps are on Checkout rules.",
  },
  messages: {
    heading: "Customer messages",
    saved: "Messages saved.",
    italian: "Italiano",
    english: "English",
    taxCodeRequired: "Tax code required",
    taxCodeInvalid: "Tax code invalid",
    pecRequired: "PEC required",
    pecInvalid: "PEC invalid",
    counter: (used: number) => `${used}/200 characters`,
    tooLong: "200 characters maximum.",
    empty: "The message can’t be empty.",
    reset: "Restore default texts",
    resetConfirm: (language: string) =>
      `The four ${language} messages go back to their default texts. The others don’t change, and it only takes effect once you save.`,
    appearHeading: "Messages linked to your rules",
    appearIntro:
      "These indicators depend on the rules you chose, not on whether the check is active. A message can appear at checkout only while the check is active.",
    appears: "Expected",
    appearsNot: "Not expected",
  },
  setup: {
    heading: "Get CF Ready ready",
    welcome: "Choose what to check and when to turn the checkout rules on.",
    progress: (done: number, total: number) => `${done} of ${total} done`,
    rulesTitle: "Choose what to check",
    rulesBody: "Decide whether the tax code and PEC are not managed, optional or required.",
    activateTitle: "Turn on in checkout",
    activateBody: "Until you turn it on, your rules are saved but don’t apply to customers.",
    planTitle: "Start the free trial",
    planTitleLapsed: "Choose a plan",
    planTitleActive: "Access active",
    planBody: "The free trial lasts 14 days, requires no card, and starts only when you launch it.",
    planBodyLapsed:
      "The trial has ended. Choose a plan to apply your rules at checkout again; your configuration and messages stay saved.",
    startTrial: "Start the free trial",
    address2Title: "Stop using the “Apartment, suite, etc.” field",
    guided: "Open the guided setup",
  },
  onboarding: {
    heading: "Set up CF Ready",
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
    back: "Back",
    next: "Continue",
    welcomeHeading: "Welcome to CF Ready",
    welcomeBody:
      "Set up the tax code and PEC checks, review customer messages, and choose when to turn on the rules.",
    step1Heading: "What it does and doesn’t do",
    step1Body:
      "CF Ready checks the Italian tax code (Codice Fiscale) and certified email address (PEC) in Shopify checkout. It doesn’t change your theme, add fields or issue invoices.",
    step1Limits: [
      "It only checks data format: it doesn’t confirm the customer’s identity or that an address is actually a certified PEC address.",
      "Rules only apply when delivery and billing are both in Italy.",
    ],
    step2Heading: "Choose what to check",
    step2Body: "You can change these choices whenever you want from Checkout rules.",
    step3Heading: "Rules preview",
    step3Body: "With the rules you selected:",
    step3Messages: "Configured messages",
    step3MessagesBody:
      "These are the four messages already configured. They’re available in Italian and English and can be edited from Customer messages.",
    step4Heading: "Summary",
    step4BodyReady: "Your rules are saved but not active yet.",
    step4BodyNeedsEntitlement: "Your rules are saved but not active yet.",
    step4TrialHeading: "Trial and plan",
    step4TrialBody: "Start the free trial or choose a plan before turning them on.",
    step4StartTrial: "Start the free trial",
    step4SeePlans: "Compare plans",
    step4TrialActive: "The trial is active: you can turn on the checkout check.",
    step4PlanActive: "Your plan is active: you can turn on the checkout check.",
    reviewStep4Body: "The check is already active at checkout. Complete the review to return Home.",
    activate: "Turn on in checkout",
    finishWithout: "Return Home without turning on",
    completeReview: "Complete review",
    doneHeading: "Setup complete",
    doneBody:
      "Your rules are saved. You can change them whenever you want, and these steps stay available from the Help page.",
    reopen: "Review your initial setup",
  },
  support: {
    heading: "Support",
    body: "Requests reach whoever builds the app and get an answer written by hand. The link opens your mail app with a message already filled in: you can read it and edit it before sending.",
    privacyNote:
      "The message only carries your store domain, app version, language and technical status. Don’t attach tax codes, PEC addresses, orders or your customers’ data: they aren’t needed to understand a problem.",
    subject: "CF Ready support",
    chooseCategory: "Choose a topic:",
    categories: {
      checkout: "Checkout and rules",
      billing: "Plan and payment",
      other: "Other",
    },
    technicalHeading: "--- Technical details, you can delete them ---",
    fieldShop: "Store",
    fieldVersion: "App version",
    fieldLanguage: "Language",
    fieldCountry: "Detected country",
    fieldEntitlement: "Trial or plan active",
    fieldEntitlementKind: "Entitlement type",
    fieldValidation: "Check active at checkout",
    fieldErrorCode: "Last error code",
    fieldConfigSchema: "Configuration schema version",
    fieldConfigHash: "Configuration hash",
    fieldStateRevision: "State revision",
    fieldLastSync: "Last synchronization",
    fieldDiagnosticId: "Diagnostic ID",
    copyDiagnostics: "Copy diagnostics",
    diagnosticsCopied: "Diagnostics copied. Paste them into your support request.",
    diagnosticsCopyFailed: "The diagnostics could not be copied.",
    entitlementKinds: {
      annual: "annual",
      complimentary: "complimentary",
      monthly: "monthly",
      none: "none",
      one_time: "one-time",
      trial: "trial",
    },
    yes: "yes",
    no: "no",
  },
  guide: {
    heading: "Help and FAQ",
    faqHeading: "Frequently asked",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    asideHeading: "What CF Ready does and doesn’t do",
    asideLinks: "Where to set it up",
    asideBody:
      "CF Ready exists so you stop receiving Italian orders to invoice without a tax code: it makes the field required in the native checkout field and checks its shape. It doesn’t verify that the code belongs to whoever entered it, doesn’t issue invoices and doesn’t handle VAT numbers or SDI codes.",
    entries: [
      {
        q: "What CF Ready does",
        a: "CF Ready checks the Italian tax code (Codice Fiscale) and the certified email address (PEC) in the native Italian checkout field. It doesn’t change your theme, doesn’t add fields and doesn’t issue invoices: it only decides whether an order can be completed with the values entered.",
      },
      {
        q: "When the tax code is required",
        a: "When you set it as required and the customer has both delivery and billing in Italy. You decide whether you need it: CF Ready doesn’t determine when your business has to collect it.",
      },
      {
        q: "Why an order went through without the required fields",
        a: "Rules don’t apply with foreign billing or only foreign deliveries. In express checkout, if Shopify exposes an Italian delivery but omits a required field, CF Ready shows a global error and blocks completion; without an observable delivery, an absent field remains fail-open because the customer might have nothing to fill in.",
      },
      {
        q: "What gets checked on the tax code",
        a: "Its composition: length, structure, date, town code and check character. Both the ordinary 16-character form, including omocodia variants, and the provisional 11-digit form are accepted. A formally valid tax code may still not belong to the person entering it, and it isn’t verified with the Italian tax authority.",
      },
      {
        q: "How PEC is validated",
        a: "As an email address: the format is checked. We don’t verify that the mailbox exists, nor that it’s really a certified mailbox.",
      },
      {
        q: "When customers see errors",
        a: "Normally when they try to continue. If you turn on early warnings, errors can appear as soon as checkout loads: that’s the recommended mode if you keep Shopify’s order confirmation step, because it stops customers reaching the review page blocked and without a message. CF Ready can’t read that setting on your store: the choice is yours.",
      },
      {
        q: "I use the “Apartment, suite, etc.” field for the tax code",
        a: "The tax code belongs in the native Italian checkout field. If you also collect it in the second address line, customers see two fields for the same value: open Settings → Checkout and set that line to “Optional” or “Don’t include”, then restore the original label from “Manage checkout language”. CF Ready can’t read or change that setting: the warning you see in the app is based on what you told us.",
      },
      {
        q: "Trial and payments",
        a: "The trial lasts fourteen days, one per store, with no payment method required. If you choose a plan during the trial you don’t lose the days you have left: Shopify receives them as trial days on the subscription.",
      },
      {
        q: "Limitations and supported channels",
        a: "CF Ready works on Shopify’s web checkout and needs a store based in Italy. The check is only formal, not against any registry, and orders created outside the checkout, for example from the admin, don’t go through it. Later generations of recurring subscription orders aren’t covered.",
      },
      {
        q: "Electronic invoicing, VAT number and SDI code",
        a: "CF Ready doesn’t issue, transmit or store invoices, and it doesn’t connect to the Italian exchange system. VAT numbers and SDI codes follow different validation rules and flows from the two fields we handle, and the checkout’s localized fields don’t expose them the same way: they aren’t part of what we’re working on today.",
      },
      {
        q: "Privacy and data",
        a: "CF Ready doesn’t store tax codes, PEC addresses, orders or any of your customers’ data. The check happens during checkout and leaves no trace of the values entered.",
      },
      {
        q: "What happens if I turn the checkout check off",
        a: "Checkout goes back to how it was and no order is blocked any more. Your rules and messages stay saved and apply again when you turn it back on.",
      },
      {
        q: "Something doesn’t look right",
        a: "Reload the page: on opening, the app re-reads its state from Shopify and repairs safe divergences. If a sync warning stays, checkout isn’t blocked, and if the problem persists contact us quoting the code shown.",
      },
      {
        q: "Reviewing your initial setup",
        a: "You can change rules and messages whenever you want from their own pages. The guided steps stay available and going through them again resets nothing: your saved choices stay as they are.",
      },
      {
        q: "Contacting the developer",
        a: "Write to cfready@icloud.com, or use the link in the side column: it prepares the message with your store’s technical details already filled in. We answer by hand, usually within one business day. If the problem is blocking your checkout, say so in the subject line.",
      },
    ],
  },
  plan: {
    heading: "Plan",
    trial: (date: string) => `Trial active until ${date}.`,
    oneTime: "One payment active, no renewals.",
    complimentary: "Complimentary permanent plan active, with no renewals.",
    subscription: (date: string) => `Subscription active until ${date}.`,
    trialOver: "Trial over: choose a plan to apply your rules again.",
    trialEndsSoon: (date: string) =>
      `Your trial ends on ${date}. After that date checkout no longer blocks orders missing the required fields, and your rules and messages stay saved.`,
    trialLastDay: (date: string) =>
      `Today is the last day of your trial: it ends on ${date}. From tomorrow checkout blocks nothing, and your rules and messages stay saved.`,
    none: "No active plan.",
    notStartedStatus: "The free trial has not started yet.",
    notStartedHeading: "Before turning the check on",
    notStartedBody:
      "Start the free 14-day trial to turn on the rules. It requires no card and starts only when you launch it.",
    startTrial: "Start the 14-day trial",
    startTrialDone: "Trial started.",
    orChoose: "Or choose a plan directly.",
    monthlyStart: "Start monthly",
    monthlySwitch: "Switch to monthly",
    annualStart: "Start annual",
    annualSwitch: "Switch to annual",
    oneTimeSwitch: "Switch to one payment",
    oneTimeStart: "Choose one payment",
    cancelRenewal: "Cancel renewal",
    cancelBody:
      "Access stays until the end of the period you already paid for, with no partial refund. Your rules and messages stay saved.",
    firstCharge: (date: string) =>
      `If you start today, the first charge is on ${date}: you keep the trial days you have left.`,
    firstChargeNow: "The charge starts as soon as you approve it on Shopify.",
    oneTimeCharge:
      "One charge as soon as you approve it on Shopify. Any remaining trial days are given up.",
    oneTimeChargeNotStarted:
      "One charge as soon as you approve it on Shopify. The free trial will not be started.",
    chooseNowHeading: "Choose a plan now",
    chooseHeading: "How you want to continue",
    chooseBody:
      "Every plan has the same features. Shopify handles the charges on your store invoice.",
    oneTimeSettled:
      "One payment for this store, with no renewals. It includes app updates and support, at no extra cost. There’s nothing else to choose.",
    complimentarySettled:
      "The complimentary plan is active for this store. It includes app updates and support, with no charges.",
    recommended: "Recommended",
    generationLaunch: "Launch prices are reserved for this store.",
    generationStandard: "Standard prices apply to this store.",
    nextCharge: (date: string) => `Next charge on ${date}.`,
    periodEnds: (date: string) => `The paid period ends on ${date}.`,
    lastAttempt:
      "The last read of your billing status failed. Checkout isn’t blocked: reload the page in a few minutes.",
    netCost: (amount: string) => `Estimated net cost today: ${amount}.`,
    endingAlready:
      "The renewal is already cancelled: access stays until the end of the period you paid for.",
    monthlyName: "Monthly",
    annualName: "Annual",
    oneTimeName: "One payment",
    creditEstimate: (amount: string) =>
      `Estimated credit for the unused period: ${amount}. It’s an estimate: on the Shopify invoice the purchase can appear at full price with the credit listed separately, and the actual amount is the one Shopify calculates.`,
  },
  rules: {
    heading: "Checkout rules",
    saved: "Rules saved.",
    taxCodeLabel: "Italian tax code (Codice Fiscale)",
    pecLabel: "Certified email address (PEC)",
    taxCode: {
      unmanaged: "Not managed",
      unmanagedHelp: "CF Ready doesn’t check the field. Checkout stays as it is today.",
      optional_validated: "Optional and validated",
      optional_validatedHelp:
        "Customers can leave it empty. If they fill it in, it must be formally valid.",
      required_validated: "Required and validated",
      required_validatedHelp:
        "Customers can’t complete the order without a formally valid tax code.",
    },
    pec: {
      unmanaged: "Not managed",
      unmanagedHelp: "CF Ready doesn’t check the field. Checkout stays as it is today.",
      optional_validated: "Optional and validated",
      optional_validatedHelp:
        "Customers can leave it empty. If they fill it in, it must be a valid email format.",
      required_validated: "Required and validated",
      required_validatedHelp:
        "Customers can’t complete the order without an address in a valid email format.",
    },
    exceptionsHeading: "When rules apply",
    exceptions: ["These rules only apply to orders with delivery and billing in Italy."],
    preventiveLabel: "Show warnings early in checkout",
    preventiveHelp:
      "Errors can appear as soon as checkout loads, before the customer has filled the fields in. Recommended only if you use Shopify’s order confirmation step, because it stops customers reaching the review page blocked without a message.",
    previewHeading: "What customers will see",
    simulator: {
      eyebrow: "CF Ready · checkout simulation",
      heading: "Test checkout",
      privatePreview: "Interactive preview",
      orderContext: "Order destination",
      customerData: "Customer tax details",
      deliveryCountry: "Delivery country",
      billingCountry: "Billing country",
      countries: { IT: "Italy", FR: "France", DE: "Germany" },
      validExamples: "Use valid examples",
      clear: "Clear",
      continue: "Continue to payment",
      outcomes: {
        notApplied: "Rules not applied",
        noChecks: "No checks",
        checkAtPayment: "Check at payment",
        blocked: "Checkout blocked",
        ready: "Checkout ready",
      },
    },
    address2Heading: "Don’t use the “Apartment, suite, etc.” field for the tax code",
    address2Body:
      "Do you also use “Apartment, suite, etc.” for the tax code? Customers will see two fields. Select the checkbox to see how to remove it.",
    address2Checkbox: "Yes, I use “Apartment, suite, etc.” for the tax code",
    address2Instructions:
      "Two steps. In Settings → Checkout, under “Form options”, set the second address line to “Optional” or “Don’t include”; then, if you changed its label, restore it from “Manage checkout language”, or from Settings → Languages, “Checkout and system” tab, for a translated language.",
  },
  checkout: {
    nothing: "No fields are configured: checkout stays unchanged.",
    taxCodeRequired: "The tax code is required and must be formally valid.",
    taxCodeOptional: "The tax code can be left empty; if entered, it must be formally valid.",
    pecRequired: "PEC is required and must use a valid email format.",
    pecOptional: "PEC can be left empty; if entered, it must use a valid email format.",
    summaryBlocking: "An Italian customer can’t complete the order without the required fields.",
    summaryChecking: "What Italian customers enter is checked, but nothing is required.",
    preventive:
      "Warnings appear as soon as checkout loads, not only when the customer tries to continue.",
    disabled: "The validation is turned off: these rules don’t apply to customers yet.",
    lapsed:
      "The validation is on but your plan isn’t: while that’s the case, checkout blocks nothing.",
  },
};
