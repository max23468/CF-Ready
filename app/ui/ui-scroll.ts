// Si risolve a scorrimento concluso dove `scrollIntoView` restituisce una promessa (Chrome ed
// Edge 150+); altrove subito, e l'effetto successivo parte insieme allo scorrimento come prima.
export async function scrollRespectingMotion(
  target: Element | null | undefined,
  block: ScrollLogicalPosition,
): Promise<void> {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const scrolled: unknown = target?.scrollIntoView?.({
    block,
    behavior: reduced ? "auto" : "smooth",
  });
  await scrolled;
}

export function revealById(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  void scrollRespectingMotion(target, "start");
  target.focus({ preventScroll: true });
}
