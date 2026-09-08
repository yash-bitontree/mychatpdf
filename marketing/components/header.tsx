"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Logo, { PRODUCT_NAME } from "@/components/logo";
import CapsuleNav from "@/components/capsule-nav";
import { APP_URL, type SiteSettings } from "@/lib/cms";

export default function Header({ settings }: { settings: SiteSettings }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close on navigation. Header lives in the persistent root layout, so this
  // must be state-from-previous-render, not an effect (which would also trip
  // the compiler's no-setState-in-effect rule).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 8);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const closeMenu = () => setOpen(false);

  // Lock page scroll while the mobile menu is open. globals.css sets
  // overflow-x: clip on <html>, which makes <html> the scroll container and
  // stops overflow from propagating off <body> — so locking body alone leaves
  // the page scrollable. Lock both, and pad for the removed scrollbar so the
  // layout doesn't shift. The menu's own scroll region uses overscroll-contain
  // so its inner scroll can't chain back out to the page.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const { body } = document;
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.paddingRight = prev.bodyPaddingRight;
    };
  }, [open]);

  // The menu is lg:hidden, so entering the desktop breakpoint must release the
  // open state (and its scroll lock).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const closeAndRefocus = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <>
      <header className="sticky top-0 z-40">
        {/* Content-aligned track: matches the page sections' mx-auto max-w-7xl
            px-4 sm:px-6 so the bar's edges line up with the page content. */}
        <div className="mx-auto flex max-w-7xl px-4 py-3 sm:px-6">
          <div className="relative isolate flex w-full items-center justify-between gap-2 rounded-full px-5 py-2">
            {/* Capsule skin: solid white fill + sea→grape hairline border + lift.
                Same width as the bar; fades in on scroll, so at the top the bar
                is transparent and only the capsule carries a background. */}
            <span
              aria-hidden
              className="shadow-panel absolute inset-0 -z-10 rounded-full transition-opacity duration-500 ease-out"
              style={{
                opacity: scrolled ? 1 : 0,
                background:
                  "linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg, var(--color-sea), var(--color-grape)) border-box",
                border: "1.5px solid transparent",
              }}
            />

            <Link
              href="/"
              aria-label={`${PRODUCT_NAME} home`}
              onClick={closeMenu}
              className="shrink-0"
            >
              <Logo />
            </Link>

            <CapsuleNav items={settings.navItems} pathname={pathname} className="hidden lg:flex" />

            <div className="hidden shrink-0 items-center gap-1 lg:flex">
              <a
                href={APP_URL}
                className="text-ink/70 hover:text-ink rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
              >
                Sign in
              </a>
              <a
                href={APP_URL}
                className="bg-brand-gradient hover:shadow-glow shadow-sea/25 group inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:-translate-y-px"
              >
                Get started free
                <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            </div>

            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="bg-brand-gradient relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md lg:hidden"
            >
              <span className="absolute h-0.5 w-4.5 -translate-y-[5px] rounded-full bg-white" />
              <span className="absolute h-0.5 w-4.5 rounded-full bg-white" />
              <span className="absolute h-0.5 w-4.5 translate-y-[5px] rounded-full bg-white" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu: a self-contained fixed overlay above the header. The close
          button and logo live in a non-scrolling top bar here (not in the
          sticky header) — locking page scroll un-pins a sticky element, so a
          header-hosted close button would scroll away. Only the links region
          scrolls, and it can't chain out to the (locked) page. The top bar's
          padding mirrors the header (px-4/6 track + px-5 capsule) so the logo
          and close button sit exactly where the header's did. */}
      <div
        id="mobile-menu"
        inert={!open}
        className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-white transition-[opacity,transform] duration-300 ease-out lg:hidden ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-9 py-3 sm:px-11">
          <Link href="/" aria-label={`${PRODUCT_NAME} home`} onClick={closeMenu}>
            <Logo />
          </Link>
          <button
            type="button"
            onClick={closeAndRefocus}
            aria-label="Close menu"
            className="bg-brand-gradient relative flex h-10 w-10 items-center justify-center rounded-full shadow-md"
          >
            <span className="absolute h-0.5 w-4.5 rotate-45 rounded-full bg-white" />
            <span className="absolute h-0.5 w-4.5 -rotate-45 rounded-full bg-white" />
          </button>
        </div>

        <nav
          aria-label="Mobile"
          className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {settings.navItems.map((item, i) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                aria-current={active ? "page" : undefined}
                style={{ transitionDelay: open ? `${60 + i * 45}ms` : "0ms" }}
                className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-lg font-semibold transition-[opacity,transform] duration-300 ${
                  active ? "bg-ice text-ink" : "text-ink/80 hover:bg-mist active:bg-ice"
                } ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
              >
                {item.label}
                <span aria-hidden className="text-slate-300">
                  →
                </span>
              </Link>
            );
          })}
          <div
            style={{ transitionDelay: open ? `${60 + settings.navItems.length * 45}ms` : "0ms" }}
            className={`mt-auto flex flex-col gap-3 border-t border-slate-100 pt-5 transition-[opacity,transform] duration-300 ${
              open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <a
              href={APP_URL}
              className="border-ink/10 text-ink rounded-full border px-5 py-3 text-center text-base font-semibold"
            >
              Sign in
            </a>
            <a
              href={APP_URL}
              className="bg-brand-gradient shadow-sea/25 rounded-full px-5 py-3.5 text-center text-base font-semibold text-white shadow-md"
            >
              Get started free
            </a>
          </div>
        </nav>
      </div>
    </>
  );
}
