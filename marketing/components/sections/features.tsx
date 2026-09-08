import type { LandingSection } from "@/lib/cms";
import Reveal from "@/components/motion/reveal";
import TiltCard from "@/components/motion/tilt-card";
import SectionDecor from "@/components/section-decor";
import SectionHeader from "@/components/sections/section-header";
import { sectionIcon } from "@/components/icons";

export default function Features({ section }: { section: LandingSection }) {
  return (
    <section className="relative bg-white">
      <SectionDecor />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeader eyebrow="Features" heading={section.heading} subheading={section.subheading} body={section.body} />
        {/* Bento rhythm on lg: wide-1-1 / 1-1-wide. First and last cards
            stretch and gain a decorative chat-lines flourish. */}
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(section.items ?? []).map((item, i) => {
            const wide = i === 0 || i === 5;
            return (
              <Reveal key={i} delay={(i % 3) * 110} className={wide ? "lg:col-span-2" : ""}>
                <TiltCard className="h-full">
                  <div className="card-gradient-border card-lift shadow-panel spotlight h-full rounded-2xl p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${i % 2 === 0 ? "bg-ice text-sea" : "bg-lavender-soft text-grape"}`}>
                        {sectionIcon(item.iconKey, "h-5.5 w-5.5")}
                      </div>
                      {wide && (
                        <div aria-hidden className="hidden w-28 space-y-1.5 pt-1 lg:block">
                          <div className="bg-ice ml-auto h-1.5 w-20 rounded-full" />
                          <div className="bg-lavender-soft h-1.5 w-24 rounded-full" />
                          <div className="bg-ice ml-auto h-1.5 w-14 rounded-full" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-ink mt-5 text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 leading-relaxed text-slate-600">{item.description}</p>
                  </div>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
