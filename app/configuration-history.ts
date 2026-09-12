import type { CheckoutConfig, Rules } from "./config";

export type ConfigurationSnapshot = Pick<CheckoutConfig, "rules" | "messages">;

export type ConfigurationHistoryEntry = ConfigurationSnapshot & {
  id: number;
  createdAt: string;
};

export function configurationSnapshot(config: CheckoutConfig): ConfigurationSnapshot {
  return { rules: config.rules, messages: config.messages };
}

export function changedConfigurationFields(
  current: ConfigurationSnapshot,
  entry: ConfigurationSnapshot,
) {
  const changed: (keyof Rules | "messages")[] = [];
  if (current.rules.taxCode !== entry.rules.taxCode) changed.push("taxCode");
  if (current.rules.pec !== entry.rules.pec) changed.push("pec");
  if (JSON.stringify(current.messages) !== JSON.stringify(entry.messages)) changed.push("messages");
  return changed;
}
