"use client";

import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Pinned-scene progress: 0 when the wrapper's top pins, 1 when it unpins.
      Use on tall wrappers with a sticky child (scrollytelling). */
  sticky?: boolean;
};

// Scroll-scene engine. As the wrapper scrolls through the viewport it:
//  - draws every `path[data-draw]` via the stroke-dash trick,
//  - exposes progress as the `--p` custom property for CSS consumers,
//  - moves every `[data-follow]` element along its referenced path
//    (data-follow="#path-id") using getPointAtLength.
// Work only happens while visible (IntersectionObserver-gated rAF).
export default function ScrollDraw({ children, className, sticky }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const paths = Array.from(el.querySelectorAll<SVGPathElement>("path[data-draw]"));
    const followers = Array.from(el.querySelectorAll<SVGGElement>("[data-follow]"))
      .map((node) => {
        const target = el.querySelector<SVGPathElement>(node.getAttribute("data-follow") ?? "");
        return target ? { node, target, length: target.getTotalLength() } : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    if (paths.length === 0 && followers.length === 0) return;

    const lengths = paths.map((p) => p.getTotalLength());
    // Paths may carry their own dash styling (dotted trajectories); it must
    // come back once the draw completes, not be wiped by the draw trick.
    const authoredDash = paths.map((p) => p.getAttribute("stroke-dasharray") ?? "");
    paths.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths[i]}`;
      p.style.strokeDashoffset = `${lengths[i]}`;
    });

    const applyProgress = (progress: number) => {
      el.style.setProperty("--p", progress.toFixed(4));
      paths.forEach((p, i) => {
        if (progress >= 0.995) {
          // A completed solid path still carrying draw-dash props shows
          // artifacts at joins; restore the authored styling instead.
          p.style.strokeDasharray = authoredDash[i];
          p.style.strokeDashoffset = "";
        } else {
          p.style.strokeDasharray = `${lengths[i]}`;
          p.style.strokeDashoffset = `${(lengths[i] * (1 - progress)).toFixed(1)}`;
        }
      });
      for (const { node, target, length } of followers) {
        const point = target.getPointAtLength(Math.min(progress, 0.999) * length);
        const ahead = target.getPointAtLength(Math.min(progress + 0.01, 1) * length);
        const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
        node.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
      }
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyProgress(1);
      return;
    }

    let frame = 0;
    let visible = true;

    const update = () => {
      frame = 0;
      if (!visible) return;
      const rect = el.getBoundingClientRect();
      let progress: number;
      if (sticky && rect.height > window.innerHeight) {
        // Scrollytelling: progress spans the pinned distance exactly.
        progress = -rect.top / (rect.height - window.innerHeight);
      } else {
        // 0 as the element enters the bottom of the viewport, 1 before its
        // bottom clears the upper third, so scenes complete while on screen.
        const total = rect.height + window.innerHeight * 0.55;
        progress = (window.innerHeight * 0.85 - rect.top) / total;
      }
      applyProgress(Math.min(Math.max(progress, 0), 1));
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
  }, [sticky]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
