"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NavLink } from "@/lib/cms";

// Desktop nav for the floating capsule. A soft gradient "puck" glides to the
// hovered (or keyboard-focused) link and rests on the active route. Positions
// are measured from the live DOM via refs + a ResizeObserver, so the puck stays
// aligned through font load, viewport resize, and the capsule's scroll condense.
export default function CapsuleNav({
  items,
  pathname,
  className,
}: {
  items: NavLink[];
  pathname: string;
  className?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [puck, setPuck] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = items.findIndex(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  // Highlight the hovered/focused link, falling back to the active route.
  const target = hovered ?? (activeIndex >= 0 ? activeIndex : null);

  useEffect(() => {
    const measure = () => {
      const el = target === null ? null : linkRefs.current[target];
      setPuck(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();

    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    // Inter loads after first paint and shifts link widths; re-measure then.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => observer.disconnect();
  }, [target]);

  return (
    <nav ref={navRef} aria-label="Main" className={`relative items-center ${className ?? ""}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-0 rounded-full"
        style={{
          width: puck?.width ?? 0,
          transform: `translateX(${puck?.left ?? 0}px)`,
          opacity: puck ? 1 : 0,
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--color-sea) 16%, transparent), color-mix(in oklab, var(--color-grape) 16%, transparent))",
          boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-sea) 18%, transparent)",
          transition:
            "transform 0.4s var(--ease-out-expo), width 0.4s var(--ease-out-expo), opacity 0.25s ease-out",
        }}
      />
      {items.map((item, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={(el) => {
              linkRefs.current[i] = el;
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            aria-current={active ? "page" : undefined}
            className={`relative z-10 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200 ${
              active ? "text-ink" : "hover:text-ink text-slate-600"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
