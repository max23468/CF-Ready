export const OWNER_CONTROL_COMMANDS = [
  "dashboard",
  "shops",
  "shop",
  "growth",
  "billing",
  "trials",
  "funnel",
  "issues",
  "errors",
  "notifications",
  "activity",
  "health",
  "performance",
  "version",
  "help",
] as const;

export type OwnerControlView = (typeof OWNER_CONTROL_COMMANDS)[number];
export type ShopsFilter = "all" | "trial" | "paid" | "validation_off" | "issues";

export type OwnerControlAction = {
  view: OwnerControlView;
  argument?: string;
  filter?: ShopsFilter;
  page?: number;
  shopId?: number;
  refresh?: boolean;
};

const SHOP_FILTERS = new Set<ShopsFilter>(["all", "trial", "paid", "validation_off", "issues"]);

export function parseCommand(text: string): OwnerControlAction | null {
  if (text.length > 160) return null;
  const match = /^\/([a-z]+)(?:\s+([^\s].*))?$/.exec(text.trim());
  if (!match || !OWNER_CONTROL_COMMANDS.includes(match[1] as OwnerControlView)) return null;
  const view = match[1] as OwnerControlView;
  const argument = match[2]?.trim();
  if (view === "shops") {
    const filter = argument ?? "all";
    return SHOP_FILTERS.has(filter as ShopsFilter)
      ? { view, filter: filter as ShopsFilter, page: 0 }
      : null;
  }
  if (view === "shop") {
    return argument && argument.length <= 100 ? { view, argument } : { view };
  }
  return argument ? null : { view };
}

const VIEW_CODES: Record<OwnerControlView, string> = {
  dashboard: "d",
  shops: "s",
  shop: "o",
  growth: "g",
  billing: "b",
  trials: "t",
  funnel: "f",
  issues: "i",
  errors: "e",
  notifications: "n",
  activity: "a",
  health: "h",
  performance: "p",
  version: "v",
  help: "x",
};
const CODE_VIEWS = Object.fromEntries(
  Object.entries(VIEW_CODES).map(([view, code]) => [code, view]),
) as Record<string, OwnerControlView>;

export function callbackData(action: OwnerControlAction) {
  const parts = ["oc1", VIEW_CODES[action.view]];
  if (action.shopId !== undefined) parts.push(action.shopId.toString(36));
  else if (action.filter) parts.push(action.filter);
  else parts.push("-");
  parts.push(String(action.page ?? 0));
  if (action.refresh) parts.push("r");
  return parts.join(":");
}

export function parseCallback(data: string): OwnerControlAction | null {
  if (new TextEncoder().encode(data).byteLength > 64) return null;
  const [version, code, target, pageText, refresh, ...rest] = data.split(":");
  const view = CODE_VIEWS[code];
  const page = Number(pageText);
  if (
    version !== "oc1" ||
    !view ||
    rest.length ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 10_000 ||
    (refresh !== undefined && refresh !== "r")
  ) {
    return null;
  }
  if (view === "shop") {
    if (!target || !/^[0-9a-z]+$/.test(target)) return null;
    const shopId = Number.parseInt(target, 36);
    return Number.isSafeInteger(shopId) && shopId > 0
      ? { view, shopId, page, refresh: refresh === "r" }
      : null;
  }
  if (view === "shops") {
    if (!SHOP_FILTERS.has(target as ShopsFilter)) return null;
    return { view, filter: target as ShopsFilter, page, refresh: refresh === "r" };
  }
  if (target !== "-") return null;
  return { view, page, refresh: refresh === "r" };
}
