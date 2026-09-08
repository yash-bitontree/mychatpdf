import Link from "next/link";
import { ctaHref, type LandingSection } from "@/lib/cms";
import Reveal from "@/components/motion/reveal";
import { ArrowRightIcon, CheckIcon, CitationIcon, DocumentsIcon } from "@/components/icons";

// Real privacy claims only — no invented compliance badges.
const TRUST_POINTS = [
  "Never used to train AI models",
  "Encrypted in transit and at rest",
  "Delete a file and it is gone",
];

// Closing call to action: split panel — pitch and buttons on the left, a
// floating product snippet on the right, over the animated brand gradient.
export default function Cta({ section }: { section: LandingSection }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <Reveal direction="zoom">
          <div className="bg-brand-gradient-animated relative overflow-hidden rounded-[2.5rem] px-6 py-14 sm:px-12 sm:py-16 lg:px-16">
            <div className="bg-dot-grid-dark absolute inset-0 opacity-20" aria-hidden />
            <div className="bg-noise absolute inset-0 opacity-[0.05]" aria-hidden />
            {/* Concentric echo rings radiating from the corner */}
            <svg aria-hidden viewBox="0 0 400 400" className="absolute -top-40 -right-40 h-[28rem] w-[28rem] opacity-25">
              {[70, 120, 170, 220].map((r) => (
                <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="white" strokeWidth="1.2" />
              ))}
            </svg>
            <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
                  {section.heading}
                </h2>
                {section.subheading && (
                  <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white lg:mx-0">
                    {section.subheading}
                  </p>
                )}
                <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  {section.ctaLabel && (
                    <a
                      href={ctaHref(section.ctaUrl)}
                      className="text-sea inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold shadow-lg shadow-black/15 transition-transform duration-300 hover:-translate-y-0.5 sm:w-auto"
                    >
                      {section.ctaLabel}
                      <ArrowRightIcon className="h-4.5 w-4.5" />
                    </a>
                  )}
                  <Link
                    href="/contact"
                    className="inline-flex min-h-13 w-full items-center justify-center rounded-full border border-white/40 px-8 text-base font-semibold text-white transition-colors duration-300 hover:bg-white/10 sm:w-auto"
                  >
                    {section.secondaryCtaLabel ?? "Talk to us"}
                  </Link>
                </div>
                <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
                  {TRUST_POINTS.map((point) => (
                    <li key={point} className="flex items-center gap-1.5 text-sm font-medium text-white">
                      <CheckIcon className="h-4 w-4 text-white" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Floating product snippet, slightly tilted like a polaroid */}
              <div aria-hidden className="animate-float mx-auto hidden w-full max-w-sm rotate-2 lg:block">
                <div className="rounded-3xl bg-white/95 p-5 shadow-2xl shadow-black/25 backdrop-blur-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    <DocumentsIcon className="text-sea h-3.5 w-3.5" />
                    your-next-document.pdf
                  </span>
                  <div className="bg-brand-gradient mt-4 ml-10 rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-white">
                    Does the warranty cover water damage?
                  </div>
                  <div className="mt-3 mr-10 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    Yes, for the first 24 months, unless caused by unauthorized repairs.
                    <span className="bg-lavender-soft text-grape mt-2 flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold">
                      <CitationIcon className="h-3 w-3" />
                      Warranty · p. 7
                    </span>
                  </div>
                  <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100">
                      <CheckIcon className="h-2.5 w-2.5" />
                    </span>
                    Verified against the source
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
