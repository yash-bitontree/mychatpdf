import type { LandingSection } from "@/lib/cms";
import Hero from "@/components/sections/hero";
import Logos from "@/components/sections/logos";
import Features from "@/components/sections/features";
import Steps from "@/components/sections/steps";
import Stats from "@/components/sections/stats";
import Testimonials from "@/components/sections/testimonials";
import UseCases from "@/components/sections/use-cases";
import FaqPreview from "@/components/sections/faq-preview";
import Cta from "@/components/sections/cta";

export default function Sections({ sections }: { sections: LandingSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <Section key={i} section={s} firstSection={i === 0} />
      ))}
    </>
  );
}

function Section({ section, firstSection }: { section: LandingSection; firstSection: boolean }) {
  switch (section.variant) {
    case "hero":
      return <Hero section={section} firstSection={firstSection} />;
    case "logos":
      return <Logos section={section} />;
    case "features":
      return <Features section={section} />;
    case "steps":
      return <Steps section={section} />;
    case "stats":
      return <Stats section={section} />;
    case "testimonial":
      return <Testimonials section={section} />;
    case "usecases":
      return <UseCases section={section} />;
    case "faq":
      return <FaqPreview section={section} />;
    case "cta":
      return <Cta section={section} />;
    default:
      return null;
  }
}
