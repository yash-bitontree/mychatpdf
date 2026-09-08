"use client";

import { useCallback, useEffect, useRef } from "react";

type Direction = "up" | "left" | "right" | "zoom" | "blur";

type Props = {
  children: React.ReactNode;
  direction?: Direction;
  /** Transition delay in ms, used for staggering siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "span" | "li";
};

// Scroll-reveal wrapper: all visuals live in globals.css ([data-reveal]);
// this only flips data-inview when the element enters the viewport.
export default function Reveal({ children, direction = "up", delay = 0, className, as: Tag = "div" }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-inview", "");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute("data-inview", "");
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={setRef}
      data-reveal={direction === "up" ? "" : direction}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
