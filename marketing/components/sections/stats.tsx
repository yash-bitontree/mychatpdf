import type { LandingSection } from "@/lib/cms";
import CountUp from "@/components/motion/count-up";
import Reveal from "@/components/motion/reveal";
import SectionHeader from "@/components/sections/section-header";

// Dark band with animated counters.
export default function Stats({ section }: { section: LandingSection }) {
  return (
    <section className="bg-ink relative overflow-hidden">
      <div className="bg-dot-grid-dark absolute inset-0 opacity-25" aria-hidden />
      <div className="bg-noise absolute inset-0 opacity-[0.06]" aria-hidden />
      <div aria-hidden className="bg-sea/15 absolute -top-24 left-1/4 h-56 w-96 rounded-full blur-3xl" />
      <div aria-hidden className="bg-grape/15 absolute -bottom-24 right-1/4 h-56 w-96 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-18 sm:px-6 sm:py-24">
        <SectionHeader dark eyebrow={section.badge} heading={section.heading} subheading={section.subheading} body={section.body} />
        {/* Each Reveal div is a direct dl child wrapping one dt/dd group;
            CSS order keeps the value visually above its label. */}
        <dl className={`grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4 ${section.heading ? "mt-14" : ""}`}>
          {(section.items ?? []).map((item, i) => (
            <Reveal key={i} delay={i * 110} className="flex flex-col text-center">
              <dt className="order-2 mt-3 text-sm font-semibold text-white">{item.label}</dt>
              <dd className="text-gradient order-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
                <CountUp value={item.value ?? ""} />
              </dd>
              {item.description && <dd className="order-3 mt-1.5 text-sm text-slate-400">{item.description}</dd>}
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
