import type { LandingSection } from "@/lib/cms";
import Reveal from "@/components/motion/reveal";
import SectionDecor from "@/components/section-decor";
import SectionHeader from "@/components/sections/section-header";
import { sectionIcon } from "@/components/icons";
import { CheckIcon, DocumentsIcon } from "@/components/icons";

// Audience cards: large two-column cards, each with a themed mini-mockup
// illustration. Mockups rotate by index; copy comes from the CMS.
export default function UseCases({ section }: { section: LandingSection }) {
  const mockups = [ResearchMockup, StudyMockup, ContractMockup, TrendsMockup];
  return (
    <section className="relative bg-white">
      <SectionDecor flip />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeader eyebrow="Use cases" heading={section.heading} subheading={section.subheading} body={section.body} />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {(section.items ?? []).map((item, i) => {
            const Mockup = mockups[i % mockups.length];
            return (
              <Reveal key={i} delay={(i % 2) * 120}>
                <div className="card-gradient-border card-lift flex h-full flex-col rounded-3xl p-6 sm:p-8">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${i % 2 === 0 ? "bg-ice text-sea" : "bg-lavender-soft text-grape"}`}>
                    {sectionIcon(item.iconKey, "h-5.5 w-5.5")}
                  </div>
                  <h3 className="text-ink mt-5 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{item.description}</p>
                  <div className="bg-mist mt-6 flex-1 rounded-2xl border border-slate-100 p-4 sm:p-5" aria-hidden>
                    <Mockup />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const chip = "flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm";

function ResearchMockup() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className={chip}><DocumentsIcon className="text-sea h-3 w-3" /> chen-2025.pdf</span>
        <span className={chip}><DocumentsIcon className="text-grape h-3 w-3" /> patel-2026.pdf</span>
        <span className={chip}><DocumentsIcon className="text-sea h-3 w-3" /> meta-review.pdf</span>
      </div>
      <div className="rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-sm">
        Both studies agree on the effect size; they conflict on dosage thresholds.
        <span className="mt-1.5 flex gap-1.5">
          <span className="bg-ice text-sea rounded px-1.5 py-0.5 text-[10px] font-semibold">chen · p. 12</span>
          <span className="bg-lavender-soft text-grape rounded px-1.5 py-0.5 text-[10px] font-semibold">patel · p. 4</span>
        </span>
      </div>
    </div>
  );
}

function StudyMockup() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm">
        Quiz me: what limits enzyme activity at high temperature?
      </div>
      <div className="ml-6 rounded-xl bg-white p-3 text-xs text-slate-600 shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="bg-ice text-sea flex h-4 w-4 items-center justify-center rounded-full"><CheckIcon className="h-2.5 w-2.5" /></span>
          Denaturation of the active site
        </span>
        <span className="bg-ice text-sea mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold">textbook · p. 214</span>
      </div>
    </div>
  );
}

function ContractMockup() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm">
        Where is termination for convenience?
      </div>
      <div className="rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-sm">
        Section 11.2: either party may terminate with 30 days written notice.
        <span className="bg-lavender-soft text-grape mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold">MSA-v3 · p. 18</span>
      </div>
    </div>
  );
}

function TrendsMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 rounded-xl bg-white p-3 shadow-sm" aria-hidden>
        {[36, 52, 44, 66, 58, 82].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h * 0.6}px` }}
            className={`w-4 rounded-t ${i === 5 ? "bg-brand-gradient" : "bg-ice"}`}
          />
        ))}
      </div>
      <div className="rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-sm">
        Margins improved every quarter; Q4 drove the largest gain.
        <span className="bg-ice text-sea mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold">4 reports cited</span>
      </div>
    </div>
  );
}
