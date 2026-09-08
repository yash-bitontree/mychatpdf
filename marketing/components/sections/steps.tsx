import type { LandingSection } from "@/lib/cms";
import ScrollDraw from "@/components/motion/scroll-draw";
import SectionHeader from "@/components/sections/section-header";
import { CheckIcon, CitationIcon, DocumentsIcon } from "@/components/icons";

// Activation thresholds along the scroll (0-1) for the three steps.
const STEP_AT = [0.08, 0.4, 0.72];

// Progress-driven CSS: elements dim until --p crosses their threshold.
// var(--p, 1) defaults to 1, so no-JS and reduced-motion users see the
// finished scene.
const activate = (threshold: number): React.CSSProperties => ({
  opacity: `clamp(0.35, calc(0.35 + (var(--p, 1) - ${threshold}) * 8), 1)`,
});

const fadeAt = (threshold: number): React.CSSProperties => ({
  opacity: `clamp(0, calc((var(--p, 1) - ${threshold}) * 10), 1)`,
});

const fadeOut = (threshold: number): React.CSSProperties => ({
  opacity: `clamp(0, calc(1 - (var(--p, 1) - ${threshold}) * 10), 1)`,
});

// Visible only between two progress thresholds (stage storyboard panels).
const windowAt = (start: number, end: number): React.CSSProperties => ({
  opacity: `calc(clamp(0, (var(--p, 1) - ${start}) * 6, 1) - clamp(0, (var(--p, 1) - ${end}) * 6, 1))`,
});

// "How it works": a timeline whose rail fills as you scroll. On tall desktop
// viewports the section pins and a shared stage card on the right plays the
// upload -> ask -> verify storyboard; on mobile each step carries its own
// visual inline, so nothing pins and nothing clips.
export default function Steps({ section }: { section: LandingSection }) {
  const items = section.items ?? [];
  const minis = [UploadMini, AskMini, VerifyMini];

  return (
    <ScrollDraw sticky>
      <section id="how-it-works" className="relative scroll-mt-20 lg:tall:h-[260vh]">
        <div className="bg-mist relative overflow-hidden lg:tall:sticky lg:tall:top-0 lg:tall:flex lg:tall:h-screen lg:tall:flex-col lg:tall:justify-center">
          <div className="bg-dot-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" aria-hidden />
          <div className="bg-noise absolute inset-0 opacity-[0.04]" aria-hidden />
          <div aria-hidden className="bg-sea/10 absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl" />
          <div aria-hidden className="bg-grape/10 absolute -right-24 -bottom-24 h-80 w-80 rounded-full blur-3xl" />

          <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:tall:py-10">
            <SectionHeader eyebrow="How it works" heading={section.heading} subheading={section.subheading} body={section.body} />

            <div className="mx-auto mt-12 grid max-w-xl gap-12 lg:mt-14 lg:max-w-none lg:grid-cols-2 lg:items-center lg:gap-16">
              {/* Timeline: the gradient rail fills with scroll progress. */}
              <ol className="relative space-y-10 lg:space-y-12">
                <div aria-hidden className="absolute top-4 bottom-4 left-7 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="bg-brand-gradient h-full w-full origin-top rounded-full"
                    style={{ transform: "scaleY(var(--p, 1))" }}
                  />
                </div>

                {items.map((item, i) => {
                  const Mini = minis[i % minis.length];
                  const at = STEP_AT[i] ?? 0.72;
                  // Capped so the ×10 fade slope fully resolves by --p = 1.
                  const checkAt = Math.min(at + 0.2, 0.9);
                  return (
                    <li key={i} className="relative flex gap-5" style={activate(at)}>
                      <div className="bg-brand-gradient shadow-glow relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white">
                        <span className="col-start-1 row-start-1" style={fadeOut(checkAt)}>
                          {i + 1}
                        </span>
                        <span className="col-start-1 row-start-1" style={fadeAt(checkAt)}>
                          <CheckIcon className="h-6 w-6" />
                        </span>
                      </div>
                      <div className="pt-1">
                        <h3 className="text-ink text-xl font-semibold">{item.title}</h3>
                        <p className="mt-2 max-w-md leading-relaxed text-slate-600">{item.description}</p>
                        {/* Inline visual on small screens; the shared stage covers lg. */}
                        <div className="mt-5 max-w-72 lg:hidden" style={fadeAt(at + 0.06)} aria-hidden>
                          <Mini />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Shared stage: one product frame whose scene follows the active step. */}
              <div className="relative hidden lg:block" aria-hidden>
                <div className="bg-sea/15 animate-blob absolute -top-10 -left-8 h-56 w-56 rounded-full blur-3xl" />
                <div className="bg-grape/15 animate-blob absolute -right-6 -bottom-10 h-64 w-64 rounded-full blur-3xl [animation-delay:-8s]" />
                <div className="glass card-gradient-border shadow-panel relative overflow-hidden rounded-3xl p-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                      <DocumentsIcon className="text-sea h-3.5 w-3.5" />
                      annual-report-2026.pdf
                      <span className="text-slate-400">· 84 pages</span>
                    </span>
                    <span className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                      <span className="bg-brand-gradient h-2.5 w-2.5 rounded-full" />
                    </span>
                  </div>

                  <div className="relative mt-5 h-72">
                    <div className="absolute inset-0" style={windowAt(0, STEP_AT[1])}>
                      <UploadStage />
                    </div>
                    <div className="absolute inset-0" style={windowAt(STEP_AT[1], STEP_AT[2])}>
                      <AskStage />
                    </div>
                    <div className="absolute inset-0" style={windowAt(STEP_AT[2], 2)}>
                      <VerifyStage />
                    </div>
                  </div>

                  <div className="mt-5 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="bg-brand-gradient h-full origin-left rounded-full"
                      style={{ transform: "scaleX(var(--p, 1))" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </ScrollDraw>
  );
}

// ---------------------------------------------------------------------------
// Stage scenes (desktop) and their compact inline variants (mobile).
// ---------------------------------------------------------------------------

function UploadStage() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 backdrop-blur-sm">
      <div className="bg-ice text-sea grid h-16 w-16 place-items-center rounded-2xl">
        <DocumentsIcon className="h-8 w-8" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600">Drop annual-report-2026.pdf</p>
      <p className="mt-1 text-xs text-slate-400">PDF · DOCX · PPTX · TXT</p>
      <div className="mt-5 h-2 w-56 overflow-hidden rounded-full bg-slate-200">
        <div
          className="bg-brand-gradient h-full rounded-full"
          style={{ width: "calc(clamp(0, (var(--p, 1) - 0.1) * 4, 1) * 100%)" }}
        />
      </div>
    </div>
  );
}

function AskStage() {
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="bg-brand-gradient ml-12 rounded-2xl rounded-br-md px-4 py-3 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,104,248,0.22)]">
        What are the payment terms, and do they change after year one?
      </div>
      <div className="mr-12 flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
      <p className="text-center text-xs font-medium text-slate-400">Reading 84 pages so you don&apos;t have to</p>
    </div>
  );
}

function VerifyStage() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="mr-8 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
        Net 30 from invoice date in year one, then Net 45 after renewal. A 1.5% monthly late fee applies.
        <span className="bg-lavender-soft text-grape mt-2 flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold">
          <CitationIcon className="h-3 w-3" />
          Section 4.2 · p. 12
        </span>
      </div>
      <div className="border-sea/20 bg-ice/60 ml-8 rounded-xl border p-3">
        <p className="text-sea text-[10px] font-bold tracking-wide uppercase">Matched passage · p. 12</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          &ldquo;Invoices are payable within thirty (30) days… forty-five (45) days following renewal.&rdquo;
        </p>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100">
          <CheckIcon className="h-2.5 w-2.5" />
        </span>
        Citation verified
      </p>
    </div>
  );
}

function UploadMini() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 p-4 backdrop-blur-sm">
      <DocumentsIcon className="text-sea mx-auto h-6 w-6" />
      <p className="mt-2 text-center text-xs font-semibold text-slate-500">Drop annual-report.pdf</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="bg-brand-gradient h-full rounded-full"
          style={{ width: "calc(clamp(0, (var(--p, 1) - 0.1) * 4, 1) * 100%)" }}
        />
      </div>
    </div>
  );
}

function AskMini() {
  return (
    <div className="space-y-2">
      <div className="bg-brand-gradient ml-8 rounded-2xl rounded-br-md px-3 py-2 text-xs font-medium text-white shadow-md">
        What are the payment terms?
      </div>
      <div className="mr-8 flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 shadow-sm">
        <span className="animate-typing-dot h-1 w-1 rounded-full bg-slate-400" />
        <span className="animate-typing-dot h-1 w-1 rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="animate-typing-dot h-1 w-1 rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function VerifyMini() {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs leading-relaxed text-slate-600">Net 30 from invoice date, 1.5% late fee.</p>
      <span className="bg-lavender-soft text-grape mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold">
        <CitationIcon className="h-3 w-3" />
        Section 4.2 · p. 12
      </span>
    </div>
  );
}
