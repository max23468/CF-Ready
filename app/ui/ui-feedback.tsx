import { useEffect, useRef, type ReactNode } from "react";
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
  useEffect(() => {
    scrollRespectingMotion(ref.current, "nearest");
  }, []);
  return (
    <div className="cf-reveal-banner cf-motion-reveal" ref={ref}>
      <s-banner tone={tone} heading={heading}>
        {children}
      </s-banner>
    </div>
  );
}
