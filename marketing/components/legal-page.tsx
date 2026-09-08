import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHero from "@/components/page-hero";
import Reveal from "@/components/motion/reveal";
import ScrollProgress from "@/components/motion/scroll-progress";
import TextBody from "@/components/text-body";
import { ShieldBadge } from "@/components/route-scenes";
import { getLegalPage } from "@/lib/cms";

// Shared renderer for /privacy, /terms, and /refund-policy.

export async function legalMetadata(slug: string): Promise<Metadata> {
  const page = await getLegalPage(slug);
  if (!page) return {};
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription,
  };
}

// CMS legal bodies often open with a "Last updated: ..." line; surface it as
// the hero subtitle instead of burying it at the top of the article.
function splitLastUpdated(body: string): { lastUpdated?: string; rest: string } {
  const trimmed = body.trimStart();
  if (!/^last updated:/i.test(trimmed)) return { rest: body };
  const newline = trimmed.indexOf("\n");
  if (newline === -1) return { lastUpdated: trimmed.trim(), rest: "" };
  return {
    lastUpdated: trimmed.slice(0, newline).trim(),
    rest: trimmed.slice(newline + 1).trim(),
  };
}

export default async function LegalPageBody({ slug }: { slug: string }) {
  const page = await getLegalPage(slug);
  if (!page) notFound();
  const { lastUpdated, rest } = splitLastUpdated(page.body);
  return (
    <>
      {/* Long documents: reading-progress bar plus one quiet draw-in shield.
          Deliberately restrained — trust pages should not perform. */}
      <ScrollProgress />
      <PageHero eyebrow="Legal" title={page.title} subtitle={lastUpdated}>
        <div aria-hidden className="flex justify-center">
          <ShieldBadge />
        </div>
      </PageHero>
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <article>
              <TextBody text={rest} />
            </article>
          </Reveal>
        </div>
      </section>
    </>
  );
}
