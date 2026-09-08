"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentsIcon } from "@/components/icons";

type Exchange = { file: string; pages: string; question: string; answer: string; cite: string };

const SCRIPT: Exchange[] = [
  {
    file: "annual-report-2026.pdf",
    pages: "84 pages",
    question: "What drove revenue growth this year?",
    answer: "Revenue grew 34%, driven primarily by enterprise subscriptions and the new API tier.",
    cite: "Source · p. 14",
  },
  {
    file: "msa-draft-v2.pdf",
    pages: "2 files",
    question: "What changed between the contract drafts?",
    answer: "Draft B adds a 30-day termination clause and caps liability at 12 months of fees.",
    cite: "MSA-v2 · p. 18",
  },
  {
    file: "apartment-lease.pdf",
    pages: "12 pages",
    question: "When is the security deposit returned?",
    answer: "Within 21 days of move-out, less any documented damages.",
    cite: "Lease · p. 3",
  },
];

type Phase = "typing" | "thinking" | "streaming" | "done";

const TYPE_MS = 34;
const WORD_MS = 70;
const THINK_MS = 750;
const HOLD_MS = 3200;

// Self-playing product demo: the question types itself, the answer streams
// in word by word, the citation pops, then the next exchange loops. Runs
// only while visible; reduced-motion users see a completed exchange.
export default function HeroDemo() {
  const [exchangeIndex, setExchangeIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [charCount, setCharCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [animated, setAnimated] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const exchange = SCRIPT[exchangeIndex];
  const answerWords = exchange.answer.split(" ");

  // Run the loop only while visible and motion is welcome; leaving the
  // viewport pauses it and rewinds the current exchange.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setAnimated(entry.isIntersecting);
        if (!entry.isIntersecting) {
          setPhase("typing");
          setCharCount(0);
          setWordCount(0);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animated) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (charCount < exchange.question.length) {
        timer = setTimeout(() => setCharCount((c) => c + 1), TYPE_MS);
      } else {
        timer = setTimeout(() => setPhase("thinking"), 350);
      }
    } else if (phase === "thinking") {
      timer = setTimeout(() => setPhase("streaming"), THINK_MS);
    } else if (phase === "streaming") {
      if (wordCount < answerWords.length) {
        timer = setTimeout(() => setWordCount((w) => w + 1), WORD_MS);
      } else {
        timer = setTimeout(() => setPhase("done"), 250);
      }
    } else {
      timer = setTimeout(() => {
        setExchangeIndex((i) => (i + 1) % SCRIPT.length);
        setPhase("typing");
        setCharCount(0);
        setWordCount(0);
      }, HOLD_MS);
    }
    return () => clearTimeout(timer);
  }, [animated, phase, charCount, wordCount, exchange.question.length, answerWords.length]);

  // Static completed exchange until the loop starts (SSR, reduced motion).
  const question = animated ? exchange.question.slice(0, charCount) : exchange.question;
  const streamedAnswer = animated ? answerWords.slice(0, wordCount).join(" ") : exchange.answer;
  const showAnswer = !animated || phase === "streaming" || phase === "done";
  const showCite = !animated || phase === "done";
  const showThinking = animated && phase === "thinking";

  return (
    <div ref={rootRef}>
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <span className="bg-brand-gradient inline-block h-2 w-2 animate-pulse rounded-full" aria-hidden />
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          <DocumentsIcon className="text-sea h-3.5 w-3.5" />
          {exchange.file}
          <span className="text-slate-400">· {exchange.pages}</span>
        </div>
      </div>

      <div className="mt-5 flex min-h-10 justify-end">
        {question && (
          <div className="bg-brand-gradient max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(32,104,248,0.22)]">
            {question}
            {animated && phase === "typing" && (
              <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-white/90 align-middle" />
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex min-h-24 justify-start">
        {showThinking && (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
            <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:300ms]" />
          </div>
        )}
        {showAnswer && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {streamedAnswer}
            {showCite && (
              <span className="bg-lavender-soft text-grape mt-2 ml-1 inline-flex origin-left scale-100 animate-[pop-in_0.35s_var(--ease-out-expo)] items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold">
                {exchange.cite}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
