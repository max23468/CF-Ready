import { useEffect, useRef, type ReactNode } from "react";

// Avvisi ed errori restano banner, ma quando compaiono si portano in vista.
export function RevealBanner({
  tone,
  children,
}: {
  tone: "critical" | "warning";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView?.({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, []);
  return (
    <div className="cf-reveal-banner cf-motion-reveal" ref={ref}>
      <s-banner tone={tone}>{children}</s-banner>
    </div>
  );
}
