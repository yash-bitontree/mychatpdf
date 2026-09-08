"use client";

import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  /** Fraction of scroll distance the element drifts; negative drifts opposite. */
  speed?: number;
  className?: string;
};

// Scroll-linked drift for decorative layers (SVG scenes, glow blobs).
// Transform-only and rAF-throttled so it stays smooth on mobile.
export default function Parallax({ children, speed = 0.15, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let visible = true;
    let appliedOffset = 0;

    const update = () => {
      frame = 0;
      if (!visible) return;
      // getBoundingClientRect includes our own transform, so subtract the
      // offset already applied — otherwise the computation feeds back on
      // itself and the drift depends on scroll-event cadence.
      const rect = el.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2 - appliedOffset;
      appliedOffset = (viewportCenter - elementCenter) * speed;
      el.style.transform = `translate3d(0, ${appliedOffset.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) onScroll();
    });
    observer.observe(el);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
