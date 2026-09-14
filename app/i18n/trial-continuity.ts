import type { Locale } from "./types";

const it = {
  choosePlan: "Scegli un piano",
  goHome: "Vai alla home",
  activeHeading: "CF Ready è attivo",
  trialActive: (date: string) =>
    `La validazione è attiva fino al ${date}. Scegli un piano per mantenerla attiva dopo la prova.`,
  trialInactive: (date: string) =>
    `La prova termina il ${date}. La validazione è disattivata. Scegli un piano per continuare a usare CF Ready dopo la prova.`,
  approvalHelp:
    "Puoi approvare ora un abbonamento mensile o annuale: conservi i giorni di prova rimanenti e il primo addebito avviene dopo la prova.",
  expired:
    "La validazione è sospesa. Le tue impostazioni sono conservate: scegli un piano per ripristinarla.",
  confirmed: (date: string) => `Abbonamento confermato. Il primo addebito è previsto dal ${date}.`,
  onboardingTrial: (date: string) =>
    `La prova termina il ${date}. Per continuare senza interruzioni, puoi scegliere un abbonamento già ora mantenendo i giorni gratuiti rimanenti.`,
};

const en = {
  choosePlan: "Choose a plan",
  goHome: "Go to home",
  activeHeading: "CF Ready is active",
  trialActive: (date: string) =>
    `Validation is active until ${date}. Choose a plan to keep it active after your trial.`,
  trialInactive: (date: string) =>
    `Your trial ends on ${date}. Validation is disabled. Choose a plan to keep using CF Ready after your trial.`,
  approvalHelp:
    "You can approve a monthly or annual subscription now: you keep your remaining trial days and the first charge starts after the trial.",
  expired: "Validation is paused. Your settings are saved: choose a plan to restore it.",
  confirmed: (date: string) =>
    `Subscription confirmed. Your first charge is expected from ${date}.`,
  onboardingTrial: (date: string) =>
    `Your trial ends on ${date}. To continue without interruption, you can choose a subscription now and keep your remaining free days.`,
} satisfies typeof it;

const dictionaries = { it, en };

export function trialContinuityTexts(locale: Locale) {
  return dictionaries[locale];
}
