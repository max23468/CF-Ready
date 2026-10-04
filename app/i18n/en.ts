import type { it } from "./it";

// EN-3: un solo nome per il campo. Da solo è «Italian tax code (Codice Fiscale)», nei nomi composti
// «Italian tax code»; mai «Tax code».
const TAX_CODE_NAME = "Italian tax code (Codice Fiscale)";

export const en: typeof it = {
  nav: {
    home: "Home",
    rules: "Checkout rules",
    messages: "Customer messages",
    guide: "Help and FAQ",
  },
  errorPage: {
    reload: "Reload the page",
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
      "Shopify returns more than one text for the same label, so CF Ready didn’t change anything. Check the labels in the checkout text editor; if the problem persists, contact us.",
    checkout_labels_locale_missing:
      "Italian or English isn’t available on this store. Publish it or continue with the available languages.",
    checkout_labels_conflict:
      "A label changed after the last read. Select “Read fields again from Shopify” before choosing which text to keep.",
    checkout_labels_confirmation_required:
      "Confirm the comparison before the first automatic label write.",
    checkout_labels_confirmation_pending:
      "Rules were saved. Update the listed labels in Shopify, then confirm them in CF Ready.",
    checkout_labels_stale_digest:
      "Shopify updated the content during the save. Select “Read fields again from Shopify” and try again.",
    checkout_labels_partial_sync: "Rules were saved, but some labels need another attempt.",
    checkout_labels_readback_failed:
      "Shopify didn’t confirm every label. Select “Read fields again from Shopify” before making another change.",
    address2_restore_conflict:
      "The second address line changed after the comparison. Select “Read fields again from Shopify” before restoring it.",
    validation_limit_reached:
      "This store already has the maximum number of active validations Shopify allows. Your rules are still saved. Turn off another app’s validation in Settings → Checkout, then try again.",
    entitlement_required: "Start the trial or choose a plan to turn on the check.",
    config_conflict:
      "The configuration changed in another window. Compare the values and choose whether to reapply your changes or use the current configuration.",
    duplicate_validations:
      "Shopify returned more than one CF Ready validation, so we turned them off without deleting any. Contact us and we’ll help you choose which one to keep.",
    duplicate_validations_active:
      "Shopify returned more than one CF Ready validation and didn’t confirm that they were turned off. Try the repair again.",
    billing_read_failed: "Plan information isn’t up to date. Reload the page in a few minutes.",
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
    validationHeading: "Checkout check",
    titleLapsed: "Check on, plan not active",
    noEntitlement:
      "Without an active plan, your rules don’t apply at checkout. Rules and messages stay saved and apply again once you pay.",
    syncNeeded: "What you see here may not match Shopify. Reload the page in a few minutes.",
    verifying: "Checking with Shopify…",
    verified: "Status confirmed by Shopify",
    verificationUnavailable: "Shopify status needs checking",
    verificationFailed: "We couldn’t check your status with Shopify.",
    verificationRetry: "Try again",
    repair: "Repair configuration",
    messagesLabel: "Customer messages",
    messagesDefault: "Default",
    messagesCustom: "Edited",
    pecRequiredForCompanies: "Required for companies",
    editRules: "Edit rules",
    activate: "Turn on in checkout",
    deactivate: "Turn off in checkout",
    activated: "Check turned on in checkout.",
    deactivated: "Check turned off.",
    openOrders: "Open orders",
    showPlans: "See the options",
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
    italian: "Italian",
    english: "English",
    taxCodeRequired: "Italian tax code required",
    taxCodeInvalid: "Italian tax code invalid",
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
      "Messages are grouped by the rules you chose. They can appear at checkout only while the check is active.",
    appears: "Can appear",
    appearsNot: "Does not appear",
    fieldNames: { taxCode: TAX_CODE_NAME, pec: "PEC" },
    shortLabels: {
      taxCodeRequired: "Required",
      taxCodeInvalid: "Invalid",
      pecRequired: "Required",
      pecInvalid: "Invalid",
    },
    languageSelector: "Message language",
    previewHeading: "Message example",
    previewContext: "When the customer tries to complete the order",
    previewSelected: "Selected message",
    previewHint:
      "This example shows the message text. Its position and appearance at checkout depend on Shopify.",
    previewNotShown: "With the current rules this message does not appear at checkout.",
    previewShown: "With the current rules this message can appear at checkout.",
    editorHeading: "Error messages",
    previewFieldLabel: "Field label",
    previewCurrentFieldLabel: "with the current Shopify label",
    previewProposedFieldLabel: "with the label proposed by CF Ready",
    labelsNote: "Customize tax code and PEC errors. For field names, open Checkout rules.",
    manageLabels: "Open Checkout rules",
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
      "CF Ready checks the Italian tax code (Codice Fiscale) and certified email address (PEC) in Shopify’s native checkout fields, without changing your theme.",
    step1Limits: [
      "It only checks data format: it doesn’t confirm the customer’s identity or that an address is actually a certified PEC address.",
      "Rules apply to deliveries in Italy. They do not apply if the billing address is outside Italy. If the delivery country is missing, required fields that Shopify does not show do not block the order.",
    ],
    step2Heading: "Choose what to check",
    step2Body: "You can change these choices whenever you want from Checkout rules.",
    step3Heading: "Rules preview",
    labelsMixedDescription:
      "Mixed mode supports automatic updates and manual checks. “Checkout rules” shows any checks still to complete.",
    step3Body: "With the rules you selected:",
    step3Messages: "Checkout messages",
    step3MessagesBody:
      "These messages may appear when checkout data does not meet the selected rules. You can edit them in Italian and English from Customer messages.",
    step3NoMessages:
      "Tax Code and PEC are both unmanaged: CF Ready does not show error messages for these fields. You can go back to step 2 to choose what to check.",
    step4Heading: "Summary",
    labelsSummary: "Label management",
    address2Summary: "Second address line check",
    step4BodyReady: "Your rules are saved but not active yet.",
    step4BodyNeedsEntitlement: "Your rules are saved but not active yet.",
    step4TrialHeading: "Trial and plan",
    step4TrialBody: "Start the free trial or choose a plan before turning them on.",
    step4StartTrial: "Start the free trial",
    step4SeePlans: "Compare plans",
    step4TrialActive: "The trial is active.",
    step4PlanActive: "Your plan is active.",
    reviewStep4Body: "The check is already active at checkout.",
    activate: "Turn on in checkout",
    finishWithout: "Return Home without turning on",
    goHome: "Return Home",
    doneHeading: "Setup complete",
    doneBody:
      "Your rules are saved. You can change them whenever you want, and these steps stay available from the Help page.",
    reopen: "Review your initial setup",
  },
  support: {
    heading: "Support",
    body: "The person who builds the app answers you directly. The link opens your mail app with a message already filled in.",
    privacyNote:
      "The message includes your store domain, app version, language and technical status: that’s usually all we need to understand the problem.",
    subject: "CF Ready support",
    chooseCategory: "Choose a topic",
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
      body: "Reads rules, activation and plan again from Shopify. To see the real behaviour, then try an order at checkout.",
      refresh: "Refresh and check",
      failed:
        "We couldn’t read the status from Shopify. Try again shortly with “Refresh and check”.",
      enabled: "The validation is enabled on Shopify.",
      disabled: "The validation is disabled or missing. Open Home to manage activation.",
      configured: "At least one field is configured for validation.",
      unconfigured: "Both fields are unmanaged: choose which rules to apply.",
      notChecked:
        "Diagnostics have not been run in this session. This does not mean the check is inactive.",
      openPlan: "Check plan",
      lastSync: "Last check of rules and activation",
      unknown: "Unavailable",
      manualHeading: "Check manually at checkout",
      manualBody:
        "Confirm billing and delivery countries, native tax fields and the checkout completion step. “Apartment, suite, etc.” is not the tax code field. These conditions require a manual check.",
      simulate: "Reproduce the case in the simulator",
      entitled: "Trial or plan active.",
      notEntitled: "No active trial or plan.",
      labelsStatus: {
        synced: "Checkout labels are up to date.",
        action_required: "Checkout labels need attention.",
        scope_required: "Grant permissions to check the labels.",
        unknown: "Checkout labels have not been checked yet.",
      },
      address2Decision: {
        accepted: "You chose to keep the customization.",
        manual_restore_required: "Manual restore required.",
      },
    },
    complimentaryBillingAnswer:
      "Your store has a permanent complimentary plan: there is no trial or payment to manage.",
    heading: "Help and FAQ",
    faqHeading: "Frequently asked questions",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    asideHeading: "What CF Ready does and doesn’t do",
    asideLinks: "Where to set it up",
    asideBody:
      "CF Ready checks the Italian tax code and PEC in Shopify’s native Italian checkout fields according to the rules you choose. It checks the format of the values, not the identity of the person entering them. It doesn’t issue invoices or handle VAT numbers or SDI codes.",
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
            a: "Rules apply when at least one delivery is in Italy and the billing address is Italian or not yet available. They don’t apply when the billing address is outside Italy or all specified deliveries are abroad. If Shopify doesn’t provide a delivery country, CF Ready checks only the tax fields present in checkout: a field Shopify doesn’t show can’t block the order.",
          },
          {
            q: "What gets validated?",
            a: "For an ordinary 16-character Italian tax code, CF Ready checks its structure, date, town-code format, omocodia, and check character. For a provisional code, it checks the 11 digits and check digit. For PEC, it only checks that the value has an email-address format. CF Ready doesn’t verify the holder’s identity, whether the mailbox exists, or whether it is listed in a PEC registry.",
          },
          {
            q: "Can I require PEC only when the customer fills in Company?",
            a: "Yes. If you choose “Required when the Company field is filled in”, PEC becomes required when the customer enters a value in the billing address Company field. Otherwise it stays optional, but is still validated when entered.",
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
            a: "On “Checkout rules”, choose the language and open the case that needs attention. Follow the displayed steps to check a real checkout and, if necessary, edit the texts in Shopify’s editor. After saving in Shopify, return to CF Ready and select “Read fields again from Shopify”. When the values match, confirm the manual check. “Last read of labels from Shopify” shows when CF Ready read the fields; “Last manual confirmation in checkout” shows when you confirmed the real-checkout check.",
          },
          {
            q: "Why do the tax code or PEC still have a different label?",
            a: "Check that you selected the correct language and open every case listed under “Checkout text”. A market can inherit the general text or have its own customization. After each Shopify edit, select “Read fields again from Shopify”, then check a real checkout for the affected language and market.",
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
            id: "billing",
            q: "How do the trial and payments work?",
            a: "The free trial lasts 14 days, starts only when you launch it, and is available once per store. It doesn’t require a payment method. If you choose the monthly or annual plan during the trial, the remaining days are added as Shopify subscription trial days. If you choose the one-time payment, the charge is immediate and you give up the remaining trial days.",
          },
          {
            q: "Which orders and channels aren’t covered?",
            a: "CF Ready runs in Shopify’s online checkout, including accelerated checkouts supported by Shopify. It doesn’t act in POS, on orders created and completed directly in the admin, or on later generations of recurring subscription orders.",
          },
          {
            q: "What data does CF Ready store?",
            a: "CF Ready doesn’t receive or store tax codes, PEC addresses, orders, or customer data. It stores the shop configuration, trial and plan status, technical events, and label texts required for synchronization and restoration. Shopify can retain the values entered by customers as part of the order.",
          },
          {
            q: "What should I do if something doesn’t look right?",
            a: "Use “Refresh and check” under “Is the check missing?” on this page to check rules, activation, and plan. Use “Read fields again from Shopify” on Checkout rules to refresh labels. Then check a real checkout for the affected language and market. If the issue remains, select “Copy diagnostics” in the Support box and paste the result into your request.",
          },
        ],
      },
    ],
  },
  plan: {
    heading: "Plan",
    trial: (date: string) => `Trial active until ${date}.`,
    trialActive: "Free trial active.",
    oneTime: "One payment active, no renewals.",
    complimentary: "Complimentary permanent plan active, with no renewals.",
    subscription: (date: string) => `Subscription active until ${date}.`,
    trialOver: "Trial over: choose a plan to apply your rules again.",
    trialEndsSoon: (date: string) =>
      `Your trial ends on ${date}. Choose a plan to keep checking the tax code and PEC at checkout; your rules and messages stay saved.`,
    trialLastDay: (date: string) =>
      `Today is the last day of your trial: it ends on ${date}. Choose a plan to keep your rules active from tomorrow; your rules and messages stay saved.`,
    none: "No active plan.",
    notStartedStatus: "The free trial has not started yet.",
    notStartedHeading: "Before turning the check on",
    notStartedBody:
      "Start the free 14-day trial to turn on the rules. It requires no card and starts only when you launch it.",
    startTrial: "Start the 14-day trial",
    orChoose: "Or choose a plan directly.",
    monthlyStart: "Start monthly",
    monthlyPeriod: "per month",
    annualPeriod: "per year",
    oneTimePeriod: "once",
    monthlyDescription: "Renews every month until you cancel the renewal.",
    annualDescription: (monthly: string) =>
      `Works out to ${monthly} a month and renews every year.`,
    monthlySwitch: "Switch to monthly",
    annualStart: "Start annual",
    annualSwitch: "Switch to annual",
    oneTimeSwitch: "Switch to one payment",
    oneTimeStart: "Choose one payment",
    cancelRenewal: "Cancel renewal",
    cancelBody:
      "Access stays until the end of the current period, with no credit for unused days. Your rules and messages stay saved.",
    firstCharge: (date: string) =>
      `If you start today, the first charge is on ${date}: you keep the trial days you have left.`,
    firstChargeAfterTrial:
      "If you start today, the first charge comes after the trial ends: you keep the trial days you have left.",
    firstChargeNow: "The charge starts as soon as you approve it on Shopify.",
    oneTimeCharge:
      "One charge as soon as you approve it on Shopify. Any remaining trial days are given up.",
    oneTimeChargeNotStarted:
      "One charge as soon as you approve it on Shopify. The free trial will not be started.",
    chooseNowHeading: "Choose a plan now",
    chooseHeading: "How you want to continue",
    chooseBody:
      "Every plan has the same features. Shopify handles the charges on your store invoice.",
    oneTimeSettled: "Includes app updates and support, at no extra cost.",
    complimentarySettled: "Includes app updates and support, with no charges.",
    includedHeading: "What the plan includes",
    recommended: "Recommended",
    generationLaunch: "Launch prices are reserved for this store.",
    generationStandard: "Standard prices apply to this store.",
    nextCharge: (date: string) => `Next charge on ${date}.`,
    periodEnds: (date: string) => `The current contract period ends on ${date}.`,
    lastAttempt: "We couldn’t read your plan status. Reload the page in a few minutes.",
    endingAlready: "Renewal cancelled: access stays until the end of the current period.",
    monthlyName: "Monthly",
    annualName: "Annual",
    oneTimeName: "One payment",
    creditExpected: "Shopify will apply any credit for the unused period separately.",
    creditProcessing: "We’re checking whether a credit is due. You don’t need to do anything.",
    creditComplete: "Shopify has recorded the credit.",
  },
  rules: {
    heading: "Checkout rules",
    saved: "Rules saved.",
    labelsSaved: "Rules saved. The labels need attention.",
    showLabels: "Show labels",
    labelsConflict:
      "The Shopify labels changed after the last read. CF Ready read them again and kept your changes: press Save again.",
    taxCodeLabel: TAX_CODE_NAME,
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
      heading: "Checkout simulator",
      previewLanguage: "Preview language",
      italian: "Italian",
      english: "English",
      orderContext: "Order destination",
      customerData: "Customer tax details",
      noFieldsShown:
        "In this scenario Shopify doesn’t show the fields managed by CF Ready, so the customer has nothing to fill in.",
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
      missingRequiredField: (label: string) =>
        `The “${label}” field is required, but Shopify does not show it in this scenario. With an Italian delivery, the order is blocked at completion.`,
      showMissingFields:
        "To try entering a value, open “Advanced options” and select “Shopify shows the field” for the missing field.",
      scenarioLabel: "Try a scenario",
      scenarioPlaceholder: "Choose a scenario",
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
      diagnostics: {
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
    labels: {
      heading: "Checkout labels",
      loading: "Reading Shopify labels…",
      nativeHeading: "Checkout text",
      permissionsHeading: "Check Shopify labels",
      permissionsBody:
        "To compare labels, CF Ready needs access to translations, languages and markets.",
      requestPermissions: "Grant permissions",
      statusUpToDate: "Up to date",
      statusKept: "Managed by you",
      statusManualRequired: "Needs review",
      statusChoiceRequired: "Set up required",
      statusError: "Check not completed",
      nativeSummaryNeedsAccess: "Grant access to check the checkout text.",
      nativeSummaryNeedsReview: (count: number, languages: string[]) =>
        `${count === 1 ? "One checkout" : `${count} checkouts`} in ${languages.join(" and ")} ${count === 1 ? "needs" : "need"} verification.`,
      languageNames: { it: "Italian", en: "English" },
      nativeSummaryNeedsChoice: "Choose whether CF Ready should manage this text.",
      nativeSummaryError: "CF Ready did not complete the latest check.",
      nativeSummaryKept: "You chose to keep the current text.",
      nativeSummaryReady: "The text matches the saved rules.",
      enable: "Automatically manage labels supported by Shopify",
      enableGuided: "Keep guided label checks active",
      disableWarning:
        "When you save, CF Ready restores the labels it wrote and stops updating them. Labels changed by you or by other apps stay as they are.",
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
      fieldColumn: "Field",
      current: "Current field",
      proposed: "Field after saving",
      language: "Label language",
      italian: "Italian",
      english: "English",
      unchanged: "Keep the current text",
      noChange: "No changes",
      generalText: "Default for this language",
      marketException: (market: string) => `Customization for the ${market} market`,
      unknownMarket: "unidentified market",
      allMarketsSame: "All markets use this text.",
      marketCheckIncluded: (markets: string[]) =>
        `Also check checkout for ${markets.join(", ")}: Shopify doesn’t identify its configuration with certainty.`,
      primary: "Primary language.",
      unpublished: "Language not published.",
      marketAmbiguous:
        "Shopify reports at least one market with an inherited or non-unique configuration. CF Ready groups matching values and identifies the additional checkouts to verify.",
      refresh: "Read fields again from Shopify",
      refreshComplete: "Fields refreshed from Shopify.",
      stop: "Restore and stop managing",
      lastReadLabel: "Last read from Shopify",
      neverSynced: "No successful read yet",
      automaticCountLabel: "Labels updated automatically",
      close: "Close",
      manualHeading: "How to complete the manual verification",
      manualSteps: (
        language: string,
        market: string | null,
        primary: boolean,
        verificationMarkets: string[],
      ) => [
        market
          ? `Open the storefront and, under “Country/region”, choose an available country in the ${market} market. Select ${language} as the language.`
          : `Open the storefront in the default market and select ${language} as the language.`,
        ...(verificationMarkets.length > 0
          ? [
              `Repeat the check for ${verificationMarkets.join(", ")}: under “Country/region”, choose an available country in each market and keep ${language} as the language.`,
            ]
          : []),
        "For every case listed, add a product to the cart and continue to checkout. Set Italy as the delivery country and select an Italian address recognized by Shopify: the tax code and PEC fields appear after the address is accepted.",
        "Compare the Italian tax code and PEC labels with the “Field after saving” value in the CF Ready table.",
        "If they differ, select “Open the checkout text editor”. In Shopify, under “Checkout language”, select “Edit checkout content”.",
        ...(primary && !market
          ? [
              "In the editor, select “Search and filter results”. For the tax code, search for the value shown as “Current field” and edit only “Checkout localized fields additional information → Tax credential it”; ignore “B2B locations → Tax id”.",
              "For PEC, search for “PEC”, scroll to “Checkout localized fields additional information”, and edit “Tax email it”. Enter the corresponding “Field after saving” for both fields, then select “Save”.",
              ...(verificationMarkets.length > 0
                ? [
                    `If a label differs only in ${verificationMarkets.join(", ")}, select “Translate” in the editor, open the “Translating into…” selector, and choose “Adapt a market”. Open ${verificationMarkets.join(", ")} one at a time with ${language} selected, then under “Checkout and system” use “Filter fields” to find “Tax credential it” or “Tax email it”, enter the corresponding “Field after saving”, and save.`,
                  ]
                : []),
            ]
          : [
              "In the editor, select “Translate”. If Shopify Translate & Adapt displays its introductory guide, select “Next” through the final screen, then select “Close”.",
              market
                ? `Open the “Translating into…” selector and choose “Adapt a market” → ${market} → ${language}.`
                : `Check that “Translating into ${language}” is selected at the top. If it isn’t, open the “Translating into…” selector and choose ${language} under “Translate for all markets”.`,
              "Open “Checkout and system”. Under “Filter fields”, search for “Tax credential it” and “Tax email it”, enter the corresponding “Field after saving” for each one, then select “Save”.",
            ]),
        "Return to CF Ready and select “Read fields again from Shopify”. When the two values match, the confirmation button becomes available.",
      ],
      manualMismatch:
        "Shopify is still returning a different text. Correct it by following “How to complete the manual verification”, then select “Read fields again from Shopify”.",
      openStorefront: "Open storefront",
      openCheckoutContentEditor: "Open the checkout text editor",
      confirmGuided: "Confirm manual verification",
      lastManualVerification: (value: string) => `Last manual confirmation in checkout: ${value}`,
      checkoutCheckRequired: "Manual checkout verification required.",
      keepNative: "Keep my labels",
      keepNativeAccepted: "Choice recorded: keep the current labels",
      addressHeading: "Second address line",
      addressModeLabel: "Second address line configuration",
      addressModeSaved: "Second address line configuration saved.",
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
        "CF Ready restores the translations shown here, then reads Shopify again.",
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
    disabled: "The validation is turned off: these rules don’t apply to customers.",
    lapsed:
      "The validation is on but your plan isn’t: while that’s the case, checkout blocks nothing.",
  },
};
