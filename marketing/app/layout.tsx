import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { getSiteSettings, SITE_URL } from "@/lib/cms";
import { DEFAULT_OG_IMAGE, DEFAULT_SEO_DESCRIPTION, DEFAULT_SEO_TITLE } from "@/lib/seo";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: DEFAULT_SEO_TITLE,
      template: `%s | ${settings.siteName}`,
    },
    description: DEFAULT_SEO_DESCRIPTION,
    openGraph: {
      title: DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      siteName: settings.siteName,
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2068f8",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.companyName ?? settings.siteName,
    url: SITE_URL,
    logo: `${SITE_URL}/logo-horizontal.png`,
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteName,
    url: SITE_URL,
    ...(settings.defaultSeoDescription ? { description: settings.defaultSeoDescription } : {}),
  };

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Gates reveal-animation hidden states so content stays visible without JS. */}
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add("js")` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className="text-ink flex min-h-full flex-col bg-white font-sans">
        <a
          href="#main"
          className="bg-brand-gradient sr-only z-50 rounded-full px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Header settings={settings} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer settings={settings} />
        <Script id="statcounter-config" strategy="afterInteractive">
          {`var sc_project=13336878;
var sc_invisible=1;
var sc_security="45a0ee63";`}
        </Script>
        <Script
          id="statcounter-script"
          src="https://www.statcounter.com/counter/counter.js"
          strategy="afterInteractive"
        />
        <noscript
          dangerouslySetInnerHTML={{
            __html:
              '<div class="statcounter"><a title="free hit counter" href="https://statcounter.com/" target="_blank"><img class="statcounter" src="https://c.statcounter.com/13336878/0/45a0ee63/1/" alt="free hit counter" referrerpolicy="no-referrer-when-downgrade"></a></div>',
          }}
        />
      </body>
    </html>
  );
}
