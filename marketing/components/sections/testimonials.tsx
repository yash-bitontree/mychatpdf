import type { LandingSection, SectionItem } from "@/lib/cms";
import Reveal from "@/components/motion/reveal";
import SectionDecor from "@/components/section-decor";
import SectionHeader from "@/components/sections/section-header";
import { QuoteIcon, StarIcon } from "@/components/icons";

// Wall of love: the first quote leads as a full-width spotlight card, the
// rest interlock in masonry columns. Every card carries a five-star row.
export default function Testimonials({ section }: { section: LandingSection }) {
  const items = section.items ?? [];
  const [featured, ...wall] = items;

  return (
    <section className="bg-mist relative overflow-hidden">
      <SectionDecor />
      <div className="bg-dot-grid absolute inset-0 opacity-25 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeader eyebrow="Wall of love" heading={section.heading} subheading={section.subheading} body={section.body} />

        {featured && (
          <Reveal direction="zoom" className="mt-14">
            <figure className="card-gradient-border shadow-panel relative overflow-hidden rounded-3xl bg-white p-8 sm:p-12">
              <QuoteIcon className="text-sea/10 absolute -top-4 -left-2 h-32 w-32 rotate-180" />
              <div aria-hidden className="bg-grape/10 absolute -right-16 -bottom-20 h-56 w-56 rounded-full blur-3xl" />
              <div className="relative mx-auto max-w-3xl text-center">
                <Stars className="justify-center" />
                <blockquote className="text-ink mt-5 text-xl leading-relaxed font-medium text-balance sm:text-2xl">
                  &ldquo;{featured.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-7 flex items-center justify-center gap-3">
                  <Avatar name={featured.author} large />
                  <span className="text-left">
                    <span className="text-ink block font-semibold">{featured.author}</span>
                    {featured.role && <span className="block text-sm text-slate-500">{featured.role}</span>}
                  </span>
                </figcaption>
              </div>
            </figure>
          </Reveal>
        )}

        {wall.length > 0 && (
          <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {wall.map((item, i) => (
              <Reveal key={i} delay={(i % 3) * 120} className="mb-5 break-inside-avoid">
                <TestimonialCard item={item} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TestimonialCard({ item }: { item: SectionItem }) {
  return (
    <figure className="card-lift spotlight rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <Stars />
      <blockquote className="text-ink mt-4 leading-relaxed font-medium">&ldquo;{item.quote}&rdquo;</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
        <Avatar name={item.author} />
        <span>
          <span className="text-ink block text-sm font-semibold">{item.author}</span>
          {item.role && <span className="block text-sm text-slate-500">{item.role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

function Stars({ className }: { className?: string }) {
  return (
    <span className={`flex gap-1 ${className ?? ""}`} role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} className="h-4 w-4 text-amber-400" />
      ))}
    </span>
  );
}

// Gradient-ring initials avatar; deterministic per name, no stock faces.
function Avatar({ name, large }: { name?: string; large?: boolean }) {
  const initials = (name ?? "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span aria-hidden className={`bg-brand-gradient inline-block shrink-0 rounded-full p-0.5 ${large ? "h-13 w-13" : "h-11 w-11"}`}>
      <span
        className={`text-sea grid h-full w-full place-items-center rounded-full bg-white font-bold ${large ? "text-base" : "text-sm"}`}
      >
        {initials}
      </span>
    </span>
  );
}
