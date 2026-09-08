import Link from "next/link";
import { MailIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import Logo from "@/components/logo";
import type { SiteSettings } from "@/lib/cms";

export default function Footer({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="bg-ink relative overflow-hidden text-slate-300">
      <div className="bg-dot-grid-dark absolute inset-0 opacity-30" aria-hidden />
      <div
        aria-hidden
        className="bg-grape/20 absolute -top-32 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full blur-3xl"
      />

      {/* Extra mobile bottom padding keeps the copyright row clear of the
          fixed mobile CTA bar. */}
      <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-32 sm:px-6 md:pb-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="inline-flex rounded-lg bg-white px-2 py-1">
              <Logo className="h-9 w-auto" />
            </span>
            {settings.tagline && <p className="mt-3 text-sm leading-relaxed text-slate-400">{settings.tagline}</p>}
            <div className="mt-5 space-y-2.5 text-sm text-slate-400">
              {settings.contactEmail && (
                <p className="flex items-center gap-2.5">
                  <MailIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  <a href={`mailto:${settings.contactEmail}`} className="transition-colors hover:text-white">
                    {settings.contactEmail}
                  </a>
                </p>
              )}
              {settings.contactPhone && (
                <p className="flex items-center gap-2.5">
                  <PhoneIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  {settings.contactPhone}
                </p>
              )}
              {settings.address && (
                <p className="flex items-start gap-2.5">
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  {settings.address}
                </p>
              )}
            </div>
          </div>

          {settings.footerColumns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold tracking-wide text-white uppercase">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="group inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      <span className="bg-brand-gradient h-px w-0 transition-all duration-300 group-hover:w-3" aria-hidden />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} {settings.footerText ?? settings.siteName}
          </p>
          <p className="text-sm text-slate-400">Built for people who read for a living.</p>
        </div>
      </div>
    </footer>
  );
}
