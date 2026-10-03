// Porta in vista le offerte e vi sposta il focus: un'ancora `#plans` non funziona
// nell'Admin, dove App Bridge accetta solo link a `/app`.
export function showPlans() {
  const target = document.getElementById("plans");
  if (!target) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}
