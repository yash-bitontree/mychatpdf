import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/page-hero";
import TextBody from "@/components/text-body";
import Reveal from "@/components/motion/reveal";
import ScrollDraw from "@/components/motion/scroll-draw";
import { TimelineCurve } from "@/components/route-scenes";
import { ArrowRightIcon } from "@/components/icons";
import { APP_URL, SITE_URL, getPage } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("about");
  return {
    title: page?.seoTitle ?? page?.title ?? "About",
    description: page?.seoDescription,
  };
}

// Lifts the first paragraph into the hero subtitle only when more body
// follows it, so short single-paragraph pages keep their article content.
function splitBody(body: string): { subtitle?: string; rest: string } {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 2 || blocks[0].startsWith("## ")) return { rest: body };
  return { subtitle: blocks[0], rest: blocks.slice(1).join("\n\n") };
}

// First sentence of the body doubles as the tagline in the aside card.
function pullQuote(body: string): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith("## "));
  if (!paragraph) return "";
  return (paragraph.match(/^[^.!?]+[.!?]/)?.[0] ?? paragraph).trim();
}

export default async function AboutPage() {
  const page = await getPage("about");
  if (!page) notFound();

  const { subtitle, rest } = splitBody(page.body ?? "");
  const quote = pullQuote(page.body ?? "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: page.title,
    description: page.seoDescription ?? subtitle,
    url: `${SITE_URL}/about`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <PageHero eyebrow="About us" title={page.title} subtitle={subtitle} />

      {rest && (
        <section className="relative bg-white">
          {/* Milestone curve draws down the story as it is read. */}
          <ScrollDraw className="pointer-events-none absolute inset-0">
            <TimelineCurve />
          </ScrollDraw>
          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14">
            <Reveal>
              <article className="max-w-4xl">
                <TextBody text={rest} />
              </article>
            </Reveal>

            {/* Decorative companion card: repeats the body's opening line as a
                tagline, so it is hidden from assistive tech and small screens. */}
            <Reveal direction="right" delay={150} className="hidden lg:block">
              <div aria-hidden className="sticky top-28">
                <div className="card-gradient-border shadow-panel overflow-hidden rounded-2xl">
                  <div className="relative h-44">
                    <Image
                      src="/images/about-team.webp"
                      alt=""
                      fill
                      sizes="19rem"
                      className="object-cover"
                    />
                    <div className="from-ink/35 absolute inset-0 bg-gradient-to-t to-transparent" />
                    <div className="bg-ice absolute bottom-3 left-3 flex h-11 w-11 items-center justify-center rounded-xl shadow-md">
                      <Image src="/logo-mark.png" alt="" width={28} height={28} />
                    </div>
                  </div>
                  <div className="p-6">
                    {quote && (
                      <p className="border-sea/25 text-ink border-l-2 pl-4 text-lg leading-relaxed font-medium">
                        {quote}
                      </p>
                    )}
                    <div className="bg-brand-gradient mt-6 h-1 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24">
          <Reveal direction="zoom">
            <div className="bg-brand-gradient-animated relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12 sm:py-14">
              <div className="bg-dot-grid-dark absolute inset-0 opacity-20" aria-hidden />
              <div className="relative">
                <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance text-white sm:text-3xl">
                  Curious how it fits your documents?
                </h2>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a
                    href={APP_URL}
                    className="text-sea inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-semibold shadow-lg shadow-black/10 transition-transform duration-300 hover:-translate-y-0.5 sm:w-auto"
                  >
                    Get started free
                    <ArrowRightIcon className="h-4.5 w-4.5" />
                  </a>
                  <Link
                    href="/contact"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/40 px-7 text-base font-semibold text-white transition-colors duration-300 hover:bg-white/10 sm:w-auto"
                  >
                    Talk to us
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
