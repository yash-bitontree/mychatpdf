import Parallax from "@/components/motion/parallax";

// Decorative document/chat/node glyphs floating in section backgrounds.
// Each layer drifts at its own parallax speed, so they move against each
// other while scrolling. Purely visual; hidden from assistive tech.
export default function SectionDecor({ flip }: { flip?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 hidden overflow-hidden lg:block ${flip ? "-scale-x-100" : ""}`}>
      <Parallax speed={-0.12} className="absolute top-24 left-[4%]">
        <DocGlyph className="text-sea/20 h-14 w-14 rotate-[-8deg]" />
      </Parallax>
      <Parallax speed={0.18} className="absolute top-1/2 left-[2%]">
        <NodeGlyph className="text-grape/25 h-20 w-20" />
      </Parallax>
      <Parallax speed={-0.2} className="absolute right-[3%] bottom-24">
        <BubbleGlyph className="text-sea/20 h-12 w-12 rotate-6" />
      </Parallax>
      <Parallax speed={0.1} className="absolute top-20 right-[6%]">
        <NodeGlyph className="text-sea/15 h-12 w-12" />
      </Parallax>
    </div>
  );
}

function DocGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M30 6H14a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4V14l-8-8Z" />
      <path d="M29 6v9h9M17 24h14M17 31h9" />
    </svg>
  );
}

function BubbleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M42 22c0 8.8-8 16-18 16-2.2 0-4.4-.35-6.4-1L6 40l3.2-8.4A14.9 14.9 0 0 1 6 22C6 13.2 14 6 24 6s18 7.2 18 16Z" />
      <path d="M16 20h16M16 26h10" />
    </svg>
  );
}

function NodeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="10" cy="38" r="4" fill="currentColor" stroke="none" />
      <circle cx="24" cy="12" r="5" fill="currentColor" stroke="none" />
      <circle cx="40" cy="30" r="3.5" fill="currentColor" stroke="none" />
      <path d="M12.5 35 21 16m5.5 0L38 27.5M13.5 37.5 36.5 30" />
    </svg>
  );
}
