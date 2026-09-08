import { ctaHref, type LandingSection } from "@/lib/cms";
import HeroVisual from "@/components/hero-visual";
import MouseGlow from "@/components/motion/mouse-glow";
import Reveal from "@/components/motion/reveal";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";

const TRUST_POINTS = ["Free plan", "No credit card", "Cited answers"];

export default function Hero({ section, firstSection }: { section: LandingSection; firstSection: boolean }) {
  const Heading = firstSection ? "h1" : "h2";
  return (
    <section className="bg-hero-wash relative overflow-hidden">
      <div className="bg-dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_35%,black,transparent)]" aria-hidden />
      <div className="bg-noise absolute inset-0 opacity-[0.04]" aria-hidden />
      <MouseGlow />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-2 lg:gap-10 lg:pt-24 lg:pb-32">
        <div className="text-center lg:text-left">
          {section.badge && (
            <Reveal>
              <p className="border-sea/20 text-sea inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-1.5 text-sm font-semibold shadow-sm backdrop-blur-sm">
                <span className="bg-brand-gradient inline-block h-2 w-2 animate-pulse rounded-full" aria-hidden />
                {section.badge}
              </p>
            </Reveal>
          )}

          <Reveal delay={90}>
            <Heading className="text-ink mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              <GradientTail text={section.heading ?? ""} />
            </Heading>
          </Reveal>

          {section.subheading && (
            <Reveal delay={180}>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
                {section.subheading}
              </p>
            </Reveal>
          )}

          <Reveal delay={270}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              {section.ctaLabel && (
                <a
                  href={ctaHref(section.ctaUrl)}
                  className="bg-brand-gradient hover:shadow-glow shadow-sea/25 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 sm:w-auto"
                >
                  {section.ctaLabel}
                  <ArrowRightIcon className="h-4.5 w-4.5" />
                </a>
              )}
              {section.secondaryCtaLabel && (
                <a
                  href={ctaHref(section.secondaryCtaUrl)}
                  className="text-ink inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white/80 px-7 text-base font-semibold backdrop-blur-sm transition-colors duration-300 hover:border-slate-400 hover:bg-white sm:w-auto"
                >
                  {section.secondaryCtaLabel}
                </a>
              )}
            </div>
          </Reveal>

          <Reveal delay={360}>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                  <CheckIcon className="text-sea h-4 w-4" />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal direction="zoom" delay={200} className="relative mt-12 lg:mt-0">
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

// Renders the last two words of the heading in the brand gradient.
function GradientTail({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return <>{text}</>;
  return (
    <>
      {words.slice(0, -2).join(" ")}{" "}
      <span className="text-gradient">{words.slice(-2).join(" ")}</span>
    </>
  );
}
