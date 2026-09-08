import Reveal from "@/components/motion/reveal";

type Props = {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  /** Optional longer supporting text (the CMS landingSection body field). */
  body?: string;
  dark?: boolean;
};

// Shared centered intro block used by most landing sections.
export default function SectionHeader({ eyebrow, heading, subheading, body, dark }: Props) {
  if (!eyebrow && !heading && !subheading && !body) return null;
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <Reveal>
          <p className="text-sea text-sm font-semibold tracking-[0.16em] uppercase">{eyebrow}</p>
        </Reveal>
      )}
      {heading && (
        <Reveal delay={80}>
          <h2
            className={`mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl ${
              dark ? "text-white" : "text-ink"
            }`}
          >
            {heading}
          </h2>
        </Reveal>
      )}
      {subheading && (
        <Reveal delay={160}>
          <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-slate-400" : "text-slate-600"}`}>{subheading}</p>
        </Reveal>
      )}
      {body && (
        <Reveal delay={220}>
          <p className={`mt-3 leading-relaxed ${dark ? "text-slate-400" : "text-slate-500"}`}>{body}</p>
        </Reveal>
      )}
    </div>
  );
}
