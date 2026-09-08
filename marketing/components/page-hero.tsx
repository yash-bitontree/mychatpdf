import Reveal from "@/components/motion/reveal";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

// Shared hero band for inner pages (services, blog, faq, contact, legal).
export default function PageHero({ eyebrow, title, subtitle, children }: Props) {
  return (
    <section className="bg-hero-wash relative overflow-hidden">
      <div
        className="bg-dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-20">
        {eyebrow && (
          <Reveal>
            <p className="text-sea text-sm font-semibold tracking-[0.16em] uppercase">{eyebrow}</p>
          </Reveal>
        )}
        <Reveal delay={80}>
          <h1 className="text-ink mx-auto mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
        </Reveal>
        {subtitle && (
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{subtitle}</p>
          </Reveal>
        )}
        {children && <Reveal delay={240}>{children}</Reveal>}
      </div>
    </section>
  );
}
