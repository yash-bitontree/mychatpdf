"use client";

import { useEffect, useRef } from "react";

// Pointer-following radial glow layered inside a section (hero).
// Renders nothing interactive; hidden from touch devices via CSS.
export default function MouseGlow({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const update = () => {
      frame = 0;
      el.style.background = `radial-gradient(600px circle at ${x}px ${y}px, color-mix(in oklab, var(--color-grape) 9%, transparent), transparent 65%)`;
    };

    const onMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(update);
    };

    parent.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      parent.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className ?? ""}`} />;
}
