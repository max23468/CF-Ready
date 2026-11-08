export function scrollRespectingMotion(
  target: Element | null | undefined,
  block: ScrollLogicalPosition,
) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target?.scrollIntoView?.({ block, behavior: reduced ? "auto" : "smooth" });
}

export function revealById(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  scrollRespectingMotion(target, "start");
  target.focus({ preventScroll: true });
}
