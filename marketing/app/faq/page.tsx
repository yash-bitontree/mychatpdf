import type { Metadata } from "next";
import Link from "next/link";
import FaqAccordion from "@/components/faq-accordion";
import PageHero from "@/components/page-hero";
import Reveal from "@/components/motion/reveal";
import ScrollDraw from "@/components/motion/scroll-draw";
import { QuestionMarkScene } from "@/components/route-scenes";
import { ArrowRightIcon } from "@/components/icons";
import { APP_URL, SITE_URL, getFaqItems, getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("faq");
  return {
    title: page?.seoTitle ?? "FAQ",
    description:
      page?.seoDescription ??
      "Frequently asked questions about MyPDFChat: supported formats, accuracy, privacy, and pricing.",
  };
}

export default async function FaqPage() {
  const faqs = await getFaqItems();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
      />

      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        subtitle="Everything you might want to know about MyPDFChat, from supported formats to how citations work."
      />

      <section className="bg-white">
        {/* The question mark draws itself as the list scrolls; its dot pops
            in at the end — all questions answered. */}
        <ScrollDraw className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <QuestionMarkScene />
          {/* relative keeps the accordion painting above the scene after its
              reveal transform clears. */}
          <Reveal className="relative">
            <FaqAccordion items={faqs} />
          </Reveal>

          <Reveal delay={110}>
            <div className="card-gradient-border shadow-panel mt-14 rounded-2xl p-6 text-center sm:p-10">
              <h2 className="text-ink text-2xl font-bold tracking-tight sm:text-3xl">
                Still have questions?
              </h2>
              <p className="mx-auto mt-3 max-w-md leading-relaxed text-slate-600">
                Our team is happy to help, or you can jump straight in and see MyPDFChat for
                yourself.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href={APP_URL}
                  className="bg-brand-gradient hover:shadow-glow shadow-sea/25 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 sm:w-auto"
                >
                  Try MyPDFChat free
                  <ArrowRightIcon className="h-4.5 w-4.5" />
                </a>
                <Link
                  href="/contact"
                  className="text-ink inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white/80 px-7 text-base font-semibold backdrop-blur-sm transition-colors duration-300 hover:border-slate-400 hover:bg-white sm:w-auto"
                >
                  Contact us
                </Link>
              </div>
            </div>
          </Reveal>
        </ScrollDraw>
      </section>
    </>
  );
}
