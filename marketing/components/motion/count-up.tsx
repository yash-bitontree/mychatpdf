"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Final text, e.g. "10s", "99.9%", "50+", "24/7". Digits animate, the rest stays. */
  value: string;
  className?: string;
  durationMs?: number;
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Animates the leading number of a stat when it scrolls into view.
// Non-numeric values (like "24/7") render as-is.
export default function CountUp({ value, className, durationMs = 1600 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Suffix must be digit-free so values like "24/7" render as-is.
  const match = value.match(/^(\d+(?:\.\d+)?)(\D*)$/);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = parseFloat(match[1]);
    const decimals = (match[1].split(".")[1] ?? "").length;
    const suffix = match[2];
    let frame = 0;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = easeOutExpo(Math.min((now - start) / durationMs, 1));
        el.textContent = `${(target * progress).toFixed(decimals)}${suffix}`;
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [match, durationMs]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
