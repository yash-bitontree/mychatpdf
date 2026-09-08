import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/contact-form";
import PageHero from "@/components/page-hero";
import Reveal from "@/components/motion/reveal";
import ScrollDraw from "@/components/motion/scroll-draw";
import { PaperPlaneScene } from "@/components/route-scenes";
import { MailIcon, PhoneIcon, MapPinIcon } from "@/components/icons";
import { getPage, getSiteSettings } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("contact");
  return {
    title: page?.seoTitle ?? "Contact",
    description:
      page?.seoDescription ?? "Get in touch with the MyPDFChat team. We usually reply within one business day.",
  };
}

export default async function ContactPage() {
  const [page, settings] = await Promise.all([getPage("contact"), getSiteSettings()]);
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={page?.title && page.title.toLowerCase() !== "contact" ? page.title : "Contact us"}
        subtitle={page?.body ?? "Questions about the product, pricing, or your account? Send us a message."}
      />
      <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        {/* Paper plane rides the dashed path as you scroll; message on its way. */}
        <ScrollDraw className="pointer-events-none absolute -top-16 right-0 left-0">
          <PaperPlaneScene className="top-0 right-4 h-36 w-[30rem] opacity-60" />
        </ScrollDraw>
        <div className="relative grid gap-10 lg:grid-cols-5 lg:gap-14">
          <Reveal direction="left" className="h-full lg:col-span-3">
            <div className="card-gradient-border shadow-panel h-full rounded-2xl p-6 sm:p-8">
              <ContactForm />
            </div>
          </Reveal>
          <Reveal direction="right" className="lg:col-span-2">
            <div className="space-y-8">
              {settings.contactEmail && (
                <div className="flex items-start gap-4">
                  <div className="bg-ice text-sea flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                    <MailIcon className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h2 className="text-ink text-sm font-semibold">Email</h2>
                    <a
                      href={`mailto:${settings.contactEmail}`}
                      className="hover:text-sea mt-1 block text-slate-600 transition-colors"
                    >
                      {settings.contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {settings.contactPhone && (
                <div className="flex items-start gap-4">
                  <div className="bg-lavender-soft text-grape flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                    <PhoneIcon className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h2 className="text-ink text-sm font-semibold">Phone</h2>
                    <a
                      href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}
                      className="hover:text-sea mt-1 block text-slate-600 transition-colors"
                    >
                      {settings.contactPhone}
                    </a>
                  </div>
                </div>
              )}
              {settings.address && (
                <div className="flex items-start gap-4">
                  <div className="bg-ice text-sea flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                    <MapPinIcon className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h2 className="text-ink text-sm font-semibold">Office</h2>
                    <p className="mt-1 leading-relaxed text-slate-600">{settings.address}</p>
                  </div>
                </div>
              )}
              <div className="bg-ice rounded-2xl p-6">
                <h2 className="text-ink text-sm font-semibold">Response time</h2>
                <p className="mt-1 leading-relaxed text-slate-600">We usually reply within one business day.</p>
                <p className="mt-3 leading-relaxed text-slate-600">
                  Looking for a quick answer?{" "}
                  <Link href="/faq" className="text-sea font-semibold hover:underline">
                    Browse the FAQ
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
