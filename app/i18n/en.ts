import type { it } from "./it";

export const en: typeof it = {
  nav: {
    home: "Home",
    rules: "Checkout rules",
    messages: "Customer messages",
    guide: "Help and FAQ",
  },
  common: {
    yes: "Yes",
    no: "No",
    save: "Save",
    cancel: "Cancel",
  },
  conflict: {
    heading: "The configuration has changed",
    body: "Compare the current configuration with your draft. Reapply keeps only fields you edited: review the result, then save.",
    current: "Current",
    draft: "Your draft",
    reapply: "Reapply my changes",
    discard: "Use current configuration",
  },
  errors: {
    validation_locked: "Another operation on this validation is running. Try again shortly.",
    validation_write_failed:
      "Couldn’t save. Shopify didn’t accept the write. Try again; if it keeps failing, contact us.",
    validation_readback_failed:
      "Couldn’t save. Shopify didn’t confirm the write. Reload the page to see the real state.",
    checkout_labels_scope_required:
      "Grant the optional Shopify permissions to read and sync checkout labels.",
    checkout_labels_resource_missing:
      "Shopify doesn’t expose one of the expected labels. Rules still work; use the guided steps.",
    checkout_labels_resource_ambiguous:
      "Shopify exposes more than one resource for the same label. No text was changed.",
    checkout_labels_locale_missing:
      "Italian or English isn’t available on this store. Publish it or continue with the available languages.",
    checkout_labels_conflict:
      "A label changed after the last read. Reload Shopify before choosing which text to keep.",
    checkout_labels_confirmation_required:
      "Confirm the comparison before the first automatic label write.",
    checkout_labels_stale_digest:
      "Shopify updated the content during the save. Reload the labels and try again.",
    checkout_labels_partial_sync: "Rules were saved, but some labels need another attempt.",
    checkout_labels_readback_failed:
      "Shopify didn’t confirm every label. Reload their status before making another change.",
    address2_restore_conflict:
      "The second address line changed after the comparison. Reload Shopify before restoring it.",
    validation_limit_reached:
      "This store already has the maximum number of active validations Shopify allows. Your rules are still saved. Turn off another app’s validation in Settings → Checkout, then try again: CF Ready never touches other apps’ resources.",
    entitlement_required:
      "Start a trial or plan first. Without a valid entitlement, the validation would have no effect.",
    config_conflict:
      "The configuration changed in another window. Compare the values and choose whether to reapply your changes or use the current configuration.",
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
    nextHeading: "Next step",
    badgeActive: "Active",
    badgeInactive: "Turned off",
    badgeNotStarted: "Not active yet",
    titleActive: "Check active at checkout",
    titleDisabled: "Check not active",
    titleNotStarted: "Checkout check not active yet",
    titleLapsed: "Check on, plan not active",
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
    languageSelector: "Message language",
    previewHeading: "Checkout preview",
    previewContext: "When the customer tries to complete the order",
    previewErrorHeading: "Order can’t be completed",
    previewSelected: "Selected message",
    previewFieldLabel: "Field label",
    previewCurrentFieldLabel: "Current Shopify label",
    previewProposedFieldLabel: "Proposed label",
    labelsNote:
      "Labels identify the fields; these messages explain what the customer needs to correct.",
    manageLabels: "Manage labels from Checkout rules",
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
    labelsTitle: "Review checkout labels",
    labelsBody:
      "Compare the tax code and PEC labels in Italian and English; the second address line has a separate check.",
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
      "Rules apply to deliveries in Italy. They do not apply if the billing address is outside Italy. If the delivery country is missing, required fields that Shopify does not show do not block the order.",
    ],
    step2Heading: "Choose what to check",
    step2Body: "You can change these choices whenever you want from Checkout rules.",
    labelsPreviewHeading: "Proposed labels in Italian and English",
    labelsPermissionsGranted: "The permissions used to compare labels are available.",
    labelsPermissionsOptional:
      "You can grant permission to compare labels with Shopify now or continue without enabling it.",
    step3Heading: "Rules preview",
    step3Body: "With the rules you selected:",
    step3Messages: "Configured messages",
    step3MessagesBody:
      "These are the four messages already configured. They’re available in Italian and English and can be edited from Customer messages.",
    step4Heading: "Summary",
    labelsSummary: "Label management",
    address2Summary: "Second address line check",
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
    requestSupport: "Get support",
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
    diagnosis: {
      heading: "Is the check missing?",
      body: "Refresh and check rules, activation and plan using the same sync as Home. Inconsistencies are handled by the app’s normal recovery. This does not verify a real checkout.",
      refresh: "Refresh and check",
      failed:
        "Shopify is unavailable or the state is ambiguous. Try again from Home; an earlier result is not a fresh verification.",
      checkedAt: "Rules and activation checked at",
      enabled: "The validation is enabled on Shopify.",
      disabled: "The validation is disabled or missing. Open Home to manage activation.",
      configured: "At least one field is configured for validation.",
      unconfigured: "Both fields are unmanaged: choose which rules to apply.",
      notChecked: "Rules and activation have not been checked in this session.",
      openPlan: "Check plan",
      lastSync: "Last stored sync",
      unknown: "Unavailable",
      manualHeading: "Check manually at checkout",
      manualBody:
        "Confirm billing and delivery countries, native tax fields and the checkout completion step. “Apartment, suite, etc.” is not the tax code field. These conditions require a manual check.",
      simulate: "Reproduce the case in the simulator",
      entitled: "Trial or plan is valid in the newly synced state.",
      notEntitled: "No valid trial or plan in the newly synced state.",
      checkoutLabels: "Checkout labels",
      address2: "Second address line",
    },
    heading: "Help and FAQ",
    faqHeading: "Frequently asked",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    asideHeading: "What CF Ready does and doesn’t do",
    asideLinks: "Where to set it up",
    asideBody:
      "CF Ready checks the Italian tax code and PEC in Shopify’s native Italian checkout fields according to the rules you choose. It validates their format without confirming the identity of the person entering them. It doesn’t issue invoices or handle VAT numbers or SDI codes.",
    groups: [
      {
        heading: "Rules and validation",
        entries: [
          {
            q: "What does CF Ready do?",
            a: "CF Ready checks the Italian tax code (Codice Fiscale) and certified email address (PEC) in Shopify’s native Italian checkout fields. It can leave them unmanaged, validate them when optional, or make them required, including requiring PEC only when Company is filled in. It can also align the labels shown to customers. It doesn’t add fields to the theme, issue invoices, or handle VAT numbers or SDI codes.",
          },
          {
            q: "Which checkouts do the rules apply to?",
            a: "Rules apply when at least one delivery is in Italy and the billing address is Italian or not yet available. They don’t apply when the billing address is outside Italy or all specified deliveries are abroad. If Shopify doesn’t provide a delivery country, CF Ready checks only the tax fields present in checkout: a field Shopify doesn’t show can’t block the order. You decide when to collect this information based on your business needs.",
          },
          {
            q: "What gets validated?",
            a: "For an ordinary 16-character Italian tax code, CF Ready checks its structure, date, town-code format, omocodia, and check character. For a provisional code, it checks the 11 digits and check digit. For PEC, it only checks that the value has an email-address format. CF Ready doesn’t verify the holder’s identity, whether the mailbox exists, or whether it is listed in a PEC registry.",
          },
          {
            q: "Can I require PEC only when the customer fills in Company?",
            a: "Yes. If you choose “Required when the Company field is filled in”, PEC becomes required when the customer enters a value in the billing address Company field. Otherwise it stays optional, but is still validated when entered. The Company field doesn’t automatically determine the order’s tax treatment.",
          },
          {
            q: "When do checkout errors appear?",
            a: "A value that is present but invalid can be reported while the customer proceeds through checkout. An empty required field can be reported earlier once Shopify has established the delivery; attempting to complete the order still runs the final check. You can customize the messages on the “Customer messages” page.",
          },
        ],
      },
      {
        heading: "Labels and second address line",
        entries: [
          {
            q: "How should I manage the second address line?",
            a: "The second address line (“Apartment, suite, etc.”) must not be used to collect the Italian tax code. On “Checkout rules”, open “Second address line” and indicate whether the field is required, optional, or hidden in Shopify. When it is visible, CF Ready can check its text and restore supported translations, but Shopify doesn’t automatically tell the app which configuration is active.",
          },
          {
            q: "How are checkout labels managed?",
            a: "After you grant permission, CF Ready compares the tax code and PEC labels in Italian and English. It automatically updates only the texts Shopify allows the app to edit; for the others, it shows manual steps. Before writing, it re-reads the current values, so a change made with Translate & Adapt or another app isn’t overwritten without warning.",
          },
          {
            q: "How do I complete a manual label check?",
            a: "On “Checkout rules”, choose the language and open the case that needs attention. Follow the displayed steps to check a real checkout and, if necessary, edit the texts in Shopify’s editor. After saving in Shopify, return to CF Ready and select “Re-read fields from Shopify”. When the values match, confirm the manual check. “Last successful re-read from Shopify” shows when CF Ready read the fields; “Last manual confirmation in checkout” shows when you confirmed the real-checkout check.",
          },
          {
            q: "Why do the tax code or PEC still have a different label?",
            a: "Check that you selected the correct language and open every case listed under “Checkout texts”. A market can inherit the general text or have its own customization. After each Shopify edit, select “Re-read fields from Shopify”, then check a real checkout for the affected language and market.",
          },
          {
            q: "What happens if I stop label management or uninstall CF Ready?",
            a: "If you stop label management, CF Ready stops checking and updating checkout labels, while the tax code and PEC validation rules remain active. Before management stops, it restores automatic translations that still match its last write. If it finds a later change made by you or another app, it preserves it and asks you to resolve the conflict. If you uninstall CF Ready, validation also stops working and the app can no longer manage or restore labels. Shopify can retain existing translations: before uninstalling, run “Restore and stop managing” and check every published language and market.",
          },
        ],
      },
      {
        heading: "Plan, privacy and support",
        entries: [
          {
            q: "How do the trial and payments work?",
            a: "The free trial lasts 14 days, starts only when you launch it, and is available once per store. It doesn’t require a payment method. If you choose the monthly or annual plan during the trial, the remaining days are added as Shopify subscription trial days. If you choose the one-time payment, the charge is immediate and you give up the remaining trial days.",
          },
          {
            q: "Which orders and channels aren’t covered?",
            a: "CF Ready runs in Shopify’s online checkout, including accelerated checkouts supported by Shopify. It doesn’t act in POS, on orders created and completed directly in the admin, or on later generations of recurring subscription orders. Validation is formal and doesn’t query identity or tax registries.",
          },
          {
            q: "What data does CF Ready store?",
            a: "CF Ready doesn’t receive or store tax codes, PEC addresses, orders, or customer data. It stores the shop configuration, trial and plan status, technical events, and label texts required for synchronization and restoration. Shopify can retain the values entered by customers as part of the order.",
          },
          {
            q: "What should I do if something doesn’t look right?",
            a: "Use “Refresh and check” under “The check doesn’t appear?” on this page to check rules, activation, and plan. Use “Re-read fields from Shopify” on Checkout rules to refresh labels. Then check a real checkout for the affected language and market. If the issue remains, select “Copy diagnostics” in the Support box and paste the result into your request without adding customer data.",
          },
        ],
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
    labelsSaved: "Rules saved. The labels need attention.",
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
      required_when_company: "Required when Company is filled in",
      required_when_companyHelp:
        "Requires PEC when the Company field in the billing address is filled in. Otherwise PEC stays optional and is validated when entered.",
    },
    exceptionsHeading: "When rules apply",
    exceptions: [
      "Rules apply to deliveries in Italy. They do not apply if the billing address is outside Italy. If the delivery country is missing, required fields that Shopify does not show do not block the order.",
    ],
    previewHeading: "What customers will see",
    simulator: {
      unknownCountry: "Not provided",
      eyebrow: "CF Ready · checkout simulation",
      heading: "Test checkout",
      privatePreview: "Interactive preview",
      previewLanguage: "Preview language",
      labelsAfterSave: "Labels shown after saving the rules",
      italian: "Italiano",
      english: "English",
      orderContext: "Order destination",
      customerData: "Customer tax details",
      company: "Company",
      deliveryCountry: "Delivery country",
      billingCountry: "Billing country",
      countries: { IT: "Italy", FR: "France", DE: "Germany" },
      advanced: "Advanced options",
      checkoutStep: "Checkout stage",
      interaction: "Entering details",
      completion: "Order completion",
      shippingSelected: "Shipping method selected",
      mixedDelivery: "Add a foreign delivery",
      taxCodePresent: "Shopify shows the Italian tax code field",
      pecPresent: "Shopify shows the PEC field",
      scenarioLabel: "Try a scenario",
      scenarioHelp: "Choose an example: the simulator fills the fields and shows the result.",
      scenarioPlaceholder: "Choose an example",
      scenarios: {
        valid: "Valid details",
        invalidTaxCode: "Invalid tax code",
        invalidPec: "Invalid PEC",
        numericTaxCode: "Valid provisional numeric tax code",
        omocodiaTaxCode: "Valid tax code with omocodia",
        companyWithoutPec: "Company filled in without PEC",
        empty: "Empty fields",
      },
      clear: "Clear",
      continue: "Continue",
      examples: {
        taxCode: "Synthetic examples: RSSMRA85T10A562S, 12345678903, AAAAAAL0A01A000K.",
        pec: "Synthetic example: mario.rossi@example.com.",
      },
      diagnostics: {
        taxCode: {
          valid: "The format is valid.",
          length: "The value must contain 16 characters or 11 digits.",
          characters: "The value contains unsupported characters.",
          date_structure: "The structure or embedded date is invalid.",
          check_character: "The check character or digit does not match.",
        },
        pec: {
          valid: "The email format is valid.",
          email_format: "Check the @ sign, local part, domain, and spaces.",
        },
      },
      outcomes: {
        notApplied: "Rules not applied",
        noChecks: "No checks",
        editing: "Filling in details",
        blocked: "Checkout blocked",
        ready: "Checkout ready",
      },
    },
    history: {
      heading: "Configuration history",
      body: "The latest 10 configurations from the previous 90 days are available. Restoring updates rules and messages; the current plan and activation stay in place.",
      messages: "Customer messages",
      changed: (fields: string[]) => `Changes: ${fields.join(", ")}.`,
      restore: "Restore this configuration",
    },
    labels: {
      heading: "Checkout labels (advanced settings)",
      nativeHeading: "Checkout text",
      permissionsHeading: "Check Shopify labels",
      permissionsBody:
        "Grant access only to translations, languages and markets. CF Ready doesn’t read orders, customers or checkout entries.",
      requestPermissions: "Grant permissions",
      statusManagedByShopify: "Managed by Shopify",
      statusManualRequired: "Manual verification required",
      nativeSummaryNeedsAccess: "Grant access to check the checkout text.",
      nativeSummaryNeedsReview: (count: number) =>
        `${count === 1 ? "One checkout needs" : `${count} checkouts need`} verification.`,
      nativeSummaryNeedsChoice: "Choose whether CF Ready should manage this text.",
      nativeSummaryError: "CF Ready did not complete the latest check.",
      nativeSummaryKept: "You chose to keep the current text.",
      nativeSummaryReady: "The text matches the saved rules.",
      enable: "Automatically manage labels supported by Shopify",
      enableGuided: "Keep guided label checks active",
      enableConfirm: "I compared the current and proposed fields",
      enableConfirmHeading: "Confirm automatic management",
      enableConfirmBody: "CF Ready will update these fields through Shopify:",
      enableConfirmAction: "Confirm and save",
      mode: "Mode",
      modeValues: {
        off: "Off",
        guided: "Guided",
        automatic: "Automatic",
        partial: "Mixed",
      },
      current: "Current field",
      proposed: "Field after saving",
      language: "Language",
      italian: "Italiano",
      english: "English",
      unchanged: "Keep the current text",
      noChange: "No changes",
      generalText: "Default for this language",
      marketException: (market: string) => `Customization for the ${market} market`,
      unknownMarket: "unidentified market",
      allMarketsSame: "All markets use this text",
      marketCheckIncluded: (markets: string[]) =>
        `Also check checkout for ${markets.join(", ")}: Shopify doesn’t identify its configuration with certainty.`,
      primary: "primary",
      unpublished: "not published",
      marketAmbiguous:
        "Shopify reports at least one market with an inherited or non-unique configuration. CF Ready groups matching values and identifies the additional checkouts to verify.",
      refresh: "Read fields again from Shopify",
      refreshComplete: "Fields refreshed from Shopify.",
      stop: "Restore and stop managing",
      lastSync: (value: string) => `Last successful read from Shopify: ${value}`,
      neverSynced: "No successful read from Shopify yet",
      operationalSummary: (automatic: number, manual: number) =>
        `${automatic} ${automatic === 1 ? "label" : "labels"} managed by Shopify · ${manual} manual ${manual === 1 ? "verification" : "verifications"} required`,
      manualHeading: "How to complete the manual verification",
      manualSteps: (
        language: string,
        market: string | null,
        primary: boolean,
        verificationMarkets: string[],
      ) => [
        market
          ? `Open the storefront and select ${market} as the country or region and ${language} as the language.`
          : `Open the storefront in the default market and select ${language} as the language.`,
        ...(verificationMarkets.length > 0
          ? [
              `Repeat the check with ${verificationMarkets.join(", ")} selected as the country or region and ${language} as the language.`,
            ]
          : []),
        "For every case listed, add a product to the cart and continue to checkout.",
        "Compare the tax code and PEC labels with the “Field after saving” value shown here.",
        "If they differ, select “Open the checkout text editor”. In Shopify, under Checkout language, select “Edit checkout content”.",
        ...(primary && !market
          ? [
              "In the editor, select “Search and filter results”. For the tax code, search for the value shown as “Current field” and edit only Checkout localized fields additional information → Tax credential it; ignore B2B locations → Tax id.",
              "For PEC, search for “PEC”, scroll to Checkout localized fields additional information, and edit Tax email it. Enter the corresponding “Field after saving” for both fields, then select “Save”.",
              ...(verificationMarkets.length > 0
                ? [
                    `If a label differs only in ${verificationMarkets.join(", ")}, select “Translate” in the editor, open the “Translating into…” selector, and choose “Adapt a market” → ${verificationMarkets.join(", ")} → ${language}. Open Checkout and system, use “Filter fields” to find Tax credential it or Tax email it, enter the corresponding “Field after saving”, and save.`,
                  ]
                : []),
            ]
          : [
              "In the editor, select “Translate”. If Shopify Translate & Adapt displays its introductory guide, select “Next” through the final screen, then select “Close”.",
              market
                ? `Open the “Translating into…” selector and choose “Adapt a market” → ${market} → ${language}.`
                : `Check that “Translating into ${language}” is selected at the top. If it isn’t, open the “Translating into…” selector and choose ${language} under “Translate for all markets”.`,
              "Open Checkout and system. Under “Filter fields”, search for Tax credential it and Tax email it, enter the corresponding “Field after saving” for each one, then select “Save”.",
            ]),
        "Return to CF Ready and select “Read fields again from Shopify”. When the two values match, the confirmation button becomes available.",
      ],
      manualMismatch:
        "Shopify is still returning a different text. Change and save it using the steps above, then select “Read fields again from Shopify”.",
      openStorefront: "Open storefront",
      openCheckoutContentEditor: "Open the checkout text editor",
      confirmGuided: "Confirm manual verification",
      lastManualVerification: (value: string) => `Last manual confirmation in checkout: ${value}`,
      checkoutCheckRequired: "manual checkout verification required",
      keepNative: "Keep my labels",
      keepNativeAccepted: "Choice recorded: keep the current labels",
      addressHeading: "Second address line",
      addressModeLabel: "Second address line configuration",
      addressModePlaceholder: "Select the active configuration",
      addressModeHelp:
        "Select the option active under Settings → Checkout. Shopify doesn’t expose it automatically to CF Ready.",
      addressModeSummary:
        "Select whether the second address line is required, optional, or hidden.",
      addressRequired: "Required",
      addressOptional: "Optional",
      addressHidden: "Hidden",
      addressHiddenSummary: "The second address line is hidden in checkout.",
      addressHiddenHelp: "There are no labels to check while the field remains hidden.",
      addressStatus: {
        unknown: "Needs checking",
        expected: "No tax label detected",
        nonstandard: "Custom text",
        fiscal_conflict: "Possible duplicate",
      },
      addressSummary: {
        unknown: "Grant access to check the second address line text.",
        expected: "No tax label was detected in the second address line.",
        nonstandard: "The second address line uses custom text that does not look fiscal.",
        fiscal_conflict:
          "The second address line is labelled as a tax code and may create a duplicate.",
      },
      addressLimit:
        "CF Ready checks the text. Visibility and requirement settings stay in Shopify checkout settings.",
      notAvailable: "Not available",
      standardLabel: "Shopify text",
      restoreAddress: "Restore manageable translations",
      restoreAddressConfirm:
        "Do you confirm the comparison? CF Ready will restore only the translations and overrides shown, then read Shopify again.",
      keepAddress: "Keep this customization",
      openCheckout: "Open checkout settings",
      sourceManual:
        "Restore the primary language source text from Shopify’s checkout content editor.",
      noSnapshot: "Grant permissions to compare this store’s current texts.",
    },
  },
  checkout: {
    nothing: "No fields are configured: checkout stays unchanged.",
    taxCodeRequired: "The tax code is required and must be formally valid.",
    taxCodeOptional: "The tax code can be left empty; if entered, it must be formally valid.",
    pecRequired: "PEC is required and must use a valid email format.",
    pecRequiredWhenCompany:
      "PEC is required when the Company field is filled in; otherwise it stays optional and is validated when entered.",
    pecOptional: "PEC can be left empty; if entered, it must use a valid email format.",
    summaryBlocking: "An Italian customer can’t complete the order without the required fields.",
    summaryConditional: "PEC is required for Italian orders when the Company field is filled in.",
    summaryChecking: "What Italian customers enter is checked, but nothing is required.",
    disabled: "The validation is turned off: these rules don’t apply to customers yet.",
    lapsed:
      "The validation is on but your plan isn’t: while that’s the case, checkout blocks nothing.",
  },
};
