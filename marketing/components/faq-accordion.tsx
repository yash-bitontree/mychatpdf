"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/cms";
import { PlusIcon } from "@/components/icons";

// Accordion for FAQ items. Open/close animates grid-template-rows (0fr -> 1fr)
// so the panel height is resolved by CSS, not measured in JS. Multiple items
// can stay open at once.
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndexes, setOpenIndexes] = useState<ReadonlySet<number>>(new Set());

  const toggle = (index: number) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const isOpen = openIndexes.has(index);
        const panelId = `faq-panel-${index}`;
        return (
          <div
            key={item.question}
            className={`rounded-2xl border transition-colors duration-300 ${
              isOpen ? "border-sea/30 bg-ice/40" : "border-slate-200 bg-white"
            }`}
          >
            <h2>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left sm:px-6"
              >
                <span className="text-ink text-base font-semibold sm:text-lg">{item.question}</span>
                <span
                  aria-hidden
                  className={`text-sea shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                >
                  <PlusIcon className="h-5 w-5" />
                </span>
              </button>
            </h2>
            <div
              id={panelId}
              className={`grid transition-[grid-template-rows] duration-300 ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              {/* visibility keeps collapsed answers out of the a11y tree; the
                  close delay lets the height animation finish first */}
              <div
                className={`overflow-hidden ${
                  isOpen ? "visible" : "invisible [transition:visibility_0s_0.3s]"
                }`}
              >
                <p className="px-5 pb-5 leading-relaxed text-slate-600 sm:px-6">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
