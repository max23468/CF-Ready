import { useEffect, useRef, useState, type ReactNode } from "react";
import { scrollRespectingMotion } from "./ui-scroll";

export function RevealBanner({
  tone,
  heading,
  children,
}: {
  tone: "critical" | "warning";
  heading?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // L'ingresso parte quando il banner è in vista: con uno scorrimento lungo finirebbe prima.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    let mounted = true;
    void scrollRespectingMotion(ref.current, "nearest").then(() => {
      if (mounted) setInView(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <div className={inView ? "cf-reveal-banner cf-motion-reveal" : "cf-reveal-banner"} ref={ref}>
      <s-banner tone={tone} heading={heading}>
        {children}
      </s-banner>
    </div>
  );
}
