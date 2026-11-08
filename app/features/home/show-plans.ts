import { revealById } from "../../ui/ui-scroll";

export const PLANS_ID = "plans";

// Un'ancora `#plans` non funziona nell'Admin, dove App Bridge accetta solo link a `/app`.
export function showPlans() {
  revealById(PLANS_ID);
}
