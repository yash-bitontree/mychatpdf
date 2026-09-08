import HeroDemo from "@/components/hero-demo";
import Parallax from "@/components/motion/parallax";
import { BoltIcon, CheckIcon } from "@/components/icons";

// Decorative hero scene: gradient blobs, a network SVG that draws itself in,
// and a floating chat-mockup card. Layers drift at different parallax speeds.
export default function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg select-none">
      {/* Back layer: soft gradient blobs */}
      <Parallax speed={0.06} className="absolute inset-0">
        <div className="bg-sea/25 animate-blob absolute -top-10 -left-8 h-64 w-64 rounded-full blur-3xl" />
        <div className="bg-grape/25 animate-blob absolute -right-6 bottom-0 h-72 w-72 rounded-full blur-3xl [animation-delay:-8s]" />
      </Parallax>

      {/* Mid layer: neural network echoing the logo mark */}
      <Parallax speed={0.16} className="absolute inset-x-0 -top-8">
        <NetworkSvg />
      </Parallax>

      {/* Front layer: self-playing chat demo */}
      <Parallax speed={0.24} className="relative">
        <div className="glass card-gradient-border shadow-panel relative rounded-3xl p-5 sm:p-6">
          <HeroDemo />
        </div>

        {/* Floating badges: tucked inside the card on phones so they never
            overlap the hero copy above. */}
        <div className="animate-float absolute -top-3 right-1 flex items-center gap-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg shadow-slate-900/5 sm:-top-6 sm:-right-8">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckIcon className="h-3 w-3" />
          </span>
          Citation verified
        </div>
        <div className="animate-float-slow absolute -bottom-3 left-1 flex items-center gap-1.5 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg shadow-slate-900/5 sm:-bottom-5 sm:-left-8">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <BoltIcon className="h-3 w-3" />
          </span>
          Answered in seconds
        </div>
      </Parallax>
    </div>
  );
}

const NODES: Array<[number, number, number]> = [
  [40, 36, 5], [96, 18, 8], [150, 44, 6], [210, 22, 9], [268, 50, 5],
  [72, 78, 7], [136, 92, 10], [204, 76, 6], [252, 96, 8], [312, 70, 6],
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 5], [2, 6], [5, 6],
  [3, 7], [6, 7], [4, 8], [7, 8], [8, 9], [4, 9], [6, 8],
];

function NetworkSvg() {
  return (
    <svg viewBox="0 0 352 120" className="w-full opacity-80">
      <defs>
        <linearGradient id="hero-net" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-sea)" />
          <stop offset="100%" stopColor="var(--color-grape)" />
        </linearGradient>
      </defs>
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a][0]}
          y1={NODES[a][1]}
          x2={NODES[b][0]}
          y2={NODES[b][1]}
          stroke="url(#hero-net)"
          strokeWidth="1.4"
          strokeDasharray="120"
          strokeDashoffset="120"
          className="animate-draw"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
      {NODES.map(([x, y, r], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill="url(#hero-net)"
          className="animate-pulse-soft"
          style={{ animationDelay: `${i * 260}ms` }}
        />
      ))}
    </svg>
  );
}
