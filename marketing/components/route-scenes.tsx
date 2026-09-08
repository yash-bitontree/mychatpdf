import ScrollDraw from "@/components/motion/scroll-draw";

// Scroll-linked SVG scenes, one metaphor per route (see README "Motion"):
// services = document pipeline, about = milestone curve, faq = question mark
// that answers itself, contact/blog = paper plane in flight. All decorative
// (aria-hidden); ScrollDraw exposes progress as --p for the pop-in accents.

const nodeStyle = (threshold: number) => ({
  opacity: `clamp(0, calc((var(--p, 0) - ${threshold}) * 8), 1)` as string,
});

// Vertical "document journey" spine for the services page: the line draws
// down the page and a node lights up as each service block passes.
export function PipelineSpine({ children }: { children: React.ReactNode }) {
  return (
    <ScrollDraw className="relative">
      <svg
        aria-hidden
        viewBox="0 0 60 1200"
        preserveAspectRatio="none"
        fill="none"
        className="pointer-events-none absolute inset-y-6 left-2 hidden w-10 xl:left-8 xl:block"
      >
        <defs>
          <linearGradient id="spine-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-sea)" />
            <stop offset="100%" stopColor="var(--color-grape)" />
          </linearGradient>
        </defs>
        <path
          data-draw
          d="M30 0 C52 80 8 160 30 240 C52 320 8 400 30 480 C52 560 8 640 30 720 C52 800 8 880 30 960 C52 1040 8 1120 30 1200"
          stroke="url(#spine-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        {[0.2, 0.45, 0.7].map((threshold, i) => (
          <circle
            key={i}
            cx="30"
            cy={240 + i * 360}
            r="7"
            fill="url(#spine-line)"
            style={nodeStyle(threshold)}
          />
        ))}
      </svg>
      {children}
    </ScrollDraw>
  );
}

// Milestone S-curve for the about page, drawn behind the article.
export function TimelineCurve() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 60 800"
      preserveAspectRatio="none"
      fill="none"
      className="pointer-events-none absolute inset-y-10 right-3 hidden w-10 lg:block xl:right-10"
    >
      <defs>
        <linearGradient id="timeline-line" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-sea)" />
          <stop offset="100%" stopColor="var(--color-grape)" />
        </linearGradient>
      </defs>
      <path
        data-draw
        d="M30 0 C52 70 8 140 30 210 C52 280 8 350 30 420 C52 490 8 560 30 630 C48 690 30 750 30 800"
        stroke="url(#timeline-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.45"
      />
      {[0.25, 0.5, 0.75].map((threshold, i) => (
        <circle
          key={i}
          cx="30"
          cy={210 + i * 210}
          r="7"
          fill="url(#timeline-line)"
          style={nodeStyle(threshold)}
        />
      ))}
    </svg>
  );
}

// Question mark that draws itself as the FAQ list scrolls; the dot pops in
// at the end — "all questions answered".
export function QuestionMarkScene() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 300"
      fill="none"
      className="pointer-events-none absolute top-24 -right-8 hidden h-72 w-48 rotate-6 lg:block xl:-right-16"
    >
      <defs>
        <linearGradient id="qmark-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-sea)" />
          <stop offset="100%" stopColor="var(--color-grape)" />
        </linearGradient>
      </defs>
      <path
        data-draw
        d="M55 85 C55 25 145 25 145 85 C145 130 102 122 102 175 L102 195"
        stroke="url(#qmark-line)"
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.18"
      />
      <circle cx="102" cy="245" r="12" fill="url(#qmark-line)" style={{ ...nodeStyle(0.85), fillOpacity: 0.25 }} />
    </svg>
  );
}

// Paper plane flying along a dashed trajectory. Used on the contact page
// ("message on its way") and the blog hero ("notes in flight").
export function PaperPlaneScene({ className }: { className?: string }) {
  const pathId = "flight-path";
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 200"
      fill="none"
      className={`pointer-events-none absolute hidden lg:block ${className ?? "top-10 right-0 h-40 w-[34rem] opacity-70"}`}
    >
      <path
        id={pathId}
        d="M20 160 C140 40 280 185 400 95 C470 42 540 55 585 40"
        stroke="none"
        fill="none"
      />
      <path
        data-draw
        d="M20 160 C140 40 280 185 400 95 C470 42 540 55 585 40"
        stroke="var(--color-sea)"
        strokeWidth="2"
        strokeDasharray="1 10"
        strokeLinecap="round"
        opacity="0.5"
      />
      <g data-follow={`#${pathId}`}>
        <path
          d="M0 0 L-22 9 L-15 0 L-22 -9 Z"
          fill="var(--color-grape)"
          opacity="0.8"
        />
      </g>
    </svg>
  );
}

// Shield that draws once for legal pages — deliberate restraint: trust pages
// get a single quiet flourish, not a scene.
export function ShieldBadge() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="url(#shield-line)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-12 w-12"
    >
      <defs>
        <linearGradient id="shield-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-sea)" />
          <stop offset="100%" stopColor="var(--color-grape)" />
        </linearGradient>
      </defs>
      <path
        d="M24 44s16-7 16-19V10L24 4 8 10v15c0 12 16 19 16 19Z"
        strokeDasharray="140"
        strokeDashoffset="140"
        className="animate-draw"
      />
      <path
        d="m17 23 5 5 9-10"
        strokeDasharray="30"
        strokeDashoffset="30"
        className="animate-draw [animation-delay:600ms]"
      />
    </svg>
  );
}
