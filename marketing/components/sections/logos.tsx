"use client";

import { useState } from "react";
import type { LandingSection } from "@/lib/cms";
import { DocumentsIcon, FolderIcon } from "@/components/icons";

// Trust strip: two marquee rows scrolling in opposite directions —
// document types people bring, and the file formats we read.
// WCAG 2.2.2: auto-scrolling content needs a user-facing pause control.
const FORMATS = ["PDF", ".docx", ".pptx", ".txt", "Markdown", "Scanned + text layer", "Reports", "Slides"];

export default function Logos({ section }: { section: LandingSection }) {
  const [paused, setPaused] = useState(false);
  const items = section.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="border-y border-slate-100 bg-white py-10">
      <div className="flex items-center justify-center gap-3 px-4">
        {section.heading && (
          <p className="text-center text-sm font-semibold tracking-[0.16em] text-slate-500 uppercase">
            {section.heading}
          </p>
        )}
        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Resume scrolling" : "Pause scrolling"}
          onClick={() => setPaused((v) => !v)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
        >
          {paused ? <PlayGlyph /> : <PauseGlyph />}
        </button>
      </div>

      <Row paused={paused}>
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= items.length}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-slate-600"
          >
            <FolderIcon className="text-sea h-4 w-4" />
            {item.title}
          </span>
        ))}
      </Row>
      <Row paused={paused} reverse>
        {[...FORMATS, ...FORMATS].map((format, i) => (
          <span
            key={i}
            aria-hidden={i >= FORMATS.length}
            className="bg-mist flex shrink-0 items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-slate-500"
          >
            <DocumentsIcon className="text-grape h-4 w-4" />
            {format}
          </span>
        ))}
      </Row>
    </section>
  );
}

function Row({ children, paused, reverse }: { children: React.ReactNode; paused: boolean; reverse?: boolean }) {
  return (
    <div className="marquee relative mt-4 overflow-hidden first-of-type:mt-7 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div
        style={paused ? { animationPlayState: "paused" } : undefined}
        className={`marquee-track gap-4 pr-4 ${reverse ? "marquee-reverse" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="h-3 w-3">
      <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="h-3 w-3">
      <path d="M4.5 2.8a1 1 0 0 1 1.53-.85l8 5.2a1 1 0 0 1 0 1.7l-8 5.2a1 1 0 0 1-1.53-.85V2.8Z" />
    </svg>
  );
}
