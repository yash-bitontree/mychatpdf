import Link from "next/link";
import type { LandingSection } from "@/lib/cms";
import FaqAccordion from "@/components/faq-accordion";
import Reveal from "@/components/motion/reveal";
import SectionHeader from "@/components/sections/section-header";
import { ArrowRightIcon } from "@/components/icons";

// Top questions on the home page; the full list lives at /faq.
export default function FaqPreview({ section }: { section: LandingSection }) {
  const items = (section.items ?? [])
    .filter((item) => item.title && item.description)
    .map((item, i) => ({ question: item.title as string, answer: item.description as string, order: i }));
  if (items.length === 0) return null;

  return (
    <section className="bg-mist relative overflow-hidden">
      <div className="bg-dot-grid absolute inset-0 opacity-25 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeader eyebrow="FAQ" heading={section.heading} subheading={section.subheading} body={section.body} />
        <Reveal className="mt-12">
          <FaqAccordion items={items} />
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-8 text-center">
            <Link
              href="/faq"
              className="text-sea inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              See all questions
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
