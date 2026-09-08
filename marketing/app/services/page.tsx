import type { Metadata } from "next";
import PageHero from "@/components/page-hero";
import TextBody from "@/components/text-body";
import Reveal from "@/components/motion/reveal";
import { PipelineSpine } from "@/components/route-scenes";
import { ArrowRightIcon, CheckIcon, DocumentsIcon, SECTION_ICONS, sectionIcon } from "@/components/icons";
import { APP_URL, SITE_URL, getPage, getServices } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("services");
  return {
    title: page?.seoTitle ?? "Services",
    description:
      page?.seoDescription ??
      "What MyPDFChat does: AI document chat, multi-document conversations, and cited answers you can verify.",
  };
}

// Known services get their matching icon; anything new from the CMS rotates
// through the full icon set so unmapped entries still look intentional.
const SLUG_ICON_KEYS: Record<string, string> = {
  "ai-document-chat": "chat",
  "multi-document-conversations": "documents",
  "cited-answers": "citation",
};
const ICON_ROTATION = Object.keys(SECTION_ICONS);

const PANELS = [ChatPanel, MultiDocPanel, CitationPanel];

export default async function ServicesPage() {
  const [page, services] = await Promise.all([getPage("services"), getServices()]);
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: services.map((service, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: service.title,
      ...(service.summary ? { description: service.summary } : {}),
      url: `${SITE_URL}/services#${service.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c") }}
      />
      <PageHero
        eyebrow="Services"
        title={
          page?.title && page.title.toLowerCase() !== "services"
            ? page.title
            : "Turn your documents into answers"
        }
        subtitle={
          page?.seoDescription ??
          "Chat with any document, bring several into one conversation, and verify every answer against the exact passage it came from."
        }
      />

      {/* The spine draws down the page as each service block passes — the
          "document journey" through the product. */}
      <PipelineSpine>
      {services.map((service, i) => {
        const even = i % 2 === 0;
        const iconKey = SLUG_ICON_KEYS[service.slug] ?? ICON_ROTATION[i % ICON_ROTATION.length];
        const Panel = PANELS[i % PANELS.length];
        return (
          <section key={service.slug} className={even ? "bg-white" : "bg-mist"}>
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16">
              <Reveal direction={even ? "left" : "right"} className={even ? undefined : "lg:order-2"}>
                <div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${even ? "bg-ice text-sea" : "bg-lavender-soft text-grape"}`}
                  >
                    {sectionIcon(iconKey, "h-5.5 w-5.5")}
                  </div>
                  <h2
                    id={service.slug}
                    className="text-ink mt-5 scroll-mt-20 text-3xl font-bold tracking-tight sm:text-4xl"
                  >
                    {service.title}
                  </h2>
                  {service.summary && (
                    <p className="mt-4 text-lg leading-relaxed text-slate-600">{service.summary}</p>
                  )}
                  {service.body && (
                    <div className="mt-5">
                      <TextBody text={service.body} />
                    </div>
                  )}
                </div>
              </Reveal>
              <Reveal direction={even ? "right" : "left"} delay={120} className={even ? undefined : "lg:order-1"}>
                <Panel />
              </Reveal>
            </div>
          </section>
        );
      })}
      </PipelineSpine>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <Reveal direction="zoom">
            <div className="bg-brand-gradient-animated relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
              <div className="bg-dot-grid-dark absolute inset-0 opacity-20" aria-hidden />
              <div aria-hidden className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="relative">
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
                  Put every service to work on your next document
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white">
                  Upload a PDF, ask your first question, and check the citation yourself. No credit card required.
                </p>
                <div className="mt-9">
                  <a
                    href={APP_URL}
                    className="text-sea inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold shadow-lg shadow-black/10 transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    Try MyPDFChat free
                    <ArrowRightIcon className="h-4.5 w-4.5" />
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Decorative panels, echoing components/hero-visual.tsx. Pure divs so the
// page stays a server component; aria-hidden because they restate the copy.
// ---------------------------------------------------------------------------

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      <div className="bg-sea/15 animate-blob absolute -top-8 -left-6 h-44 w-44 rounded-full blur-3xl" />
      <div className="bg-grape/15 animate-blob absolute -right-4 -bottom-8 h-48 w-48 rounded-full blur-3xl [animation-delay:-8s]" />
      <div className="card-gradient-border shadow-panel card-lift relative rounded-3xl p-5 sm:p-6">{children}</div>
    </div>
  );
}

function DocChip({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
      <DocumentsIcon className="text-sea h-3.5 w-3.5" />
      {name}
      <span className="text-slate-400">· {meta}</span>
    </span>
  );
}

function SourceChip({ label }: { label: string }) {
  return (
    <span className="bg-lavender-soft text-grape mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold">
      {label}
    </span>
  );
}

// One document, one question, one grounded answer.
function ChatPanel() {
  return (
    <PanelFrame>
      <div className="border-b border-slate-100 pb-4">
        <DocChip name="master-agreement.pdf" meta="52 pages" />
      </div>
      <div className="mt-5 flex justify-end">
        <p className="bg-brand-gradient max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,104,248,0.22)]">
          Can we terminate early without penalty?
        </p>
      </div>
      <div className="mt-4 flex justify-start">
        <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
          Yes, with 60 days written notice after the first year. See clause 12.3.
          <SourceChip label="Source · p. 18" />
        </p>
      </div>
      <div className="mt-4 flex items-center gap-1.5 pl-2">
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </PanelFrame>
  );
}

// Several documents feeding a single conversation.
function MultiDocPanel() {
  return (
    <PanelFrame>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
        <DocChip name="q1-report.pdf" meta="34 pages" />
        <DocChip name="q2-report.pdf" meta="41 pages" />
        <DocChip name="board-minutes.docx" meta="9 pages" />
      </div>
      <div className="mt-5 flex justify-end">
        <p className="bg-brand-gradient max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,104,248,0.22)]">
          How did hiring plans change between Q1 and Q2?
        </p>
      </div>
      <div className="mt-4 flex justify-start">
        <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
          Q1 planned 12 engineering hires; Q2 cut that to 7 and added 3 sales roles, approved by the board in May.
          <span className="mt-2 flex flex-wrap gap-1.5">
            <SourceChip label="q1-report · p. 6" />
            <SourceChip label="board-minutes · p. 2" />
          </span>
        </p>
      </div>
    </PanelFrame>
  );
}

// An answer traced back to its exact source passage.
function CitationPanel() {
  return (
    <PanelFrame>
      <div className="flex justify-start">
        <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
          Refunds are issued within 14 days of cancellation.
          <SourceChip label="Source · p. 4" />
        </p>
      </div>
      <div className="border-sea/25 bg-ice/60 mt-4 rounded-2xl border p-4">
        <p className="text-sea text-xs font-semibold tracking-[0.14em] uppercase">Matched passage · page 4</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          &ldquo;Cancellations received in writing are refunded in full within fourteen (14) calendar days.&rdquo;
        </p>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckIcon className="h-3 w-3" />
        </span>
        Citation verified
      </div>
    </PanelFrame>
  );
}
